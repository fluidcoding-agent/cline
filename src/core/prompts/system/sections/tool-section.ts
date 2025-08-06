import { createToolsSection } from "../tools"
import { BrowserSettings } from "@shared/BrowserSettings"

export function getToolSection(cwd: string, supportsBrowserUse: boolean, browserSettings: BrowserSettings): string {
	const { toolDescriptions } = createToolsSection(cwd, supportsBrowserUse, browserSettings)
	return toolDescriptions
}
