import { ApiHandler } from "@api/index"
import { findLastIndex } from "@shared/array"
import { ClineApiReqInfo, ClineAskQuestion, ClineMessage } from "@shared/ExtensionMessage"
import * as vscode from "vscode"

export interface FollowUpQuestion {
	question: string
	options: string[]
}

export interface EnhancedRefinementResult {
	refinedPrompt: string
	explanation: string
	needsMoreInfo?: boolean
	followUpQuestions?: FollowUpQuestion[]
}

export interface RefinedPromptResult {
	refinedPrompt: string
	needsMoreInfo: boolean
	followUpQuestions: FollowUpQuestion[]
	originalPrompt: string
	explanation: string
	success: boolean
	fileUri?: vscode.Uri
}

// Template
function getWebProjectTemplate() {
	return {
		name: "Focused Web Application Template",
		description: "A streamlined template for creating web applications with essential requirements",
		slots: {
			projectName: {
				description: "Name of the project/application",
				required: true,
			},
			projectType: {
				description: "Type of web application",
				required: true,
				options: ["dashboard", "admin-panel", "client-portal", "service-platform"],
			},
			mainPurpose: {
				description: "Core objective and what the application should accomplish",
				required: true,
				options: ["showcase-work", "share-content", "manage-data", "generate-leads"],
			},
			essentialFeatures: {
				description: "Must-have functionality that defines the project",
				required: true,
				options: ["contact-form", "data-display", "user-authentication", "payment-integration", "search-function"],
			},
			keyPages: {
				description: "Main pages or sections that are absolutely necessary",
				required: true,
				options: ["home", "about", "contact", "services", "products", "dashboard", "login"],
			},
			visualStyle: {
				description: "Visual design preferences (modern, clean, professional, etc.)",
				required: true,
				options: ["modern", "clean", "professional", "minimalist", "creative", "corporate", "playful", "elegant"],
			},
			primaryColor: {
				description: "Primary color preference",
				required: true,
				options: ["blue", "green", "purple", "red", "orange", "pink", "gray", "black", "white"],
			},
			technologyPreference: {
				description: "Preferred frontend framework or technology",
				required: true,
				options: ["react", "vue", "angular", "vanilla-js", "nextjs", "nuxt", "svelte", "html-css"],
			},
			navigationType: {
				description: "Navigation structure preference",
				required: false,
				options: ["header-only", "sidebar", "breadcrumb", "footer-nav", "tab-navigation", "hamburger-menu"],
			},
			componentStyle: {
				description: "UI component design preference",
				required: false,
				options: ["minimal", "material-design", "glassmorphism", "neumorphism", "flat-design", "skeuomorphic"],
			},
			typographyScale: {
				description: "Typography system preference",
				required: false,
				options: ["large-scale", "medium-scale", "small-scale", "variable-scale", "fixed-scale"],
			},
			layoutSystem: {
				description: "Layout and grid system preference",
				required: false,
				options: ["12-column-grid", "flexbox", "css-grid", "bootstrap-grid", "tailwind-grid"],
			},
			interactionStyle: {
				description: "Interactive elements and animations preference",
				required: false,
				options: ["subtle", "smooth", "bouncy", "minimal", "dramatic", "none"],
			},
		},
	}
}

// Project Specification Format
function getProjectSpecificationFormat(): string {
	return `
	## Project Specification Format

	Create a focused project specification using the following structure:

	### Project Overview
	- **Project Name**: [Extracted or inferred project name]
	- **Project Type**: [Type of web application (portfolio, blog, dashboard, landing page, etc.)]
	- **Main Purpose**: [Core objective and what the application should accomplish]

	### Core Requirements
	- **Essential Features**: [Must-have functionality that defines the project]
	- **Key Pages/Sections**: [Main pages or sections that are absolutely necessary]
	- **User Actions**: [Primary interactions users will perform]

	### Technical Approach
	- **Technology Stack**: [Recommended frontend framework and key libraries]
	- **Responsive Design**: [Mobile-first approach with breakpoints]
	- **Basic Styling**: [Simple color scheme and typography preferences]

	### Design Direction
	- **Visual Style**: [Modern, clean, professional, etc.]
	- **Color Scheme**: [Primary color and 2-3 supporting colors]
	- **Layout**: [Simple grid or flexbox approach]

	### UI/UX Specifications
	- **Navigation Structure**: [Header, sidebar, breadcrumb, footer layout]
	- **Component Design**:
	  - Buttons: [Primary, secondary, outline button styles]
	  - Forms: [Input fields, dropdowns, checkboxes, radio buttons]
	  - Cards: [Content card layouts and styling]
	  - Tables: [Data table design and functionality]
	  - Modals: [Dialog and popup window styles]
	- **Typography System**:
	  - Heading Hierarchy: [H1, H2, H3, H4 font sizes and weights]
	  - Body Text: [Paragraph and content text styling]
	  - Font Families: [Primary and secondary font choices]
	- **Spacing & Layout**:
	  - Grid System: [12-column, flexbox, or CSS Grid approach]
	  - Breakpoints: [Mobile, tablet, desktop responsive breakpoints]
	  - Spacing Scale: [Consistent margin and padding system]
	- **Interactive Elements**:
	  - Hover Effects: [Button and link hover states]
	  - Transitions: [Smooth animations and transitions]
	  - Loading States: [Loading spinners and skeleton screens]
	- **Visual Hierarchy**:
	  - Information Architecture: [Content organization and flow]
	  - Call-to-Action Placement: [Primary action button positioning]
	  - Content Prioritization: [Most important content emphasis]

	### Implementation Plan
	- **Project Structure**: [Basic folder organization]
	- **Development Steps**: [3-4 key implementation phases]
	- **Key Components**: [Main UI elements to build]

	Focus on what is essential for the project to function and meet the user's core needs. Avoid over-engineering or adding unnecessary complexity.`
}

