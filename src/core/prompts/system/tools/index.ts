import { BrowserSettings } from "@shared/BrowserSettings"
import { ToolArgs, ToolName, CodeIndexManager, McpHub, DiffStrategy, Experiments } from "./types"
import { createExampleSectionForTools } from "../example"

// Tool description generators
import { getExecuteCommand } from "./execute-command"
import { getReadFile } from "./read-file"
import { getWriteFile } from "./write-file"
import { getReplaceInFile } from "./replace-in-file"
import { getSearchFile } from "./search-file"
import { getListFile } from "./list-file"
import { getListCodeDefinitionName } from "./list-code-definition-name"
import { getBrowserAction } from "./browse-action"
import { getUseMcpTool } from "./use-mcp-tool"
import { getAccessMcpResource } from "./access-mcp-resource"
import { getAskFollowupQuestion } from "./ask-followup-question"
import { getAttemptCompletion } from "./attempt-completion"
import { getNewTask } from "./new_task"
import { getPlanModeRespond } from "./plan-mode-respond"
import { getLoadMcpDocumentation } from "./load-mcp-documentation"

// Tool Groups for mode-based filtering
export const TOOL_GROUPS = {
	core: ["execute_command", "read_file", "write_to_file", "replace_in_file", "search_files", "list_files"],
	code: ["list_code_definition_names"],
	browser: ["browser_action"],
	mcp: ["use_mcp_tool", "access_mcp_resource", "load_mcp_documentation"],
	interaction: ["ask_followup_question", "attempt_completion"],
	task: ["new_task", "plan_mode_respond"],
} as const

export const ALWAYS_AVAILABLE_TOOLS: ToolName[] = ["ask_followup_question", "attempt_completion"]

// Map of tool names to their description functions
const toolDescriptionMap: Record<ToolName, (args: ToolArgs) => string | undefined> = {
	execute_command: (args) => getExecuteCommand(args.cwd),
	read_file: (args) => getReadFile(args),
	write_to_file: (args) => getWriteFile(args.cwd),
	replace_in_file: (args) => getReplaceInFile(args.cwd),
	search_files: (args) => getSearchFile(args.cwd),
	list_files: (args) => getListFile(args.cwd),
	list_code_definition_names: (args) => getListCodeDefinitionName(args.cwd),
	browser_action: (args) =>
		args.supportsComputerUse && args.browserSettings ? getBrowserAction(args.browserSettings) : undefined,
	use_mcp_tool: () => getUseMcpTool(),
	access_mcp_resource: () => getAccessMcpResource(),
	ask_followup_question: () => getAskFollowupQuestion(),
	attempt_completion: () => getAttemptCompletion(),
	new_task: () => getNewTask(),
	plan_mode_respond: () => getPlanModeRespond(),
	load_mcp_documentation: () => getLoadMcpDocumentation(),
}

export function getToolDescriptionsForMode(
	mode: string,
	cwd: string,
	supportsComputerUse: boolean,
	codeIndexManager?: CodeIndexManager,
	diffStrategy?: DiffStrategy,
	browserViewportSize?: string,
	mcpHub?: McpHub,
	experiments?: Partial<Experiments>,
	partialReadsEnabled?: boolean,
	settings?: Record<string, any>,
	browserSettings?: BrowserSettings,
): { toolDescriptions: string; availableTools: ToolName[] } {
	// Enhanced ToolArgs with all necessary parameters
	const args: ToolArgs = {
		cwd,
		supportsComputerUse,
		diffStrategy,
		browserViewportSize,
		browserSettings: browserSettings || (supportsComputerUse ? { viewport: { width: 1280, height: 720 } } : undefined),
		mcpHub,
		codeIndexManager,
		partialReadsEnabled: partialReadsEnabled ?? false,
		settings: settings ?? {},
		experiments: experiments ?? {},
		maxConcurrentReads: settings?.maxConcurrentFileReads ?? 5,
		toolOptions: {},
	}

	// Get available tools based on TOOL_GROUPS and conditions
	const availableTools = getToolsForMode(mode, args)

	const toolDescriptions = availableTools
		.map((toolName) => {
			try {
				const generator = toolDescriptionMap[toolName]
				if (!generator) {
					console.warn(`No generator found for tool: ${toolName}`)
					return ""
				}
				const description = generator(args)
				return description || ""
			} catch (error) {
				console.warn(`Error generating description for tool ${toolName}:`, error)
				return ""
			}
		})
		.filter((desc) => desc.trim() !== "")
		.join("\n\n")

	// Don't include examples here - let the caller handle it for consistency
	return {
		toolDescriptions,
		availableTools,
	}
}

function getToolsForMode(mode: string, args: ToolArgs): ToolName[] {
	const availableTools = new Set<ToolName>()

	// Always available tools
	ALWAYS_AVAILABLE_TOOLS.forEach((tool) => availableTools.add(tool))

	// Core tools for most modes
	TOOL_GROUPS.core.forEach((tool) => availableTools.add(tool as ToolName))

	// Code tools - only if code index manager is enabled
	if (args.codeIndexManager?.isEnabled()) {
		TOOL_GROUPS.code.forEach((tool) => availableTools.add(tool as ToolName))
	}

	// Browser tools - only if browser support is enabled and browser settings exist
	if (args.supportsComputerUse && args.browserSettings) {
		TOOL_GROUPS.browser.forEach((tool) => availableTools.add(tool as ToolName))
	}

	// MCP tools - only if MCP hub exists and has servers
	if (args.mcpHub && args.mcpHub.getServers().length > 0) {
		TOOL_GROUPS.mcp.forEach((tool) => availableTools.add(tool as ToolName))
	}

	// Task management tools - always available
	TOOL_GROUPS.task.forEach((tool) => availableTools.add(tool as ToolName))

	// 요청된 순서대로 도구들을 정렬
	const desiredOrder: ToolName[] = [
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
		"attempt_completion",
		"new_task",
		"plan_mode_respond",
		"load_mcp_documentation",
	]

	// 사용 가능한 도구들을 원하는 순서대로 필터링하여 반환
	return desiredOrder.filter((tool) => availableTools.has(tool))
}

// Main function to create tools section
export function createToolsSection(
	cwd: string,
	supportsBrowserUse: boolean,
	browserSettings: BrowserSettings,
	mcpHub?: McpHub,
): { toolDescriptions: string; availableTools: ToolName[] } {
	// Use getToolDescriptionsForMode with default mode
	// We don't have a specific mode here, so we'll pass empty string
	// The function will still apply all the conditional logic based on the parameters
	return getToolDescriptionsForMode(
		"", // mode - not used in current implementation
		cwd,
		supportsBrowserUse,
		undefined, // codeIndexManager
		undefined, // diffStrategy
		undefined, // browserViewportSize
		mcpHub,
		undefined, // experiments
		false, // partialReadsEnabled
		{}, // settings
		browserSettings,
	)
}

export type { ToolArgs, ToolName } from "./types"
