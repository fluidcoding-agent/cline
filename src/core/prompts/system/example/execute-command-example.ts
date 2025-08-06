import { FocusChainSettings } from "@shared/FocusChainSettings"

export function getExecuteCommandExample(exampleNumber: number, focusChainSettings: FocusChainSettings): string {
	return `## Example ${exampleNumber}: Requesting to execute a command

<execute_command>
<command>npm run dev</command>
<requires_approval>false</requires_approval>
${
	focusChainSettings.enabled
		? `<task_progress>
- [x] Set up project structure
- [x] Install dependencies
- [ ] Run command to start server
- [ ] Test application
</task_progress>`
		: ""
}
</execute_command>
`
}
