import { createToolsSection } from "./tools"
import { createExampleSectionForTools } from "./example"
import { BrowserSettings } from "@shared/BrowserSettings"
import { McpHub } from "@services/mcp/McpHub"
import "@utils/path"

// Import all sections
import {
	getPersonaSection,
	getCapabilitiesSection,
	getRulesSection,
	getSystemInfoSection,
	getObjectiveSection,
	getToolUseGuidelinesSection,
	getMcpServersSection,
	getEditingFilesSection,
	getModesSection,
	getToolUseFormattingSection,
} from "./sections"

// Type definition for SYSTEM_PROMPT function signature
export const SYSTEM_PROMPT = async (
	cwd: string,
	supportsBrowserUse: boolean,
	mcpHub: McpHub,
	browserSettings: BrowserSettings,
	isNextGenModel: boolean = false,
	customInstructions?: string,
) => {
	const basePrompt = `${getPersonaSection()}

${getToolUseFormattingSection()}

# Tools

${(() => {
	const { toolDescriptions, availableTools } = createToolsSection(cwd.toPosix(), supportsBrowserUse, browserSettings, mcpHub)
	const exampleSection = createExampleSectionForTools(availableTools)
	return `${toolDescriptions}${exampleSection ? "\n\n" + exampleSection : ""}`
})()}

${getToolUseGuidelinesSection()}

${getMcpServersSection(mcpHub)}

${getEditingFilesSection()}

${getModesSection()}

${getCapabilitiesSection(cwd.toPosix(), supportsBrowserUse)}

${getRulesSection(cwd.toPosix(), supportsBrowserUse)}

${getSystemInfoSection(cwd.toPosix())}

${getObjectiveSection()}`

	// Add custom instructions if provided
	// The customInstructions parameter is already the combined string from task/index.ts
	// It includes the header and formatting from addUserInstructions
	const finalPrompt = basePrompt + (customInstructions || "")

	return finalPrompt
}
