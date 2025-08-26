import { Anthropic } from "@anthropic-ai/sdk"
import { ApiHandler } from "@core/api"

function buildCondenseHistoryPrompt(tokenLimit: number): string {
	return `Summarize the following chat history for future context usage. Focus on retaining key information, user goals, decisions, important details, and resolved or unresolved issues. Write the summary clearly in less than ${tokenLimit} tokens.
    The summary should be structured as bullet points and prioritize any task-related information or instructions from the user.`
}

export async function condenseHistory(
	messages: Anthropic.Messages.MessageParam[],
	apiHandler: ApiHandler,
	tokenLimit: number,
): Promise<string> {
	const systemPrompt = buildCondenseHistoryPrompt(tokenLimit)
	const formattedHistory = messages
		.map((msg) => `${msg.role}: ${typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}`)
		.join("\n\n")
	const userMessage = `Here is the chat history: 
    ${formattedHistory}`

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
