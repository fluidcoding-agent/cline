import { ApiHandler } from "@api/index"

// 개선된 결과 인터페이스
export interface EnhancedRefinementResult {
	refinedPrompt: string
	explanation: string
	needsMoreInfo?: boolean
	followUpQuestions?: string[]
	extractedData?: any
	isInteractiveComplete?: boolean
}

export interface RefinedPromptResult {
	refinedPrompt: string
	needsMoreInfo: boolean
	followUpQuestions: string[]
	originalPrompt: string
	explanation: string
}

export async function refinePrompt(prompt: string, apiHandler: ApiHandler): Promise<RefinedPromptResult> {
	try {
		// Apply LLM-based prompt refinement
		const refinedPrompt = await performLLMPromptRefinement(prompt, apiHandler)

		return {
			originalPrompt: prompt,
			refinedPrompt: refinedPrompt.refinedPrompt,
			explanation: refinedPrompt.explanation,
			needsMoreInfo: refinedPrompt.needsMoreInfo || false,
			followUpQuestions: refinedPrompt.followUpQuestions || [],
		}
	} catch (error) {
		console.error("Error in prompt refinement:", error)
		return {
			originalPrompt: prompt,
			refinedPrompt: prompt,
			explanation: `LLM refinement failed.`,
			needsMoreInfo: false,
			followUpQuestions: [],
		}
	}
}

async function performLLMPromptRefinement(
	prompt: string,
	apiHandler: ApiHandler,
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

	// Project Specification Format 정의
	const projectSpecificationFormat = `
	## Project Specification Format

	Create a comprehensive project specification using the following structure:

	### Project Overview
	- **Project Name**: [Extracted or inferred project name]
	- **Project Type**: [Type of web application (portfolio, e-commerce, blog, etc.)]
	- **Target Audience**: [Who will use this application]
	- **Project Goals**: [Main objectives and purpose]

	### Technical Requirements
	- **Preferred Technologies**: [Frontend frameworks, libraries, tools]
	- **Architecture**: [Basic structure and approach]
	- **Platform**: [Web, mobile-responsive, PWA, etc.]

	### Design Specifications
	- **Design Style**: [Modern, minimalist, professional, etc.]
	- **Color Scheme**: [Primary colors and theme]
	- **UI/UX Preferences**: [Specific design patterns or inspirations]
	- **Animations**: [Interaction and animation requirements]

	### Feature Requirements
	- **Core Features**: [Essential functionality that must be included]
	- **Additional Features**: [Nice-to-have features]
	- **User Interactions**: [How users will interact with the application]

	### Page Structure
	- **Required Pages**: [List of necessary pages/sections]
	- **Content Strategy**: [Type of content for each page]
	- **Navigation**: [How users will move through the site]

	### Implementation Details
	- **Development Approach**: [Step-by-step implementation strategy]
	- **File Structure**: [Recommended project organization]
	- **Best Practices**: [Coding standards and conventions to follow]

	Use this format to create a clear, actionable specification that a developer can immediately use to build the project.`

	const systemPrompt = `You are a web project specification assistant. Your task is to analyze user prompts for web project creation and extract information to fill predefined template slots.

TEMPLATE STRUCTURE:
${JSON.stringify(webProjectTemplate, null, 2)}

${projectSpecificationFormat}

ANALYSIS TASK:
1. Extract information from the user prompt that matches each template slot
2. Identify which required slots are missing information
3. For missing required slots, generate specific follow-up questions
4. Create a refined prompt using the Project Specification Format above with all available information

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
  "refinedPrompt": "A comprehensive project specification following the Project Specification Format above, filled with extracted information and professional recommendations"
}

EXTRACTION GUIDELINES:
- Be liberal in interpretation but conservative in assumption
- Look for implicit information (e.g., "company website" implies professional design)
- Don't invent information that isn't reasonably implied
- For arrays, extract all relevant items mentioned
- Normalize values to template-friendly formats

REFINED PROMPT GUIDELINES:
- Always use the Project Specification Format structure
- Fill each section with relevant extracted information
- Where information is missing, provide professional recommendations or common best practices
- Make the specification detailed enough for immediate implementation
- Include specific technical suggestions based on the project type
- Ensure the format is consistent and professional

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

		return {
				refinedPrompt: analysisResult.refinedPrompt || "",
				followUpQuestions: analysisResult.followUpQuestions || [],
				explanation: `Generated ${analysisResult.followUpQuestions.length} follow-up questions to gather missing information.`,
				needsMoreInfo: true,
				extractedData: analysisResult.extractedData,
				isInteractiveComplete: false,
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