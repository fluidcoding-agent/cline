// Example generators
import { getExecuteCommandExample } from "./execute-command-example"
import { getUseMcpToolExample } from "./use-mcp-tool-example"
import { getReplaceInFileExample } from "./replace-in-file-example"
import { getNewTaskExample } from "./new-task-example"
import { getWriteFileExample } from "./write-file-example"

// Tool name type (should match ToolName from tools/types.ts)
type ToolName = string

// Map of tool names to their example generator functions
const toolExampleMap: Record<string, (exampleNumber: number) => string> = {
	execute_command: getExecuteCommandExample,
	write_to_file: getWriteFileExample,
	replace_in_file: getReplaceInFileExample,
	use_mcp_tool: getUseMcpToolExample,
	new_task: getNewTaskExample,
}

// Example order matching tool order preference
const preferredExampleOrder = ["execute_command", "write_to_file", "new_task", "replace_in_file", "use_mcp_tool"] as const

/**
 * Creates the complete example section with all examples
 * @returns Example section string
 */
export function createExampleSection(): string {
	const examples = [
		getExecuteCommandExample(1),
		getWriteFileExample(2),
		getNewTaskExample(3),
		getReplaceInFileExample(4),
		getUseMcpToolExample(5),
		getUseMcpToolExample(6), // Second MCP example
	]

	return `# Tool Use Examples\n\n` + examples.join("\n")
}

/**
 * Creates example section based on available tools for a specific mode
 * @param availableTools Array of tool names that are available in the current mode
 * @returns Example section string, or empty string if no examples are available
 */
export function createExampleSectionForTools(availableTools: ToolName[]): string {
	// Filter tools that have examples
	const toolsWithExamples = availableTools.filter((tool) => toolExampleMap[tool])

	if (toolsWithExamples.length === 0) {
		return ""
	}

	const exampleHeader = `# Tool Use Examples\n\n`

	// Sort by preferred order, keeping tools that aren't in the preferred order at the end
	const sortedTools = [...toolsWithExamples].sort((a, b) => {
		const aIndex = preferredExampleOrder.indexOf(a as any)
		const bIndex = preferredExampleOrder.indexOf(b as any)

		if (aIndex === -1 && bIndex === -1) {
			return 0
		}
		if (aIndex === -1) {
			return 1
		}
		if (bIndex === -1) {
			return -1
		}

		return aIndex - bIndex
	})

	let currentExampleNumber = 1
	const examples = sortedTools
		.map((toolName) => {
			try {
				const generator = toolExampleMap[toolName]
				if (!generator) {
					console.warn(`No generator found for example: ${toolName}`)
					return ""
				}
				const example = generator(currentExampleNumber)

				// use_mcp_tool has 2 examples, so we need to increment by 2
				if (toolName === "use_mcp_tool") {
					currentExampleNumber += 2
				} else {
					currentExampleNumber += 1
				}

				return example
			} catch (error) {
				console.warn(`Error generating example for ${toolName}:`, error)
				return ""
			}
		})
		.filter((example) => example.trim() !== "")
		.join("\n")

	return exampleHeader + examples
}
