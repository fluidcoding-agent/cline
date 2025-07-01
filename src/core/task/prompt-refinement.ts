import { ApiHandler } from "@api/index"
import { findLastIndex } from "@shared/array"
import { ClineApiReqInfo, ClineAskQuestion, ClineMessage } from "@shared/ExtensionMessage"

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
}

// Template
function getWebProjectTemplate() {
	return {
		name: "Modern Web Application Template",
		description: "A comprehensive template for creating modern web applications",
		slots: {
			projectName: {
				description: "Name of the project/application",
				required: true,
			},
			projectType: {
				description: "Type of web application",
				required: true,
				options: [
					"portfolio",
					"blog",
					"dashboard",
					"landing-page",
					"e-commerce",
					"saas",
					"corporate",
					"personal",
					"educational",
					"entertainment",
				],
			},
			mainFeatures: {
				description: "Key features and functionality",
				required: true,
			},
			designStyle: {
				description: "Visual design preferences",
				required: true,
				options: [
					"modern",
					"minimalist",
					"professional",
					"playful",
					"corporate",
					"creative",
					"elegant",
					"bold",
					"clean",
					"vintage",
				],
			},
			primaryColor: {
				description: "Primary color scheme",
				required: true,
				options: ["blue", "green", "purple", "red", "orange", "pink", "teal", "indigo", "gray", "custom"],
			},
			targetAudience: {
				description: "Target users or audience",
				required: true,
			},
			technologies: {
				description: "Preferred technologies or frameworks",
				required: true,
				options: ["React", "Vue", "Angular", "Next.js", "Nuxt.js", "Svelte", "Vanilla JS", "WordPress", "custom"],
			},
			pages: {
				description: "Specific pages or sections needed",
				required: true,
			},
			animations: {
				description: "Animation or interaction preferences",
				required: false,
				options: ["subtle", "smooth", "bouncy", "minimal", "none", "custom"],
			},
			responsiveDesign: {
				description: "Mobile responsiveness requirements",
				required: false,
				options: ["mobile-first", "desktop-first", "tablet-optimized", "all-devices"],
			},
			performance: {
				description: "Performance requirements",
				required: false,
				options: ["fast", "standard", "lightweight", "feature-rich"],
			},
			accessibility: {
				description: "Accessibility requirements",
				required: false,
				options: ["basic", "wcag-aa", "wcag-aaa", "screen-reader-friendly"],
			},
			seo: {
				description: "SEO requirements",
				required: false,
				options: ["basic", "advanced", "e-commerce-seo", "blog-seo"],
			},
			authentication: {
				description: "User authentication needs",
				required: false,
				options: ["none", "basic-login", "social-login", "advanced-auth"],
			},
			contentManagement: {
				description: "Content management approach",
				required: false,
				options: ["static", "cms", "headless-cms", "database-driven"],
			},
			analytics: {
				description: "Analytics and tracking needs",
				required: false,
				options: ["google-analytics", "custom-tracking", "privacy-focused", "none"],
			},
			thirdPartyIntegrations: {
				description: "Third-party integrations needed",
				required: false,
				options: ["payment-gateway", "social-media", "email-service", "maps", "none"],
			},
			budget: {
				description: "Budget considerations",
				required: false,
				options: ["low-cost", "standard", "premium", "enterprise"],
			},
			timeline: {
				description: "Development timeline",
				required: false,
				options: ["quick-prototype", "standard", "comprehensive", "enterprise"],
			},
		},
	}
}

