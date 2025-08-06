import { ToolArgs } from "./types"
import "@utils/path" // Ensure toPosix is available

export function getReadFile(args: ToolArgs): string {
	const maxConcurrentReads = args.maxConcurrentReads ?? 1
	const isMultipleReadsEnabled = maxConcurrentReads > 1
	const partialReadsEnabled = args.partialReadsEnabled ?? false
	const cwd = args.cwd

	return `## read_file
Description: Request to read the contents of a file at the specified path. Use this when you need to examine the contents of an existing file you do not know the contents of, for example to analyze code, review text files, or extract information from configuration files. Automatically extracts raw text from PDF and DOCX files. May not be suitable for other types of binary files, as it returns the raw content as a string.
Parameters:
- path: (required) The path of the file to read (relative to the current working directory ${cwd.toPosix()})
${args.focusChainSettings?.enabled ? `- task_progress: (optional) A checklist showing task progress after this tool use is completed. (See 'Updating Task Progress' section for more details)` : ""}
Usage:
<read_file>
<path>File path here</path>
${
	args.focusChainSettings?.enabled
		? `<task_progress>
Checklist here (optional)
</task_progress>`
		: ""
}
</read_file>`
}
