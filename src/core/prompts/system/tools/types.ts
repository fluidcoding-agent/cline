import { McpHub } from "@services/mcp/McpHub"
import { BrowserSettings } from "@shared/BrowserSettings"
import { FocusChainSettings } from "@shared/FocusChainSettings"

export interface DiffStrategy {
	getToolDescription(options: { cwd: string; toolOptions?: any }): string
}

// Re-export McpHub type from the actual implementation
export { McpHub }

export interface CodeIndexManager {
	// Code Index Manager 인터페이스 (실제 구현에 맞게 조정 필요)
	isEnabled(): boolean
}

export interface Experiments {
	partialReads?: boolean
	concurrentFileReads?: boolean
	[key: string]: any
}

export type ToolArgs = {
	cwd: string
	supportsComputerUse: boolean
	diffStrategy?: DiffStrategy
	browserViewportSize?: string
	browserSettings?: BrowserSettings
	mcpHub?: McpHub
	codeIndexManager?: CodeIndexManager
	toolOptions?: any
	partialReadsEnabled?: boolean
	settings?: Record<string, any>
	experiments?: Partial<Experiments>
	maxConcurrentReads?: number
	focusChainSettings?: FocusChainSettings
}

export type ToolName =
	| "execute_command"
	| "read_file"
	| "write_to_file"
	| "replace_in_file"
	| "search_files"
	| "list_files"
	| "list_code_definition_names"
	| "browser_action"
	| "use_mcp_tool"
	| "access_mcp_resource"
	| "ask_followup_question"
	| "attempt_completion"
	| "new_task"
	| "plan_mode_respond"
	| "load_mcp_documentation"
