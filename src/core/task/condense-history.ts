import { Anthropic } from "@anthropic-ai/sdk"
import { ApiHandler } from "@core/api"

function buildCondenseHistoryPrompt(tokenLimit: number): string {
	return `Summarize the following chat history for future context usage. Focus on retaining key information, user goals, decisions, important details, and resolved or unresolved issues.
Write the summary clearly in less than ${tokenLimit} tokens.
The summary should be structured as a numbered list following the actual order the tasks were performed, and must prioritize any task-related information or instructions from the user.`
}

export async function condenseHistoryWithPrompt(
	historyPrompt: string | undefined,
	messages: Anthropic.Messages.MessageParam[],
	apiHandler: ApiHandler,
	tokenLimit: number,
): Promise<string> {
	const systemPrompt = buildCondenseHistoryPrompt(tokenLimit)
	const formattedHistory = messages
		.map((msg) => `${msg.role}: ${typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}`)
		.join("\n\n")
	let userMessage = ""

	// 이전 historyPrompt이 있으면 포함
	if (historyPrompt && historyPrompt.length > 0) {
		userMessage = `For context, here is the previous task summary:
    ${historyPrompt}`
	}

	userMessage += `Here is the recent chat history:
    ${formattedHistory}
    
    Output the result as a numbered list, representing each milestone or task in chronological order.`

	// Create a message stream to get the condensed history
	const stream = apiHandler.createMessage(systemPrompt, [
		{
			role: "user",
			content: userMessage,
		},
	])

	let response = ""
	for await (const chunk of stream) {
		if (chunk.type === "text") {
			response += chunk.text
		}
	}
	return response.trim()
}