/**
 * Saves the refined prompt as a markdown file
 */
async function saveRefinedPromptAsMarkdown(content: string, taskId: string): Promise<vscode.Uri | undefined> {
	try {
		let saveUri: vscode.Uri

		// 워크스페이스 폴더 확인
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (workspaceFolders && workspaceFolders.length > 0) {
			// 워크스페이스가 열려있으면 워크스페이스 루트에 저장
			saveUri = workspaceFolders[0].uri
		} else {
			// 워크스페이스가 없으면 사용자의 홈 디렉토리에 저장
			const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd()
			saveUri = vscode.Uri.file(homeDir)
		}

		const filename = `refined-project-specification-${taskId}.md`
		const fileUri = vscode.Uri.joinPath(saveUri, filename)

		const encoder = new TextEncoder()
		await vscode.workspace.fs.writeFile(fileUri, encoder.encode(content))
		console.log(`[saveRefinedPromptAsMarkdown] Refined prompt saved: ${fileUri.toString()}`)

		// Save snapshot file
		try {
			const snapshotFileUri = vscode.Uri.joinPath(saveUri, `refined-project-specification-${taskId}-snapshot.md`)
			await vscode.workspace.fs.writeFile(snapshotFileUri, encoder.encode(content))
			console.log(`[saveRefinedPromptAsMarkdown] Snapshot file created: ${snapshotFileUri.toString()}`)

			// Make snapshot file read-only immediately after creation
			const fs = await import("fs")
			await fs.promises.chmod(snapshotFileUri.fsPath, 0o444).catch((chmodError: any) => {
				console.warn("[saveRefinedPromptAsMarkdown] Failed to make snapshot file read-only:", chmodError)
			})
		} catch (error) {
			console.error("[saveRefinedPromptAsMarkdown] Failed to save snapshot file:", error)
		}

		return fileUri
	} catch (error) {
		console.error("[saveRefinedPromptAsMarkdown] Failed to save refined prompt:", error)
		return undefined
	}
}

function buildAnalysisPrompt(
	webProjectTemplate: any,
	requiredFields: string[],
	optionalFields: string[],
	extractedDataStructure: string,
): string {
	return `You are a web project specification assistant. Extract information from user prompts and generate follow-up questions for any missing required data.

IMPORTANT: All follow-up questions and options must be generated in Korean language.

TEMPLATE STRUCTURE:
${JSON.stringify(webProjectTemplate, null, 2)}

QUESTION GENERATION RULES:
- For ANY missing required field (required: true), MUST generate a specific follow-up question IN KOREAN with multiple choice options
- For all optional fields (required: false), create ONE comprehensive question IN KOREAN that includes all optional field names in the question text itself, with EMPTY options array (for open-ended response)
- ALL follow-up questions and options must be written in Korean language
- Required fields: ${requiredFields.join(", ")}
- Optional fields: ${optionalFields.join(", ")}

CRITICAL: You must respond with COMPLETE, VALID JSON only. No truncation, no "...", no partial responses.

RESPONSE FORMAT (COMPLETE THIS EXACT STRUCTURE):
{
  "extractedData": {
${extractedDataStructure}
  },
  "missingRequiredSlots": ["array of missing required slot names"],
  "followUpQuestions": [
    {
      "question": "Specific question text for missing required slot OR comprehensive question for optional slots",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"]
    }
  ],
  "needsMoreInfo": boolean
}

RULES:
- For required fields: Generate 3-4 realistic options for each follow-up question IN KOREAN
- For optional fields: Include all optional field names (${optionalFields.join(", ")}) directly in the question text with empty options array
- MUST ask about ALL missing required fields individually: ${requiredFields.join(", ")}
- Optional fields question format: "추가적으로 다음 항목들에 대해 선호사항이 있으시면 자유롭게 알려주세요: [list all optional fields with descriptions]" with "options": []
- ALL questions must be written in Korean
- NEVER use "..." or truncate any part of the JSON response
- Always close all brackets and quotes properly`
}

