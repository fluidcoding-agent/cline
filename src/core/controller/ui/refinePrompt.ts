import { PromptRefinementRequest, PromptRefinementResponse } from "@shared/proto/ui"
import type { Controller } from "../index"
import { buildApiHandler } from "../../../api"
import { getAllExtensionState } from "../../storage/state"

export async function refinePrompt(controller: Controller, request: PromptRefinementRequest): Promise<PromptRefinementResponse> {
	const { prompt } = request

	try {
		// Get current API configuration
		const { apiConfiguration } = await getAllExtensionState(controller.context)

		// Create API handler for LLM calls
		const apiHandler = buildApiHandler(apiConfiguration)

		// Apply LLM-based prompt refinement
		const refinedPrompt = await performLLMPromptRefinement(prompt, apiHandler)

		return {
			originalPrompt: prompt,
			refinedPrompt: refinedPrompt.text,
			explanation: refinedPrompt.explanation,
		}
	} catch (error) {
		console.error("Error in prompt refinement:", error)
		// Fallback to heuristic refinement if LLM fails
		const fallbackRefinement = await performHeuristicPromptRefinement(prompt)
		return {
			originalPrompt: prompt,
			refinedPrompt: fallbackRefinement.text,
			explanation: `LLM refinement failed, using heuristic approach. ${fallbackRefinement.explanation}`,
		}
	}
}

interface RefinementResult {
	text: string
	explanation: string
}

async function performLLMPromptRefinement(prompt: string, apiHandler: any): Promise<RefinementResult> {
	// 웹 프로젝트 템플릿 (RAG를 통해 가져왔다고 가정)
	const webProjectTemplate = {
		name: "Modern Web Application Template",
		description: "A template for creating modern web applications",
		requiredSlots: {
			projectName: {
				description: "Name of the project/application",
				required: true,
				examples: ["My Portfolio", "E-commerce Store", "Blog Website"],
			},
			projectType: {
				description: "Type of web application",
				required: true,
				options: ["portfolio", "e-commerce", "blog", "dashboard", "landing-page", "social-media"],
				examples: ["portfolio website", "online store", "personal blog"],
			},
			mainFeatures: {
				description: "Key features and functionality",
				required: true,
				examples: ["user authentication", "payment processing", "content management", "responsive design"],
			},
			designStyle: {
				description: "Visual design preferences",
				required: false,
				examples: ["modern", "minimalist", "colorful", "dark theme", "professional"],
			},
			primaryColor: {
				description: "Primary color scheme",
				required: false,
				examples: ["blue", "#3B82F6", "corporate blue", "warm colors"],
			},
			targetAudience: {
				description: "Target users or audience",
				required: false,
				examples: ["young professionals", "small businesses", "students", "general public"],
			},
		},
		optionalSlots: {
			technologies: {
				description: "Preferred technologies or frameworks",
				examples: ["React", "Vue.js", "Next.js", "Tailwind CSS"],
			},
			pages: {
				description: "Specific pages or sections needed",
				examples: ["home page", "about page", "contact form", "product catalog"],
			},
			animations: {
				description: "Animation or interaction preferences",
				examples: ["smooth scrolling", "hover effects", "loading animations"],
			},
		},
	}

	const systemPrompt = `You are a web project specification assistant. Your task is to analyze user prompts for web project creation and extract information to fill predefined template slots.

TEMPLATE STRUCTURE:
${JSON.stringify(webProjectTemplate, null, 2)}

ANALYSIS TASK:
1. Extract information from the user prompt that matches each template slot
2. Identify which required slots are missing information
3. For missing required slots, generate specific follow-up questions
4. Create a refined prompt that fills available slots

RESPONSE FORMAT:
You must respond with a JSON object containing:
{
  "extractedData": {
    "projectName": "extracted value or null",
    "projectType": "extracted value or null", 
    "mainFeatures": ["array of extracted features"] or null,
    "designStyle": "extracted value or null",
    "primaryColor": "extracted value or null",
    "targetAudience": "extracted value or null",
    "technologies": ["array of extracted technologies"] or null,
    "pages": ["array of extracted pages"] or null,
    "animations": "extracted value or null"
  },
  "missingRequiredSlots": ["array of missing required slot names"],
  "followUpQuestions": ["array of specific questions for missing required slots"],
  "needsMoreInfo": boolean,
  "refinedPrompt": "enhanced prompt with filled slots and clear project specification"
}

EXTRACTION GUIDELINES:
- Be liberal in interpretation but conservative in assumption
- Look for implicit information (e.g., "company website" implies professional design)
- Don't invent information that isn't reasonably implied
- For arrays, extract all relevant items mentioned
- Normalize values to template-friendly formats

QUESTION GENERATION RULES:
- Ask specific, actionable questions for missing required slots
- Provide examples in questions to guide user responses
- Keep questions concise but informative
- Focus on one concept per question`

	const userMessage = `Analyze this web project request and extract template slot information:

User Request: "${prompt}"

Please extract available information, identify missing required elements, and generate follow-up questions if needed.`

	// Call LLM for template-based analysis
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

	// Parse LLM response
	try {
		// Extract JSON from response (in case there's extra text)
		const jsonMatch = response.match(/\{[\s\S]*\}/)
		if (!jsonMatch) {
			throw new Error("No JSON found in LLM response")
		}

		const analysisResult = JSON.parse(escapeNewlinesInJsonStrings(jsonMatch[0]))

		if (analysisResult.needsMoreInfo && analysisResult.followUpQuestions?.length > 0) {
			// Generate refined prompt with follow-up questions
			const followUpText = analysisResult.followUpQuestions.join("\n")
			const refinedPrompt = `${prompt}

To create your web project, I need some additional information:

${followUpText}

Please provide these details so I can generate exactly what you need.`

			return {
				text: refinedPrompt,
				explanation: `Missing required information for web project template. Generated ${analysisResult.followUpQuestions.length} follow-up questions.`,
			}
		} else if (analysisResult.refinedPrompt) {
			return {
				text: analysisResult.refinedPrompt,
				explanation: "Successfully extracted template information and created detailed web project specification.",
			}
		} else {
			// Fallback - create a basic enhanced prompt
			const extractedData = analysisResult.extractedData || {}
			const filledSlots = Object.entries(extractedData)
				.filter(([_, value]) => value !== null && value !== undefined)
				.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
				.join(", ")

			return {
				text: `Create a web project with the following specifications: ${filledSlots || prompt}`,
				explanation: "Extracted available template information for web project creation.",
			}
		}
	} catch (parseError) {
		console.error("Error parsing LLM template analysis response:", parseError)
		throw new Error("Failed to parse LLM response")
	}
}

