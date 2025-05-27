export type AssistantMessageContent = TextContent | ToolUse

export { parseAssistantMessageV1, parseAssistantMessageV2 } from "./parse-assistant-message"

export interface TextContent {
	type: "text"
	content: string
	partial: boolean
}

export const toolUseNames = [
	"execute_command",
	"read_file",
	"write_to_file",
	"replace_in_file",
	"search_files",
	"list_files",
	"list_code_definition_names",
	"browser_action",
	"use_mcp_tool",
	"access_mcp_resource",
	"ask_followup_question",
	"plan_mode_respond",
	"load_mcp_documentation",
	"attempt_completion",
	"new_task",
	"condense",
	"report_bug",
	"new_rule",
] as const

// Converts array of tool call names into a union type ("execute_command" | "read_file" | ...)
export type ToolUseName = (typeof toolUseNames)[number]

export const toolParamNames = [
	"command",
	"requires_approval",
	"path",
	"content",
	"diff",
	"regex",
	"file_pattern",
	"recursive",
	"action",
	"url",
	"coordinate",
	"text",
	"server_name",
	"tool_name",
	"arguments",
	"uri",
	"question",
	"options",
	"response",
	"result",
	"context",
	"title",
	"what_happened",
	"steps_to_reproduce",
	"api_request_output",
	"additional_context",
] as const

export type ToolParamName = (typeof toolParamNames)[number]

export interface ToolUse {
	type: "tool_use"
	name: ToolUseName
	// params is a partial record, allowing only some or none of the possible parameters to be used
	params: Partial<Record<ToolParamName, string>>
	partial: boolean
}

export type PhaseStatus = "pending" | "approved"

export interface Subtask {
	description: string
	type: string // 'execute_command', 'write_to_file', etc.
	completed: boolean
}

export interface Phase {
	index: number
	// thinking field removed as per suggestion
	paths: string[]
	status: PhaseStatus
	phase_prompt: string
	subtasks: Subtask[]
}