function buildRefinementPrompt(projectSpecificationFormat: string, requiredFields: string[], optionalFields: string[]): string {
	return `You are a web project specification expert. Create a comprehensive project specification based on the provided information.

${projectSpecificationFormat}

CRITICAL: You must respond with COMPLETE, VALID JSON only. No truncation, no "...", no partial responses.

RESPONSE FORMAT (COMPLETE THIS EXACT STRUCTURE):
{
  "missingRequiredSlots": ["array of missing required slot names"],
  "refinedPrompt": "A comprehensive project specification in English following the Project Specification Format above, filled with extracted information, detailed technical specifications, and professional recommendations"
}

RULES:
- First, check if any required fields are still missing (${requiredFields.join(", ")})
- If missing required fields exist, list them in missingRequiredSlots array
- If all required fields are present, create a comprehensive refinedPrompt in English
- REFINED PROMPT MUST BE WRITTEN IN ENGLISH with detailed, specific, and professional content
- Use the Project Specification Format structure exactly, filling each section with comprehensive details in English
- Include concrete technical specifications, specific recommendations, and actionable implementation details
- NEVER use "..." or truncate any part of the JSON response
- Always close all brackets and quotes properly`
}

export async function refinePrompt(prompt: string, apiHandler: ApiHandler, taskInstance?: any): Promise<RefinedPromptResult> {
	try {
		// 1단계: 데이터 추출 및 분석
		let refinedPrompt = await performLLMPromptRefinement(prompt, apiHandler, taskInstance, "analysis")

		// 추가 질문
		if (refinedPrompt.needsMoreInfo) {
			const questionList = (refinedPrompt.followUpQuestions || []).map(
				(followUpQ) =>
					({
						question: followUpQ.question,
						options: followUpQ.options,
						selected: "",
					}) satisfies ClineAskQuestion,
			)

			await askMoreQuestion(questionList, taskInstance)
			for (const ques of questionList) {
				prompt += `\n\nQ: ${ques.question}\nA: ${ques.selected}`
			}
		}

		// 2단계: 개선된 프롬프트 생성
		refinedPrompt = await performLLMPromptRefinement(prompt, apiHandler, taskInstance, "refinement")
		await taskInstance.say("text", `Refined prompt: \n${refinedPrompt.refinedPrompt}`)
		refinedPrompt.refinedPrompt = `## Original User Prompt\n${prompt}\n\n${refinedPrompt.refinedPrompt}`

		// 마크다운 파일로 저장
		const taskId = taskInstance?.taskId || `task-${Date.now()}`
		const fileUri = await saveRefinedPromptAsMarkdown(refinedPrompt.refinedPrompt, taskId)
		await saveRefinedPromptAsMarkdown(refinedPrompt.refinedPrompt, taskId)

		return {
			originalPrompt: prompt,
			refinedPrompt: refinedPrompt.refinedPrompt,
			explanation: refinedPrompt.explanation,
			needsMoreInfo: refinedPrompt.needsMoreInfo || false,
			followUpQuestions: refinedPrompt.followUpQuestions || [],
			success: true,
			fileUri: fileUri,
		}
	} catch (error) {
		console.error("Error in prompt refinement:", error)
		return {
			originalPrompt: prompt,
			refinedPrompt: prompt,
			explanation: `LLM refinement failed.`,
			needsMoreInfo: false,
			followUpQuestions: [],
			success: false,
		}
	}
}

