import Anthropic from "@anthropic-ai/sdk"
import CheckpointTracker from "@integrations/checkpoints/CheckpointTracker"
import getFolderSize from "get-folder-size"
import * as vscode from "vscode"
import { findLastIndex } from "@/shared/array"
import { combineApiRequests } from "@/shared/combineApiRequests"
import { combineCommandSequences } from "@/shared/combineCommandSequences"
import { ClineMessage } from "@/shared/ExtensionMessage"
import { getApiMetrics } from "@/shared/getApiMetrics"
import { HistoryItem } from "@/shared/HistoryItem"
import { getCwd, getDesktopDir } from "@/utils/path"
import { ensureTaskDirectoryExists, saveApiConversationHistory, saveClineMessages } from "../storage/disk"
import { TaskState } from "./TaskState"

interface MessageStateHandlerParams {
	context: vscode.ExtensionContext
	taskId: string
	ulid: string
	taskIsFavorited?: boolean
	updateTaskHistory: (historyItem: HistoryItem) => Promise<HistoryItem[]>
	taskState: TaskState
	checkpointTrackerErrorMessage?: string
}

/**
 * 세션별로 대화 기록을 분리해서 관리
 * 모드가 바뀔 때마다 새로운 세션이 생성되어 별도의 대화 기록을 유지함
 */
export class SessionBasedConversationHistory {
	private sessionHistories: {
		sessionId: number
		mode: number
		messages: Anthropic.MessageParam[]
	}[] = []
	private currentSessionId: number = 0
	private currentMode: number | null = null

	constructor() {}

	// 현재 모드를 가져옴
	getCurrentMode(): number | null {
		return this.currentMode
	}

	/**
	 * 현재 모드를 설정하고 필요시 새 세션을 생성
	 * 모드가 바뀔 때마다 새로운 세션이 생성되어 별도의 대화 기록을 유지함
	 */
	setCurrentMode(mode: number): void {
		if (this.currentMode === null) {
			// 처음으로 모드를 설정하는 경우
			this.currentMode = mode
			this.currentSessionId = 1
			this.sessionHistories.push({
				sessionId: this.currentSessionId,
				mode: mode,
				messages: [],
			})
		} else if (mode !== this.currentMode) {
			this.currentMode = mode
			this.currentSessionId++

			// 새로운 세션 생성
			this.sessionHistories.push({
				sessionId: this.currentSessionId,
				mode: mode,
				messages: [],
			})
		}
	}

	/**
	 * 특정 세션의 대화 기록을 가져옴
	 * 세션이 존재하지 않으면 빈 배열 반환
	 */
	getConversationHistory(sessionId?: number): Anthropic.MessageParam[] {
		const targetSessionId = sessionId || this.currentSessionId
		if (targetSessionId <= 0) {
			return []
		}
		const session = this.sessionHistories.find((s) => s.sessionId === targetSessionId)
		return session?.messages || []
	}

	// 현재 세션의 대화 기록을 가져옴
	getCurrentConversationHistory(): Anthropic.MessageParam[] {
		if (this.currentSessionId <= 0) {
			return []
		}
		return this.getConversationHistory(this.currentSessionId)
	}

	// 현재 세션의 대화 기록에 메시지 추가
	addToConversationHistory(message: Anthropic.MessageParam): void {
		if (this.currentSessionId <= 0) {
			// console.warn(`[SessionBasedConversationHistory] 메시지를 추가할 수 없음: 세션이 설정되지 않음`)
			return
		}
		const currentSession = this.sessionHistories.find((s) => s.sessionId === this.currentSessionId)
		if (currentSession) {
			currentSession.messages.push(message)
			// console.log(`[SessionBasedConversationHistory] 세션 ${this.currentSessionId} (모드 ${currentSession.mode})에 메시지 추가됨, 총 메시지 수: ${currentSession.messages.length}`)
		}
	}

	// 모든 대화 기록을 지움
	clearAllConversationHistories(): void {
		this.sessionHistories = []
		this.currentSessionId = 0
		this.currentMode = null
	}

	/**
	 * 세션 순서별로 대화 기록을 가져옴 (1번째, 2번째, 3번째 세션)
	 * @param sessionOrder - 세션 순서 (1은 첫 번째 세션, 2는 두 번째 세션, 등등)
	 * @returns { mode: number; messages: Anthropic.MessageParam[] } 또는 유효하지 않으면 null
	 */
	getConversationHistoryBySessionOrder(sessionOrder: number): { mode: number; messages: Anthropic.MessageParam[] } | null {
		if (sessionOrder <= 0 || sessionOrder > this.sessionHistories.length) {
			return null
		}

		const session = this.sessionHistories[sessionOrder - 1]
		return {
			mode: session.mode,
			messages: session.messages,
		}
	}

	// 총 대화 세션 수를 가져옴
	getTotalSessionCount(): number {
		return this.sessionHistories.length
	}
}

