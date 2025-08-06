import { ToolArgs } from "./types"

export function getWriteFile(args: ToolArgs): string {
	return `## write_to_file
Description: Request to write content to a file at the specified path. If the file exists, it will be overwritten with the provided content. If the file doesn't exist, it will be created. This tool will automatically create any directories needed to write the file.
Parameters:
- path: (required) The path of the file to write to (relative to the current working directory ${args.cwd.toPosix()})
- content: (required) The content to write to the file. ALWAYS provide the COMPLETE intended content of the file, without any truncation or omissions. You MUST include ALL parts of the file, even if they haven't been modified.
${args.focusChainSettings?.enabled ? `- task_progress: (optional) A checklist showing task progress after this tool use is completed. (See 'Updating Task Progress' section for more details)` : ""}
Usage:
<write_to_file>
<path>File path here</path>
<content>
Your file content here
</content>
${
	args.focusChainSettings?.enabled
		? `<task_progress>
Checklist here (optional)
</task_progress>`
		: ""
}
</write_to_file>`
}
