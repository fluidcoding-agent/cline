export function getExecuteCommandExample(exampleNumber: number): string {
	return `## Example ${exampleNumber}: Requesting to execute a command

<execute_command>
<command>npm run dev</command>
<requires_approval>false</requires_approval>
</execute_command>
`
}
