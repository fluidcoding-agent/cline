import { PromptRefinementRequest, PromptRefinementResponse } from "@shared/proto/ui"
import type { Controller } from "../index"
import { buildApiHandler } from "../../../api"
import { getAllExtensionState } from "../../storage/state"

// 개선된 결과 인터페이스
export interface EnhancedRefinementResult {
	text: string
	explanation: string
	needsMoreInfo?: boolean
	followUpQuestions?: string[]
	extractedData?: any
	isInteractiveComplete?: boolean
}

export async function refinePrompt(controller: Controller, request: PromptRefinementRequest): Promise<PromptRefinementResponse> {
	const { prompt } = request

	try {
		// Get current API configuration
		const { apiConfiguration } = await getAllExtensionState(controller.context)

		// Create API handler for LLM calls
		const apiHandler = buildApiHandler(apiConfiguration)

		// Apply LLM-based prompt refinement
		const refinedPrompt = await performLLMPromptRefinement(prompt, apiHandler, controller)

		return {
			originalPrompt: prompt,
			refinedPrompt: refinedPrompt.text,
			explanation: refinedPrompt.explanation,
		}
	} catch (error) {
		console.error("Error in prompt refinement:", error)
		return {
			originalPrompt: prompt,
			refinedPrompt: prompt,
			explanation: `LLM refinement failed.`,
		}
	}
}

interface RefinementResult {
	text: string
	explanation: string
}

async function performLLMPromptRefinement(
	prompt: string,
	apiHandler: any,
	controller: Controller,
): Promise<EnhancedRefinementResult> {
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
			// 단순히 followUpQuestions를 출력용 텍스트로 변환
			const questionsText = analysisResult.followUpQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n")

			return {
				text: `I need more information to create your web project. Please answer these questions:

${questionsText}

Once you provide these details, I can create exactly what you need.`,
				explanation: `Generated ${analysisResult.followUpQuestions.length} follow-up questions to gather missing information.`,
				needsMoreInfo: true,
				followUpQuestions: analysisResult.followUpQuestions,
				extractedData: analysisResult.extractedData,
				isInteractiveComplete: false,
			}
		} else if (analysisResult.refinedPrompt) {
			return {
				text: analysisResult.refinedPrompt,
				explanation: "Successfully extracted template information and created detailed web project specification.",
				needsMoreInfo: false,
				extractedData: analysisResult.extractedData,
				isInteractiveComplete: true,
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
				needsMoreInfo: false,
				extractedData: analysisResult.extractedData,
				isInteractiveComplete: true,
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

/**
 * 사용 예제:
 *
 * // 기본 사용법
 * const result = await refinePrompt(controller, { prompt: "웹사이트 만들어줘" })
 *
 * // needsMoreInfo가 true인 경우, 질문 목록이 출력됩니다:
 * // "I need more information to create your web project. Please answer these questions:
 * //
 * // 1. 어떤 종류의 웹사이트를 만들고 싶으신가요?
 * // 2. 어떤 기능이 필요하신가요?
 * // 3. 어떤 디자인 스타일을 선호하시나요?
 * //
 * // Once you provide these details, I can create exactly what you need."
 *
 * // 사용자는 이 질문들에 답변하여 새로운 메시지를 보낼 수 있습니다.
 */
