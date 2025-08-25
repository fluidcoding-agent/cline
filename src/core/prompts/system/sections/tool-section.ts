import { BrowserSettings } from "@shared/BrowserSettings"
import { FocusChainSettings } from "@shared/FocusChainSettings"
import { createToolsSection } from "../tools"

export function getToolSection(
	cwd: string,
	supportsBrowserUse: boolean,
	browserSettings: BrowserSettings,
	focusChainSettings: FocusChainSettings,
): string {
	const { toolDescriptions } = createToolsSection(cwd, supportsBrowserUse, browserSettings, focusChainSettings, undefined)
	return toolDescriptions
}
