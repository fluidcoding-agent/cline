import { ToolArgs } from "./types"

export function getAccessMcpResource(args: ToolArgs): string {
	return `## access_mcp_resource
Description: Request to access a resource provided by a connected MCP server. Resources represent data sources that can be used as context, such as files, API responses, or system information.
Parameters:
- server_name: (required) The name of the MCP server providing the resource
- uri: (required) The URI identifying the specific resource to access
${args.focusChainSettings?.enabled ? `- task_progress: (optional) A checklist showing task progress after this tool use is completed. (See 'Updating Task Progress' section for more details)` : ""}
Usage:
<access_mcp_resource>
<server_name>server name here</server_name>
<uri>resource URI here</uri>
${
	args.focusChainSettings?.enabled
		? `<task_progress>
Checklist here (optional)
</task_progress>`
		: ""
}
</access_mcp_resource>`
}