/**
 * Escape *literal* new-line characters (`\n`) that occur **inside** string
 * literals of a JSON-like text, so it can be fed to JSON.parse().
 *
 * @param raw  –  JSON-looking text emitted by an LLM
 * @returns fixed text safe for JSON.parse()
 */
export function escapeNewlinesInJsonStrings(raw: string): string {
	let inString = false // are we currently between unescaped double quotes?
	let result = ""

	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i]

		// toggle when we hit a non-escaped "
		if (ch === '"' && raw[i - 1] !== "\\") {
			inString = !inString
			result += ch
			continue
		}

		// inside a string → replace real newline with the 2-char sequence \n
		if (ch === "\n" && inString) {
			result += "\\n"
			continue
		}

		result += ch
	}

	return result
}

async function performHeuristicPromptRefinement(prompt: string): Promise<RefinementResult> {
	// Fallback heuristic implementation for when LLM fails
	const trimmedPrompt = prompt.trim()

	// Simple heuristics for prompt improvement
	if (trimmedPrompt.length < 10) {
		return {
			text: `Please provide more details about: ${trimmedPrompt}. What specific functionality do you want to implement? What files or technologies should be involved?`,
			explanation: "Added request for more details to improve task clarity.",
		}
	}

	// Check if prompt lacks specific instructions
	if (
		!trimmedPrompt.includes("please") &&
		!trimmedPrompt.includes("create") &&
		!trimmedPrompt.includes("make") &&
		!trimmedPrompt.includes("implement")
	) {
		return {
			text: `Please ${trimmedPrompt}`,
			explanation: "Added polite request format to improve task understanding.",
		}
	}

	// Check for very vague requests
	const vaguePhrases = ["fix", "improve", "update", "change"]
	const hasVaguePhrase = vaguePhrases.some((phrase) => trimmedPrompt.toLowerCase().includes(phrase))

	if (hasVaguePhrase && trimmedPrompt.length < 50) {
		return {
			text: `${trimmedPrompt}. Please provide specific details about what needs to be modified, what the expected behavior should be, and any relevant file locations or technologies.`,
			explanation: "Added request for specific details to clarify vague request.",
		}
	}

	// For well-structured prompts, return as-is
	return {
		text: trimmedPrompt,
		explanation: "Prompt appears clear and actionable.",
	}
}