// Project Specification Format
function getProjectSpecificationFormat(): string {
	return `
	## Project Specification Format

	Create a comprehensive project specification using the following structure:

	### Project Overview
	- **Project Name**: [Extracted or inferred project name]
	- **Project Type**: [Type of web application (portfolio, e-commerce, blog, dashboard, landing page, etc.)]
	- **Target Audience**: [Who will use this application - demographics, user personas]
	- **Project Goals**: [Main objectives and purpose - business goals, user goals]
	- **Success Metrics**: [How to measure project success - KPIs, conversion rates, engagement metrics]
	- **Timeline**: [Expected development timeline and milestones]

	### Technical Requirements
	- **Preferred Technologies**: [Frontend frameworks, libraries, tools - React, Vue, Angular, etc.]
	- **Backend Requirements**: [Server-side needs - API, database, authentication]
	- **Architecture**: [Basic structure and approach - SPA, MPA, microservices, etc.]
	- **Platform**: [Web, mobile-responsive, PWA, desktop app, etc.]
	- **Browser Support**: [Target browsers and versions - Chrome, Firefox, Safari, Edge]
	- **Performance Requirements**: [Load times, Core Web Vitals, optimization needs]
	- **Security Requirements**: [Authentication, authorization, data protection needs]
	- **SEO Requirements**: [Search engine optimization needs, meta tags, structured data]
	- **Accessibility**: [WCAG compliance level, screen reader support, keyboard navigation]

	### Design Specifications
	- **Design Style**: [Modern, minimalist, professional, playful, corporate, etc.]
	- **Brand Guidelines**: [Logo usage, brand colors, visual identity requirements]
	- **Color Palette**: 
	  - Primary Color: [Main brand color with hex code]
	  - Secondary Colors: [Supporting colors with hex codes]
	  - Accent Colors: [Call-to-action and highlight colors with hex codes]
	  - Neutral Colors: [Background, text, border colors with hex codes]
	  - Color Accessibility: [Contrast ratios, color blindness considerations]
	- **Typography**: 
	  - Heading Fonts: [Font family for titles and headings with fallbacks]
	  - Body Fonts: [Font family for content text with fallbacks]
	  - Font Sizes: [Responsive text scaling approach - rem/em units, breakpoint-specific sizes]
	  - Font Weights: [Light, regular, medium, bold, extra-bold usage]
	  - Line Heights: [Readability considerations, spacing between lines]
	- **Layout & Spacing**:
	  - Grid System: [12-column, flexbox, css grid approach with specific breakpoints]
	  - Breakpoints: [Mobile: 320px, Tablet: 768px, Desktop: 1024px, Large: 1200px+]
	  - Spacing Scale: [Consistent margin/padding system - 4px, 8px, 16px, 24px, 32px, 48px, 64px]
	  - Container Widths: [Max-widths, padding, centering approach]
	  - Section Spacing: [Vertical rhythm, section-to-section spacing]
	- **UI Components**:
	  - Button Styles: [Primary, secondary, outline, ghost variations with states]
	  - Form Elements: [Input fields, dropdowns, checkboxes, radio buttons styling]
	  - Navigation: [Header, sidebar, breadcrumb, footer, mobile menu styles]
	  - Cards & Containers: [Content containers, card layouts, modal styles]
	  - Tables & Lists: [Data presentation, list styling, pagination]
	  - Loading States: [Skeleton screens, spinners, progress indicators]
	- **Visual Effects**:
	  - Shadows: [Box shadows, text shadows with specific values]
	  - Border Radius: [Corner rounding approach - 4px, 8px, 16px, full rounded]
	  - Animations: [Hover effects, transitions, loading states, micro-interactions]
	  - Gradients: [Background gradients, button gradients, overlay effects]
	  - Icons: [Icon system, icon library, icon sizing and spacing]

	### Content & Media Requirements
	- **Content Strategy**: [Type of content, content management approach]
	- **Images & Media**: [Image formats, sizes, optimization requirements]
	- **Icons & Illustrations**: [Icon style, illustration style, icon library]
	- **Video Content**: [Video player requirements, autoplay settings, controls]
	- **Interactive Elements**: [Maps, charts, sliders, carousels, tooltips]
	- **Multilingual Support**: [Internationalization needs, RTL support]

	### Feature Requirements
	- **Core Features**: [Essential functionality that must be included]
	- **Additional Features**: [Nice-to-have features, future enhancements]
	- **User Interactions**: [How users will interact with the application]
	- **Data Management**: [Data storage, retrieval, caching strategies]
	- **User Authentication**: [Login, registration, password reset, social login]
	- **User Profiles**: [User account management, profile customization]
	- **Search Functionality**: [Search algorithms, filters, sorting options]
	- **Notifications**: [Email, push, in-app notification systems]
	- **Analytics Integration**: [Google Analytics, custom tracking, event monitoring]
	- **Third-party Integrations**: [Payment gateways, social media, APIs]

	### Page Structure & Navigation
	- **Required Pages**: [List of necessary pages/sections with descriptions]
	- **Page Hierarchy**: [Site structure, parent-child page relationships]
	- **Navigation Structure**: [Main menu, secondary navigation, breadcrumbs]
	- **URL Structure**: [SEO-friendly URLs, routing strategy]
	- **Mobile Navigation**: [Hamburger menu, bottom navigation, gesture support]
	- **Footer Content**: [Links, social media, contact information, legal pages]

	### User Experience (UX) Requirements
	- **User Journey**: [User flow, conversion funnel, key user paths]
	- **Information Architecture**: [Content organization, categorization, labeling]
	- **Usability Requirements**: [Ease of use, learnability, efficiency goals]
	- **Error Handling**: [404 pages, form validation, error messages]
	- **Loading States**: [Skeleton screens, progress indicators, optimistic updates]
	- **Feedback Mechanisms**: [Success messages, confirmation dialogs, tooltips]

	### Performance & Optimization
	- **Loading Speed**: [Target load times, Core Web Vitals goals]
	- **Image Optimization**: [WebP support, lazy loading, responsive images]
	- **Code Splitting**: [Bundle optimization, lazy loading strategies]
	- **Caching Strategy**: [Browser caching, CDN usage, service worker]
	- **Minification**: [CSS/JS minification, compression, tree shaking]

	### Testing & Quality Assurance
	- **Cross-browser Testing**: [Browser compatibility requirements]
	- **Mobile Testing**: [Device testing, responsive design validation]
	- **Performance Testing**: [Lighthouse scores, load time testing]
	- **Accessibility Testing**: [Screen reader testing, keyboard navigation]
	- **User Testing**: [Usability testing, user feedback collection]

	### Deployment & Hosting
	- **Hosting Platform**: [Vercel, Netlify, AWS, custom server, etc.]
	- **Domain & SSL**: [Domain requirements, HTTPS implementation]
	- **Environment Setup**: [Development, staging, production environments]
	- **CI/CD Pipeline**: [Automated testing, deployment process]
	- **Monitoring**: [Error tracking, performance monitoring, uptime monitoring]

	### Implementation Details
	- **Development Approach**: [Step-by-step implementation strategy]
	- **Code Organization**: [Component structure, file naming conventions]
	- **State Management**: [Redux, Context API, Zustand, etc.]
	- **API Integration**: [REST/GraphQL, error handling, loading states]
	- **File Structure**: 
	  - Project Organization: [Root directory structure and main folders]
	  - Asset Management: [Images, fonts, icons, media files organization]
	  - Source Code Structure: [Main code files, modules, components organization]
	  - Configuration Files: [Settings, environment, build configuration placement]
	  - Documentation: [README, docs, comments structure]
	  - Build Output: [Distribution, compiled files location]
	- **Development Tools**: [Linting, formatting, pre-commit hooks]
	- **Package Management**: [Dependencies, dev dependencies, version management]

	### Maintenance & Support
	- **Content Updates**: [Content management system, update process]
	- **Bug Fixes**: [Issue tracking, bug reporting process]
	- **Feature Updates**: [Update schedule, version management]
	- **Backup Strategy**: [Data backup, code backup, disaster recovery]
	- **Documentation**: [User guides, technical documentation, API docs]

	Use this format to create a clear, actionable specification that a developer can immediately use to build the project. Each section should contain specific, measurable, and implementable details rather than vague descriptions.`
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
		let finalTask = refinedPrompt.refinedPrompt
		await taskInstance.say("text", `Refined prompt: \n${finalTask}`)

		return {
			originalPrompt: prompt,
			refinedPrompt: `## Original User Prompt\n${prompt}\n\n${refinedPrompt.refinedPrompt}`,
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
