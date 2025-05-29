import { UiServiceClient } from "./grpc-client"

export interface RefinedPrompt {
	originalPrompt: string
	refinedPrompt: string
	explanation: string
}

export class PromptRefinementService {
	/**
	 * Refines the given prompt to improve task understanding and execution
	 * @param prompt The original prompt from the user
	 * @returns The refined prompt with explanation
	 */
	static async refinePrompt(prompt: string): Promise<RefinedPrompt> {
		try {
			const response = await UiServiceClient.refinePrompt({ prompt })
			return {
				originalPrompt: response.originalPrompt,
				refinedPrompt: response.refinedPrompt,
				explanation: response.explanation,
			}
		} catch (error) {
			console.error("Error refining prompt:", error)
			throw error
		}
	}
}