async function performLLMPromptRefinement(
	prompt: string,
	apiHandler: ApiHandler,
	taskInstance?: any,
	stage: "analysis" | "refinement" = "analysis",
): Promise<EnhancedRefinementResult> {
	// 템플릿과 포맷 가져오기
	const webProjectTemplate = getWebProjectTemplate()
	const projectSpecificationFormat = getProjectSpecificationFormat()

	// 필수 및 선택 필드 추출
	const requiredFields = Object.entries(webProjectTemplate.slots)
		.filter(([_, slot]: [string, any]) => slot.required === true)
		.map(([key, _]) => key)

	const optionalFields = Object.entries(webProjectTemplate.slots)
		.filter(([_, slot]: [string, any]) => slot.required === false)
		.map(([key, _]) => key)

	// 추출된 데이터 구조 생성
	const allSlotKeys = Object.keys(webProjectTemplate.slots)
	const extractedDataStructure = allSlotKeys.map((key) => `    "${key}": "extracted value or null"`).join(",\n")

	// 단계에 따라 시스템 프롬프트 생성
	let systemPrompt: string
	let userMessage: string

	if (stage === "analysis") {
		// 1단계: 데이터 추출 및 분석
		systemPrompt = buildAnalysisPrompt(webProjectTemplate, requiredFields, optionalFields, extractedDataStructure)
		userMessage = `Analyze this web project request and extract template slot information:

User Request: "${prompt}"

Please extract available information, identify missing required elements, and generate follow-up questions if needed.`
	} else {
		// 2단계: 개선된 프롬프트 생성
		systemPrompt = buildRefinementPrompt(projectSpecificationFormat, requiredFields, optionalFields)
		userMessage = `Create a comprehensive project specification based on the following information:

User Request: "${prompt}"

Please create a detailed project specification following the Project Specification Format.`
	}

	if (taskInstance && taskInstance.say) {
		await taskInstance.say("api_req_started", JSON.stringify({ request: "Refining prompt..." }))
	}

	// Call LLM for template-based analysis
	const stream = apiHandler.createMessage(systemPrompt, [
		{
			role: "user",
			content: userMessage,
		},
	])

	// 스트리밍 시작 메시지
	// if (taskInstance && taskInstance.say) {
	// 	await taskInstance.say("text", "Refining prompt...", undefined, undefined, true)
	// }

	let response = ""
	const start = performance.now()
	let lastUpdateTime = Date.now()
	const updateInterval = 250 // Update UI every 250ms to avoid too many updates

	// Process stream chunks and update UI with refinement progress
	for await (const chunk of stream) {
		if (chunk.type === "text") {
			response += chunk.text

			// Update UI periodically to show progress without overwhelming it
			const now = Date.now()
			if (now - lastUpdateTime > updateInterval && taskInstance && taskInstance.say) {
				// Update progress message with latest refinement content
				// Using the partial flag to indicate this is a progressive update
				await taskInstance.say(
					"reasoning",
					`Refining prompt... (${(now - start) / 1000}s)\n\n${response.slice(-500)}`,
					undefined,
					undefined,
					true,
				)
				lastUpdateTime = now
			}
		}
	}

	// Finalize the partial message
	if (taskInstance && taskInstance.say) {
		await taskInstance.say(
			"text",
			`Completed in ${((performance.now() - start) / 1000).toFixed(1)}s`,
			undefined,
			undefined,
			false,
		)
	}

	updatePromptRefinementStatus("Prompt refinement completed", taskInstance)

	// Parse LLM response
	try {
		const jsonMatch = response.match(/\{[\s\S]*\}/)
		if (!jsonMatch) {
			throw new Error("No JSON found in LLM response")
		}

		const analysisResult = JSON.parse(escapeNewlinesInJsonStrings(jsonMatch[0]))

		if (stage === "analysis") {
			return {
				refinedPrompt: "", // 1단계에서는 빈 문자열
				followUpQuestions: analysisResult.followUpQuestions || [],
				explanation: `Generated ${analysisResult.followUpQuestions?.length || 0} follow-up questions to gather missing information.`,
				needsMoreInfo: analysisResult.needsMoreInfo || false,
			}
		} else {
			return {
				refinedPrompt: analysisResult.refinedPrompt || "",
				followUpQuestions: [], // 2단계에서는 빈 배열
				explanation: "Generated comprehensive project specification.",
				needsMoreInfo: false, // 2단계에서는 항상 false
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

const updatePromptRefinementStatus = (message: string, taskInstance?: any) => {
	if (!taskInstance || !taskInstance.messageStateHandler) {
		return
	}

	const clineMessages = taskInstance.messageStateHandler.getClineMessages()
	const lastApiReqStartedIndex = findLastIndex(clineMessages, (m: ClineMessage) => m.say === "api_req_started")
	if (lastApiReqStartedIndex !== -1) {
		const currentApiReqInfo: ClineApiReqInfo = JSON.parse(clineMessages[lastApiReqStartedIndex].text || "{}")
		taskInstance.messageStateHandler.updateClineMessage(lastApiReqStartedIndex, {
			text: JSON.stringify({
				...currentApiReqInfo,
				request: message,
				cost: 0.001,
			} satisfies ClineApiReqInfo),
		})
	}
}

const askMoreQuestion = async (questionList: ClineAskQuestion[], taskInstance?: any): Promise<ClineAskQuestion[]> => {
	for (const ques of questionList) {
		const sharedMessage = {
			question: ques.question,
			options: ques.options,
		} satisfies ClineAskQuestion

		const {
			text,
			// images,
			// files: followupFiles,
		} = await taskInstance.ask("followup", JSON.stringify(sharedMessage), false)

		await taskInstance.say("text", `Here is the answer: ${text}`)
		ques.selected = text
	}
	return questionList
}