export class MessageStateHandler {
	private apiConversationHistory: Anthropic.MessageParam[] = []
	private clineMessages: ClineMessage[] = []
	private taskIsFavorited: boolean
	private checkpointTracker: CheckpointTracker | undefined
	private checkpointTrackerErrorMessage: string | undefined
	private updateTaskHistory: (historyItem: HistoryItem) => Promise<HistoryItem[]>
	private context: vscode.ExtensionContext
	private taskId: string
	private ulid: string
	private taskState: TaskState

	constructor(params: MessageStateHandlerParams) {
		this.context = params.context
		this.taskId = params.taskId
		this.ulid = params.ulid
		this.taskState = params.taskState
		this.taskIsFavorited = params.taskIsFavorited ?? false
		this.updateTaskHistory = params.updateTaskHistory
		this.checkpointTrackerErrorMessage = this.taskState.checkpointTrackerErrorMessage
	}

	setCheckpointTracker(tracker: CheckpointTracker | undefined) {
		this.checkpointTracker = tracker
	}

	getApiConversationHistory(): Anthropic.MessageParam[] {
		return this.apiConversationHistory
	}

	setApiConversationHistory(newHistory: Anthropic.MessageParam[]): void {
		this.apiConversationHistory = newHistory
	}

	getClineMessages(): ClineMessage[] {
		return this.clineMessages
	}

	setClineMessages(newMessages: ClineMessage[]) {
		this.clineMessages = newMessages
	}

	async saveClineMessagesAndUpdateHistory(): Promise<void> {
		try {
			await saveClineMessages(this.context, this.taskId, this.clineMessages)

			// combined as they are in ChatView
			const apiMetrics = getApiMetrics(combineApiRequests(combineCommandSequences(this.clineMessages.slice(1))))
			const taskMessage = this.clineMessages[0] // first message is always the task say
			const lastRelevantMessage =
				this.clineMessages[
					findLastIndex(
						this.clineMessages,
						(message) => !(message.ask === "resume_task" || message.ask === "resume_completed_task"),
					)
				]
			const taskDir = await ensureTaskDirectoryExists(this.context, this.taskId)
			let taskDirSize = 0
			try {
				// getFolderSize.loose silently ignores errors
				// returns # of bytes, size/1000/1000 = MB
				taskDirSize = await getFolderSize.loose(taskDir)
			} catch (error) {
				console.error("Failed to get task directory size:", taskDir, error)
			}
			const cwd = await getCwd(getDesktopDir())
			await this.updateTaskHistory({
				id: this.taskId,
				ulid: this.ulid,
				ts: lastRelevantMessage.ts,
				task: taskMessage.text ?? "",
				tokensIn: apiMetrics.totalTokensIn,
				tokensOut: apiMetrics.totalTokensOut,
				cacheWrites: apiMetrics.totalCacheWrites,
				cacheReads: apiMetrics.totalCacheReads,
				totalCost: apiMetrics.totalCost,
				size: taskDirSize,
				shadowGitConfigWorkTree: await this.checkpointTracker?.getShadowGitConfigWorkTree(),
				cwdOnTaskInitialization: cwd,
				conversationHistoryDeletedRange: this.taskState.conversationHistoryDeletedRange,
				isFavorited: this.taskIsFavorited,
				checkpointTrackerErrorMessage: this.taskState.checkpointTrackerErrorMessage,
			})
		} catch (error) {
			console.error("Failed to save cline messages:", error)
		}
	}

	async addToApiConversationHistory(message: Anthropic.MessageParam) {
		this.apiConversationHistory.push(message)
		await saveApiConversationHistory(this.context, this.taskId, this.apiConversationHistory)
	}

	async overwriteApiConversationHistory(newHistory: Anthropic.MessageParam[]): Promise<void> {
		this.apiConversationHistory = newHistory
		await saveApiConversationHistory(this.context, this.taskId, this.apiConversationHistory)
	}

	async addToClineMessages(message: ClineMessage) {
		// these values allow us to reconstruct the conversation history at the time this cline message was created
		// it's important that apiConversationHistory is initialized before we add cline messages
		message.conversationHistoryIndex = this.apiConversationHistory.length - 1 // NOTE: this is the index of the last added message which is the user message, and once the clinemessages have been presented we update the apiconversationhistory with the completed assistant message. This means when resetting to a message, we need to +1 this index to get the correct assistant message that this tool use corresponds to
		message.conversationHistoryDeletedRange = this.taskState.conversationHistoryDeletedRange
		this.clineMessages.push(message)
		await this.saveClineMessagesAndUpdateHistory()
	}

	async overwriteClineMessages(newMessages: ClineMessage[]) {
		this.clineMessages = newMessages
		await this.saveClineMessagesAndUpdateHistory()
	}

	async updateClineMessage(index: number, updates: Partial<ClineMessage>): Promise<void> {
		if (index < 0 || index >= this.clineMessages.length) {
			throw new Error(`Invalid message index: ${index}`)
		}

		// Apply updates to the message
		Object.assign(this.clineMessages[index], updates)

		// Save changes and update history
		await this.saveClineMessagesAndUpdateHistory()
	}
}