export function parsePhases(raw: string): Phase[] {
	// First look for a Phase List section
	const phaseListSectionRegex = /(?:#{1,3}\s*)?Phase List(?:[\s\n]*)([\s\S]*?)(?=#{1,3}|$)/i
	const phaseListMatch = raw.match(phaseListSectionRegex)

	if (phaseListMatch && phaseListMatch[1]) {
		// Extract phases from the Phase List section
		const phaseListContent = phaseListMatch[1].trim()
		const phaseItemRegex = /(\d+)[.:]\s*(.*?)(?::\s*|-\s*|\n+)((?:[-*].*?\n)*?)(?=\n*\s*\d+[.:]|\n*$)/gis
		const phaseMatches: { index: number; description: string; details: string }[] = []
		let match

		while ((match = phaseItemRegex.exec(phaseListContent)) !== null) {
			const index = parseInt(match[1], 10)
			const description = match[2].trim()
			const details = match[3]?.trim() || ""
			phaseMatches.push({ index, description, details })
		}

		if (phaseMatches.length > 0) {
			return createPhasesFromMatches(phaseMatches, raw)
		}
	}

	// Fall back to looking for explicit phase descriptions in the whole text
	const phaseListRegex =
		/(\d+)[.:]\s*(.*?(?:Phase|Creation|Setup|Implementation|Logic|Batch|Completion|단계).*?)(?:\s*:\s*|-\s*|\n+)((?:[-*].*?\n)*?)(?=\n*\s*\d+[.:]|\n*$)/gis
	const phaseMatches: { index: number; description: string; details: string }[] = []
	let match

	while ((match = phaseListRegex.exec(raw)) !== null) {
		const index = parseInt(match[1], 10)
		const description = match[2].trim()
		const details = match[3]?.trim() || ""
		phaseMatches.push({ index, description, details })
	}

	// If we found explicit phases in a numbered list format
	if (phaseMatches.length > 0) {
		return createPhasesFromMatches(phaseMatches, raw)
	}

	// If we still haven't found any phases, look for actual Phase headings
	const phaseHeadingRegex = /#{1,3}\s*Phase\s+\d+:?\s*(.*?)(?=\n)/gi
	const phaseHeadings: { index: number; description: string }[] = []
	let phaseIndex = 1

	// Reset the lastIndex property to start the search from the beginning
	phaseHeadingRegex.lastIndex = 0

	while ((match = phaseHeadingRegex.exec(raw)) !== null) {
		const description = match[1].trim()
		phaseHeadings.push({ index: phaseIndex++, description })
	}

	if (phaseHeadings.length > 0) {
		// Convert phase headings to matches
		const headingMatches = phaseHeadings.map((heading) => {
			// Try to extract content between this heading and the next
			const headingText = `Phase ${heading.index}: ${heading.description}`
			const headingPos = raw.indexOf(headingText)
			const nextHeadingPos = raw.indexOf(`Phase ${heading.index + 1}:`, headingPos)
			const phaseContent =
				nextHeadingPos > 0
					? raw.substring(headingPos + headingText.length, nextHeadingPos)
					: raw.substring(headingPos + headingText.length)

			return {
				index: heading.index,
				description: heading.description,
				details: phaseContent.trim(),
			}
		})

		return createPhasesFromMatches(headingMatches, raw)
	}

	// Fallback to improved standard extraction
	return extractStandardPhases(raw)
}

// Helper function to create phases from matches
function createPhasesFromMatches(phaseMatches: { index: number; description: string; details: string }[], raw: string): Phase[] {
	// Create phases from the numbered list descriptions
	const phases: Phase[] = phaseMatches.map((phaseMatch) => ({
		index: phaseMatch.index,
		paths: [], // Will be filled in later
		status: "pending",
		phase_prompt: phaseMatch.description,
		subtasks: extractSubtasksFromDetails(phaseMatch.details),
	}))

	// Extract tool uses to associate with phases and subtasks
	const toolUseRegex = /<(write_to_file|execute_command|attempt_completion)>([\s\S]*?)<\/\1>/g
	const toolUses: { type: string; content: string; index: number }[] = []
	let match

	while ((match = toolUseRegex.exec(raw)) !== null) {
		const toolType = match[1]
		const content = match[2].trim()
		// Find which phase this tool use most likely belongs to
		const phaseIndex = findPhaseForToolUse(match.index, raw, phases)
		toolUses.push({ type: toolType, content, index: phaseIndex || 0 })
	}

	// Associate tool uses with phases based on position in the text
	toolUses.forEach((toolUse) => {
		if (toolUse.index > 0 && toolUse.index <= phases.length) {
			const phase = phases[toolUse.index - 1]
			// Add a subtask for this tool use if not already present
			const hasMatchingSubtask = phase.subtasks.some(
				(subtask) => subtask.type === toolUse.type || subtask.description.toLowerCase().includes(toolUse.type),
			)

			if (!hasMatchingSubtask) {
				phase.subtasks.push({
					description: `Perform ${toolUse.type} operation`,
					type: toolUse.type,
					completed: false,
				})
			}
		}
	})

	// Extract all file paths
	const pathBlocks: string[] = []
	const pathRegex = /<path>([\s\S]*?)<\/path>/g

	while ((match = pathRegex.exec(raw)) !== null) {
		pathBlocks.push(match[1].trim())
	}

	// Distribute paths to phases based on their descriptions and subtasks
	for (const phase of phases) {
		const description = phase.phase_prompt.toLowerCase()

		// Intelligently match paths to phases
		for (const path of pathBlocks) {
			const filename = path.split(/[\/\\]/).pop() || ""
			const extension = filename.split(".").pop()?.toLowerCase() || ""

			// Improved path matching logic
			if (
				// Match by phase description
				description.includes("directory") ||
				description.includes("creation") ||
				description.includes("setup") ||
				description.includes("project") ||
				(description.includes("database") &&
					(extension === "db" || extension === "sql" || filename.includes("database"))) ||
				((description.includes("application") ||
					description.includes("implementation") ||
					description.includes("logic")) &&
					(extension === "py" || extension === "js" || filename.includes("app"))) ||
				(description.includes("batch") && extension === "bat") ||
				// Match by subtask mentions
				phase.subtasks.some((subtask) => subtask.description.toLowerCase().includes(filename.toLowerCase()))
			) {
				phase.paths.push(path)
			}
		}
	}

	return phases
}

// Helper function to find which phase a tool use belongs to
function findPhaseForToolUse(position: number, raw: string, phases: Phase[]): number | null {
	const precedingText = raw.substring(0, position)

	// Try to find the most recent phase heading or number before this position
	for (let i = phases.length - 1; i >= 0; i--) {
		const phase = phases[i]
		const phaseMarker = `${phase.index}. ${phase.phase_prompt}`
		const phaseHeading = `Phase ${phase.index}: ${phase.phase_prompt}`

		if (precedingText.includes(phaseMarker) || precedingText.includes(phaseHeading)) {
			return phase.index
		}
	}

	// If no specific phase found, default to the first phase
	return phases.length > 0 ? 1 : null
}

// Helper function to extract subtasks from phase details
function extractSubtasksFromDetails(details: string): Subtask[] {
	const subtasks: Subtask[] = []

	// Look for line items that could be subtasks (starting with - or *)
	const subtaskRegex = /[-*]\s*(.*?)(?:\s*\n|$)/g
	let match

	while ((match = subtaskRegex.exec(details)) !== null) {
		const description = match[1].trim()

		// Determine type based on subtask description
		let type = "generic"
		if (description.includes("<write_to_file>") || description.includes("file")) {
			type = "write_to_file"
		} else if (description.includes("<execute_command>") || description.includes("command")) {
			type = "execute_command"
		} else if (description.includes("<attempt_completion>") || description.includes("result")) {
			type = "attempt_completion"
		}

		subtasks.push({
			description,
			type,
			completed: false,
		})
	}

	return subtasks
}

// The improved standard extraction logic
function extractStandardPhases(raw: string): Phase[] {
	const phases: Phase[] = []

	// Look for heading-like text that might indicate phases
	const potentialPhaseHeadings = raw.match(/#{1,3}.*?(?:Phase|Step|Stage).*?\n/gi) || []

	if (potentialPhaseHeadings.length > 0) {
		// Extract phases from headings
		let phaseIndex = 1

		for (const heading of potentialPhaseHeadings) {
			const cleanHeading = heading.replace(/^#{1,3}\s*/, "").trim()

			// Find the content between this heading and the next heading
			const headingPos = raw.indexOf(heading)
			const nextHeadingPos = raw.indexOf("#", headingPos + heading.length)
			const phaseContent =
				nextHeadingPos > 0
					? raw.substring(headingPos + heading.length, nextHeadingPos).trim()
					: raw.substring(headingPos + heading.length).trim()

			phases.push({
				index: phaseIndex++,
				paths: [],
				status: "pending",
				phase_prompt: cleanHeading,
				subtasks: extractSubtasksFromDetails(phaseContent),
			})
		}

		// Extract paths and associate with phases
		const pathRegex = /<path>([\s\S]*?)<\/path>/g
		let match
		const paths: string[] = []

		while ((match = pathRegex.exec(raw)) !== null) {
			paths.push(match[1].trim())
		}

		// Distribute paths to most relevant phases
		distributePaths(phases, paths)

		return phases
	}

	// If no headings found, create a single phase
	return [
		{
			index: 1,
			paths: extractAllPaths(raw),
			status: "pending",
			phase_prompt: "Implementation Phase",
			subtasks: [],
		},
	]
}

// Helper to extract all paths
function extractAllPaths(raw: string): string[] {
	const pathRegex = /<path>([\s\S]*?)<\/path>/g
	const paths: string[] = []
	let match

	while ((match = pathRegex.exec(raw)) !== null) {
		paths.push(match[1].trim())
	}

	return paths
}

// Helper to distribute paths to phases based on content similarity
function distributePaths(phases: Phase[], paths: string[]): void {
	// For each path, find the most relevant phase
	for (const path of paths) {
		const filename = path.split(/[\/\\]/).pop() || ""
		let bestPhase = phases[0]
		let bestScore = 0

		for (const phase of phases) {
			// Calculate relevance score based on keyword matches
			const phaseText = phase.phase_prompt.toLowerCase()
			const filenameLower = filename.toLowerCase()
			const extension = filename.split(".").pop()?.toLowerCase() || ""

			let score = 0

			// Score matches in phase name
			if (
				(phaseText.includes("setup") && filenameLower.includes("config")) ||
				(phaseText.includes("database") && (extension === "db" || extension === "sql")) ||
				(phaseText.includes("gui") && (extension === "py" || extension === "js")) ||
				(phaseText.includes("launcher") && (extension === "bat" || extension === "sh"))
			) {
				score += 10
			}

			// If this phase has the highest score, make it the best match
			if (score > bestScore) {
				bestScore = score
				bestPhase = phase
			}
		}

		// Add path to the most relevant phase
		bestPhase.paths.push(path)
	}
}

export function parsePlanFromOutput(raw: string): Phase[] {
	const phases = parsePhases(raw)
	if (phases.length) {
		return phases
	}

	const regex = /^\s*(\d+)[.)-]\s+(.*)$/gm
	const found: Phase[] = []
	let m: RegExpExecArray | null
	while ((m = regex.exec(raw)) !== null) {
		found.push({
			index: Number(m[1]),
			paths: [],
			status: "pending",
			phase_prompt: m[2].trim(),
			subtasks: [],
		})
	}
	return found
}

export { PhaseTracker } from "./phase-tracker"
