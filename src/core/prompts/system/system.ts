import { createToolsSection } from "./tools"
import { createExampleSectionForTools } from "./example"
import { BrowserSettings } from "@shared/BrowserSettings"
import { FocusChainSettings } from "@shared/FocusChainSettings"
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
	focusChainSettings: FocusChainSettings,
) => {
	const basePrompt = `${getPersonaSection()}

${getToolUseFormattingSection(focusChainSettings)}

# Tools

${(() => {
	const { toolDescriptions, availableTools } = createToolsSection(cwd.toPosix(), supportsBrowserUse, browserSettings, focusChainSettings, mcpHub)
	const exampleSection = createExampleSectionForTools(availableTools, focusChainSettings)
	return `${toolDescriptions}${exampleSection ? "\n\n" + exampleSection : ""}`
})()}

${getToolUseGuidelinesSection(focusChainSettings)}

${getMcpServersSection(mcpHub)}

${getEditingFilesSection()}

${getModesSection(focusChainSettings)}

${getCapabilitiesSection(cwd.toPosix(), supportsBrowserUse)}

${getRulesSection(cwd.toPosix(), supportsBrowserUse)}

${getSystemInfoSection(cwd.toPosix())}

${getObjectiveSection()}`

	return basePrompt
}
