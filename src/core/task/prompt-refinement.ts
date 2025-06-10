import { ApiHandler } from "@api/index"

// 팔로우업 질문 인터페이스
export interface FollowUpQuestion {
	question: string
	options: string[]
}

// 개선된 결과 인터페이스
export interface EnhancedRefinementResult {
	refinedPrompt: string
	explanation: string
	needsMoreInfo?: boolean
	followUpQuestions?: FollowUpQuestion[]
	extractedData?: any
	isInteractiveComplete?: boolean
}

export interface RefinedPromptResult {
	refinedPrompt: string
	needsMoreInfo: boolean
	followUpQuestions: FollowUpQuestion[]
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

async function performLLMPromptRefinement(prompt: string, apiHandler: ApiHandler): Promise<EnhancedRefinementResult> {
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
				options: ["portfolio", "blog", "dashboard", "landing-page"],
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

	// 간소화된 Project Specification Format
	// const projectSpecificationFormat = `Create a comprehensive project specification with: Project Overview, Technical Requirements, Design Specifications, Feature Requirements, Page Structure, and Implementation Details.`
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


	const systemPrompt = `You are a web project specification assistant. Extract information from user prompts and generate follow-up questions for missing required data.

TEMPLATE STRUCTURE:
${JSON.stringify(webProjectTemplate, null, 2)}

${projectSpecificationFormat}


REQUIRED FIELDS: projectName, projectType, mainFeatures
OPTIONAL FIELDS: designStyle, primaryColor, targetAudience, technologies, pages, animations

CRITICAL: You must respond with COMPLETE, VALID JSON only. No truncation, no "...", no partial responses.

RESPONSE FORMAT (COMPLETE THIS EXACT STRUCTURE):
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
  "followUpQuestions": [
    {
      "question": "Specific question text for missing required slot",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"]
    }
  ],
  "needsMoreInfo": boolean,
  "refinedPrompt": "A comprehensive project specification following the Project Specification Format above, filled with extracted information and professional recommendations"
}

RULES:
- Generate 3-4 realistic options for each follow-up question
- Focus on projectName, projectType, mainFeatures if missing
- Keep refinedPrompt concise but complete
- NEVER use "..." or truncate any part of the JSON response
- Always close all brackets and quotes properly`

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
