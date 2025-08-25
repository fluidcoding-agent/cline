import fs from "fs/promises"
import * as vscode from "vscode"
import { HostProvider } from "@/hosts/host-provider"
import { createDirectoriesForFile, fileExistsAtPath, writeFile } from "@/utils/fs"
import { Controller } from "../controller"
import { extractTag, extractTagAsLines, PHASE_RETRY_LIMIT } from "./utils"

export enum PhaseStatus {
	Pending = "pending",
	InProgress = "in-progress",
	Completed = "completed",
	Skipped = "skipped",
	Failed = "failed",
}

export interface RequirementItem {
	id: string
	description: string
}

export interface RequirementSpecReinforcement {
	requirements: RequirementItem[]
	specs: RequirementItem[]
}

export interface ProjectOverview {
	title?: string
	projectVision?: string[]
	common?: string[]
	primaryObjectives?: Subtask[]
}

export interface Phase {
	phaseIdx: number
	title: string
	exeOrderIdx: number
	dependencies?: string[]
	explain?: string[]
	requirements?: {
		list: RequirementItem[]
		note?: string
	}
	objectives?: string[]
	deliverables?: string[]
	completionCriteria?: Subtask[]
	validationChecklist?: Subtask[]
	// Legacy fields for backward compatibility
	prerequisites?: string[]
	relatedRequirements?: string[]
	requirementCoverage?: string[]
	coreObjectives?: string[]
	functionalRequirements?: string[]
	nonFunctionalRequirements?: string[]
	handoffChecklist?: Subtask[]
	integrationObjectives?: string[]
	integrationSteps?: string[]
	originalRequirementsValidations?: Subtask[]
	systemWideTesting?: string[]
	finalDeliverables?: Subtask[]
	paths?: string[]
	subtasks?: Subtask[]
}

export interface Subtask {
	index: number
	description: string
	completed: boolean
}

export interface PhaseState {
	index: number
	taskId?: string
	projOverview?: ProjectOverview
	executionPlan?: string
	phase?: Phase
	status: PhaseStatus
	startTime?: number
	endTime?: number
	retryCount?: number
	startCheckpointHash?: string
}

export interface Requirement {
	id: string
	description: string
}

export type RequirementInventory = Record<string, string>

export interface PhaseResult {
	phaseId: number
	summary: string
	subtaskResults: Record<string, string>
	executionTime: number
}

export interface ParsedPlan {
	projOverview: ProjectOverview
	executionPlan: string
	phases: Phase[]
}

/**
 * Separates multi-line text into lines and returns them as a cleaned array.
 * - Removes empty lines.
 * - Trims whitespace from the beginning and end of each line.
 * - Optionally removes indentation or list markers (-, *, 1., etc.).
 */
function splitAndCleanLines(text: string, removeListMarkers: boolean = false): string[] {
	if (!text) {
		return []
	}

	// Split into lines
	const lines = text.split(/\r?\n/)
	const result: string[] = []

	for (let line of lines) {
		line = line.trim()

		if (!line) {
			continue
		}

		// Remove list markers (optional)
		if (removeListMarkers) {
			// Numbered list (1., 2., etc.)
			line = line.replace(/^\d+\.\s*/, "")
			// Bullet list (-, *, • etc.)
			line = line.replace(/^[-*•]\s*/, "")
		}

		result.push(line)
	}

	return result
}

/**
 * Extracts the content of a specific tag and returns it as an array of lines.
 */
function extractTagAsLinesNew(tag: string, source: string, removeListMarkers: boolean = false): string[] {
	const content = extractTag(tag, source)
	return splitAndCleanLines(content, removeListMarkers)
}

/**
 * Parses requirement lines in the format "- REQ-XXX: description" or "- SPEC-XXX: description" into RequirementItem array
 */
function parseRequirementsList(tag: string, source: string): RequirementItem[] {
	const lines = extractTagAsLinesNew(tag, source, true)
	const requirements: RequirementItem[] = []

	for (const line of lines) {
		// Match pattern: REQ-XXX: description or SPEC-XXX: description
		const reqMatch = line.match(/^((?:REQ|SPEC)-\d{3})\s*:\s*(.+)$/i)
		if (reqMatch) {
			const [, id, description] = reqMatch
			requirements.push({
				id: id.trim(),
				description: description.trim(),
			})
		}
	}

	return requirements
}

/**
 * Parses requirement_spec_reinforcement_list section
 */
export function parseRequirementSpecReinforcement(raw: string): RequirementSpecReinforcement | null {
	const reinforcementRe = /<requirement_spec_reinforcement_list>([\s\S]*?)<\/requirement_spec_reinforcement_list>/i
	const match = raw.match(reinforcementRe)

	if (!match) {
		return null
	}

	const content = match[1].trim()
	const requirements = parseRequirementsList("requirements", content)
	const specs = parseRequirementsList("specs", content)

	return {
		requirements,
		specs,
	}
}

/**
 * Reinforces phase requirements with detailed descriptions from reinforcement data
 */
export function reinforcePhaseRequirements(phases: Phase[], reinforcement: RequirementSpecReinforcement): Phase[] {
	if (!reinforcement || reinforcement.requirements.length === 0) {
		return phases
	}

	// Create a lookup map for faster searching
	const reinforcementMap = new Map<string, string>()
	for (const req of reinforcement.requirements) {
		reinforcementMap.set(req.id, req.description)
	}

	// Process each phase
	return phases.map((phase) => {
		if (!phase.requirements?.list) {
			return phase
		}

		// Replace requirements with reinforced descriptions
		const reinforcedRequirements = phase.requirements.list.map((req) => {
			const reinforcedDescription = reinforcementMap.get(req.id)
			return {
				...req,
				description: reinforcedDescription || req.description,
			}
		})

		return {
			...phase,
			requirements: {
				...phase.requirements,
				list: reinforcedRequirements,
			},
		}
	})
}

/**
 * Parses the project overview section from raw text and extracts structured data
 */
export function parseProjectOverviewSection(source: string): ProjectOverview {
	// Extract the project_overview block
	const projViewRe = /<project_overview>([\s\S]*?)<\/project_overview>/i
	const pvMatch = source.match(projViewRe)
	if (!pvMatch) {
		console.error("[parseProjectOverviewSection] project_overview section not found")
		throw new Error("project_overview section not found.")
	}
	const projOverviewContent = pvMatch[1].trim()

	// Extract each subsection
	const title = extractTag("title", projOverviewContent)
	const projectVision = extractTagAsLinesNew("project_vision", projOverviewContent, true)
	const common = extractTagAsLinesNew("common", projOverviewContent, true)
	const primaryObjectives = parseChecklist("primary_objectives", projOverviewContent)

	const result = {
		title: title || undefined,
		projectVision: projectVision.length > 0 ? projectVision : undefined,
		common: common.length > 0 ? common : undefined,
		primaryObjectives: primaryObjectives.length > 0 ? primaryObjectives : undefined,
	}

	return result
}

export function parseProjectOverview(source: string): string {
	// Extract only the project_overview block
	const projViewRe = /<project_overview>([\s\S]*?)<\/project_overview>/i
	const pvMatch = source.match(projViewRe)
	if (!pvMatch) {
		console.error("[parseProjectOverview] project_overview section not found")
		throw new Error("project_overview section not found.")
	}
	const projOverview = pvMatch[1].trim()
	return projOverview
}

export function parseExecutionPlan(raw: string): string {
	// Extract the execution plan section from the raw text
	const planRegex = /<execution_plan>([\s\S]*?)<\/execution_plan>/i
	const planMatch = raw.match(planRegex)
	if (!planMatch) {
		console.warn("[parseExecutionPlan] No execution plan section found")
		return ""
	}
	const executionPlan = planMatch[1].trim()
	return executionPlan
}

export function parseRequirement(raw: string): RequirementInventory {
	// Extract the requirement inventory section from the raw text
	const invRe = /<requirement_inventory>([\s\S]*?)<\/requirement_inventory>/i
	const invMatch = raw.match(invRe)

	if (!invMatch) {
		// Try to extract from requirement_spec_reinforcement_list as fallback
		const reinforcement = parseRequirementSpecReinforcement(raw)
		if (reinforcement && reinforcement.requirements.length > 0) {
			const inventory: RequirementInventory = {}
			reinforcement.requirements.forEach((req) => {
				inventory[req.id] = req.description
			})
			return inventory
		}

		// If no requirements found anywhere, return empty inventory instead of throwing error
		console.warn("[parseRequirement] No requirements found, returning empty inventory")
		return {}
	}

	const inventoryRaw = invMatch[1].trim()
	const lines = inventoryRaw.split(/\r?\n/)
	const inventory: RequirementInventory = {}

	for (const rawLine of lines) {
		const line = rawLine.trim()
		if (!line) {
			continue
		}
		const reqMatch = line.match(/^-+\s*(REQ-\d{3})\s*:\s*(.+)$/i)
		if (reqMatch) {
			const [, id, description] = reqMatch
			inventory[id] = description.trim()
		}
	}

	return inventory
}

/** Convert checklist lines to Subtask[] */
function parseChecklist(tag: string, block: string): Subtask[] {
	const criteria = extractTag(tag, block)
	if (!criteria) {
		// fallback: use Phase title as a single Subtask
		return [{ index: 1, description: extractTag(block, "title"), completed: false }]
	}

	const subtasks: Subtask[] = []
	let subIdx = 1
	criteria.split(/\r?\n/).forEach((ln) => {
		// - [ ] content   |   - content   |   1. content
		const m = ln.match(/^\s*(?:[-*]|\d+\.)\s*(?:\[\s*\]\s*)?(.+)$/)
		if (m) {
			subtasks.push({ index: subIdx++, description: m[1].trim(), completed: false })
		}
	})

	// If there are no check items, use the Phase title as the default Subtask
	if (subtasks.length === 0) {
		subtasks.push({ index: 1, description: extractTag(block, "title"), completed: false })
	}
	return subtasks
}

/** Filter out non-REQ items from subtasks (used for requirements validation) */
function filterRequirementSubtasks(subtasks: Subtask[]): Subtask[] {
	return filterSubtasksByPattern(subtasks, /^REQ-\d+:/i)
}

/** Generic function to filter subtasks based on a pattern */
function filterSubtasksByPattern(subtasks: Subtask[], pattern: RegExp): Subtask[] {
	const filtered = subtasks.filter((subtask) => {
		const desc = subtask.description.trim()
		return pattern.test(desc)
	})

	// Re-index the filtered items
	return filtered.map((subtask, index) => ({
		...subtask,
		index: index + 1, // Re-index starting from 1
	}))
}

function extractRequirement(source: string): string[] {
	const re = /<related_input_requirements>\s*([\s\S]*?)\s*<\/related_input_requirements>/i
	const match = source.match(re)
	const requirements = match ? match[1].trim() : ""

	const lines = requirements.split(/\r?\n/)
	const relatedRequirements: string[] = []
	for (const rawLine of lines) {
		const line = rawLine.trim()
		relatedRequirements.push(line)
	}
	return relatedRequirements
}

// Improved parsePhase function with new structure
export function parsePhaseNew(raw: string): Phase[] {
	const phaseBlocks = raw.match(/<phase>([\s\S]*?)<\/phase>/gi) ?? []
	const phases: Phase[] = []

	console.log(`[parsePhaseNew] Found ${phaseBlocks.length} phase blocks`)

	if (phaseBlocks.length === 0) {
		console.error("[parsePhaseNew] No <phase> blocks found in input")
		return []
	}

	for (let blockIndex = 0; blockIndex < phaseBlocks.length; blockIndex++) {
		const block = phaseBlocks[blockIndex]

		try {
			// Extract basic information
			const numberStr = extractTag("number", block)
			const title = extractTag("title", block)
			const exeOrderStr = extractTag("execution_order", block)
			const dependencies = extractTagAsLinesNew("dependencies", block)
			const explain = extractTagAsLinesNew("explain", block)

			// 공통 필드 초기화
			const phaseData: Partial<Phase> = {
				title,
				dependencies,
				explain,
				requirements: undefined, // Initialize as undefined
				objectives: [],
				deliverables: [],
				completionCriteria: [],
				validationChecklist: [],
			}

			// FINAL 단계와 일반 단계에 따라 데이터 추출
			const isFinalPhase = numberStr === "FINAL"

			if (isFinalPhase) {
				phaseData.objectives = extractTagAsLinesNew("objective", block)
				phaseData.deliverables = extractTagAsLinesNew("deliverables", block)
				phaseData.completionCriteria = parseChecklist("validation_checklist", block)
			} else {
				// For non-FINAL phases, extract requirements
				const requirementsBlock = extractTag("requirements", block)
				if (requirementsBlock) {
					const noteContent = extractTag("note", requirementsBlock)

					phaseData.requirements = {
						list: parseRequirementsList("list", requirementsBlock),
						note: noteContent || undefined,
					}
				}

				phaseData.objectives = extractTagAsLinesNew("objectives", block)
				phaseData.deliverables = extractTagAsLinesNew("deliverables", block)
				phaseData.completionCriteria = parseChecklist("completion_criteria", block)
			}

			// Index calculation - simplify ternary operators
			const phaseIdx = numberStr
				? numberStr.toUpperCase() === "FINAL"
					? phaseBlocks.length
					: parseInt(numberStr, 10)
				: phases.length + 1 // If numberStr doesn't exist, use the next index

			const exeOrderIdx = exeOrderStr ? (exeOrderStr === "LAST" ? phaseBlocks.length : parseInt(exeOrderStr)) : phaseIdx // If exeOrderStr doesn't exist, set it to the same value as phaseIdx

			// Create and add completed Phase object
			const completedPhase = {
				...phaseData,
				phaseIdx,
				exeOrderIdx,
			} as Phase

			phases.push(completedPhase)
		} catch (blockError) {
			console.error(`[parsePhaseNew] Error processing block ${blockIndex + 1}:`, blockError)
			// Continue processing other blocks instead of failing completely
			console.log(`[parsePhaseNew] Skipping block ${blockIndex + 1} and continuing with others...`)
		}
	}

	// Sort by execution order
	const sortedPhases = phases.sort((a, b) => a.exeOrderIdx - b.exeOrderIdx)

	console.log(`[parsePhaseNew] Successfully parsed ${sortedPhases.length} phases`)

	return sortedPhases
}

// Markdown parsing function that works with the new interface structure
export function parsePhaseByMD(raw: string): Phase[] {
	// First, extract the Execution Phases section (with or without emoji)
	const executionPhasesMatch = raw.match(/##\s*(?:📊\s*)?Execution\s*Phases([\s\S]*?)(?=##\s*(?:📝\s*)?Plan\s*Summary|$)/i)
	if (!executionPhasesMatch) {
		console.error("[parsePhaseByMD] Could not find 'Execution Phases' section")
		return []
	}

	const executionPhasesContent = executionPhasesMatch[1]

	// Split phases by ### Phase headers
	const phaseSections = executionPhasesContent.split(/###\s*Phase\s+/gi).slice(1) // Remove empty first element
	const phases: Phase[] = []

	console.log("[parsePhaseByMD] Found phase sections:", phaseSections.length)

	for (const section of phaseSections) {
		// Extract phase number and title from the first line
		const firstLine = section.split("\n")[0].trim()
		const phaseMatch = firstLine.match(/^(\d+|FINAL|Complete\s+System\s+Integration):\s*(.+)$/i)

		if (!phaseMatch) {
			console.warn("[parsePhaseByMD] Could not parse phase header:", firstLine)
			continue
		}

		const [, numberStr, title] = phaseMatch

		// Extract sections using markdown pattern matching
		const extractMDSection = (sectionName: string): string[] => {
			const regex = new RegExp(`\\*\\*${sectionName}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*[^:]+:\\*\\*|---|$)`, "i")
			const match = section.match(regex)
			if (!match) {
				return []
			}

			return match[1]
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line && !line.startsWith("**"))
				.map((line) => line.replace(/^-\s*/, "")) // Remove bullet points
		}

		const extractChecklistSection = (sectionName: string): Subtask[] => {
			const regex = new RegExp(`\\*\\*${sectionName}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*[^:]+:\\*\\*|---|$)`, "i")
			const match = section.match(regex)
			if (!match) {
				return []
			}

			const items = match[1]
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line && (line.startsWith("☐") || line.startsWith("☑")))

			return items.map((item, index) => ({
				index: index + 1,
				description: item.replace(/^[☐☑]\s*/, ""),
				completed: item.startsWith("☑"),
			}))
		}

		// Determine if this is a FINAL/integration phase
		const isFinalPhase =
			numberStr.toUpperCase() === "FINAL" ||
			numberStr.toLowerCase().includes("complete") ||
			title.toLowerCase().includes("integration")

		// Initialize common fields with new interface structure
		const phaseData: Partial<Phase> = {
			title,
			dependencies: [],
			explain: [],
			requirements: undefined,
			objectives: [],
			deliverables: [],
			completionCriteria: [],
			validationChecklist: [],
			// Legacy fields for backward compatibility
			prerequisites: [],
			relatedRequirements: [],
			requirementCoverage: [],
			coreObjectives: [],
			functionalRequirements: [],
			nonFunctionalRequirements: [],
			handoffChecklist: [],
			integrationObjectives: [],
			integrationSteps: [],
			originalRequirementsValidations: [],
			systemWideTesting: [],
			finalDeliverables: [],
		}

		// Extract execution order
		const executionOrderMatch = section.match(/\*\*Execution Order\*\*:\s*(\d+)/i)
		const exeOrderStr = executionOrderMatch ? executionOrderMatch[1] : undefined

		// Extract prerequisites/dependencies
		phaseData.dependencies = extractMDSection("Prerequisites")
		phaseData.prerequisites = phaseData.dependencies // Legacy compatibility

		// Extract data based on whether it's a FINAL phase or a regular phase
		if (isFinalPhase) {
			// FINAL phase specific fields
			phaseData.integrationObjectives = extractMDSection("Integration Objectives")
			phaseData.integrationSteps = extractMDSection("Integration Steps")
			phaseData.originalRequirementsValidations = extractChecklistSection("Original Requirements Validations")
			phaseData.systemWideTesting = extractMDSection("System-Wide Testing")
			phaseData.finalDeliverables = extractChecklistSection("Final Deliverables")

			// Map to new structure
			phaseData.objectives = phaseData.integrationObjectives
			phaseData.completionCriteria = phaseData.finalDeliverables
		} else {
			// Regular phase fields
			phaseData.relatedRequirements = extractMDSection("Related Requirements")
			phaseData.requirementCoverage = extractMDSection("Requirement Coverage")
			phaseData.coreObjectives = extractMDSection("Core Objectives")
			phaseData.functionalRequirements = extractMDSection("Functional Requirements")
			phaseData.deliverables = extractMDSection("Deliverables")
			phaseData.nonFunctionalRequirements = extractMDSection("Non-Functional Requirements")
			phaseData.completionCriteria = extractChecklistSection("Completion Criteria")
			phaseData.handoffChecklist = extractChecklistSection("Handoff Checklist")

			// Map to new structure
			phaseData.objectives = phaseData.coreObjectives
		}

		// Index calculation
		const phaseIdx =
			numberStr && !Number.isNaN(parseInt(numberStr, 10))
				? parseInt(numberStr, 10)
				: isFinalPhase
					? phaseSections.length
					: phases.length + 1

		const exeOrderIdx = exeOrderStr ? parseInt(exeOrderStr, 10) : phaseIdx

		// Create and add completed Phase object
		phases.push({
			...phaseData,
			phaseIdx,
			exeOrderIdx,
		} as Phase)
	}

	// Sort by execution order
	return phases.sort((a, b) => a.exeOrderIdx - b.exeOrderIdx)
}

// Legacy parsePhase function for backward compatibility with <subtask> format
export function parsePhase(raw: string): Phase[] {
	const phaseBlocks = raw.match(/<subtask>([\s\S]*?)<\/subtask>/gi) ?? []
	const phases: Phase[] = []

	console.log("[parsePhase] Found phaseBlocks:", phaseBlocks.length)

	for (const block of phaseBlocks) {
		const numberStr = extractTag("number", block)
		const title = extractTag("title", block)
		const exeOrderStr = extractTag("execution_order", block)
		const prerequisites = extractTagAsLines("prerequisites", block)

		// Initialize common fields with new interface structure
		const phaseData: Partial<Phase> = {
			title,
			// Map legacy fields to new structure
			dependencies: prerequisites,
			objectives: [],
			deliverables: [],
			completionCriteria: [],
			validationChecklist: [],
			// Keep legacy fields for backward compatibility
			prerequisites,
			relatedRequirements: [],
			requirementCoverage: [],
			coreObjectives: [],
			functionalRequirements: [],
			nonFunctionalRequirements: [],
			handoffChecklist: [],
			integrationObjectives: [],
			integrationSteps: [],
			originalRequirementsValidations: [],
			systemWideTesting: [],
			finalDeliverables: [],
		}

		// Extract data based on whether it's a FINAL phase or a regular phase
		if (numberStr === "FINAL") {
			phaseData.integrationObjectives = extractTagAsLines("integration_objectives", block, true)
			phaseData.integrationSteps = extractTagAsLines("integration_steps", block, true)
			phaseData.originalRequirementsValidations = filterRequirementSubtasks(
				parseChecklist("original_requirements_validation", block),
			)
			phaseData.systemWideTesting = extractTagAsLines("system_wide_testing", block, true)
			phaseData.finalDeliverables = parseChecklist("final_deliverables", block)
			// Map to new structure
			phaseData.objectives = phaseData.integrationObjectives
			phaseData.completionCriteria = phaseData.finalDeliverables
		} else {
			phaseData.relatedRequirements = extractRequirement(block)
			phaseData.requirementCoverage = extractTagAsLines("requirement_coverage", block)
			phaseData.coreObjectives = extractTagAsLines("core_objective", block)
			phaseData.functionalRequirements = extractTagAsLines("functional_requirements", block)
			phaseData.deliverables = extractTagAsLines("deliverables_for_next_phase", block)
			phaseData.nonFunctionalRequirements = extractTagAsLines("non_functional_requirements", block)
			phaseData.completionCriteria = parseChecklist("completion_criteria", block)
			phaseData.handoffChecklist = parseChecklist("handoff_checklist", block)
			// Map to new structure
			phaseData.objectives = phaseData.coreObjectives
		}

		// Index calculation - simplify ternary operators
		const phaseIdx = numberStr
			? numberStr.toUpperCase() === "FINAL"
				? phaseBlocks.length
				: parseInt(numberStr, 10)
			: phases.length + 1 // If numberStr doesn't exist, use the next index

		const exeOrderIdx = exeOrderStr ? (exeOrderStr === "LAST" ? phaseBlocks.length : parseInt(exeOrderStr)) : phaseIdx // If exeOrderStr doesn't exist, set it to the same value as phaseIdx

		// Create and add completed Phase object
		phases.push({
			...phaseData,
			phaseIdx,
			exeOrderIdx,
		} as Phase)
	}

	// Sort by execution order
	return phases.sort((a, b) => a.exeOrderIdx - b.exeOrderIdx)
}

export function parsePlanFromOutput(raw: string, isMD: boolean = false): ParsedPlan {
	console.log("[parsePlanFromOutput] Starting plan parsing...")

	// Step 1: Parse project overview section
	let projOverviewSection: ProjectOverview
	try {
		projOverviewSection = parseProjectOverviewSection(raw)
	} catch (overviewError) {
		console.error("[parsePlanFromOutput] Project overview parsing failed:", overviewError)
		throw new Error(
			`Project overview parsing failed: ${overviewError instanceof Error ? overviewError.message : String(overviewError)}`,
		)
	}

	// Step 2: Parse execution plan
	let executionPlan: string
	try {
		executionPlan = parseExecutionPlan(raw)
	} catch (planError) {
		console.error("[parsePlanFromOutput] Execution plan parsing failed:", planError)
		throw new Error(`Execution plan parsing failed: ${planError instanceof Error ? planError.message : String(planError)}`)
	}

	// Step 3: Parse phases
	let phases: Phase[]
	try {
		if (isMD) {
			phases = parsePhaseByMD(raw)
		} else {
			phases = parsePhaseNew(raw)
		}
	} catch (phaseError) {
		console.error("[parsePlanFromOutput] Phases parsing failed:", phaseError)
		console.log("[parsePlanFromOutput] Looking for phase blocks in raw input...")
		const phaseBlocks = raw.match(/<phase>([\s\S]*?)<\/phase>/gi)
		const subtaskBlocks = raw.match(/<subtask>([\s\S]*?)<\/subtask>/gi)
		console.log(`[parsePlanFromOutput] Found ${phaseBlocks?.length || 0} <phase> blocks`)
		console.log(`[parsePlanFromOutput] Found ${subtaskBlocks?.length || 0} <subtask> blocks`)
		if (isMD) {
			const mdPhaseMatches = raw.match(/###\s*Phase\s+/gi)
			console.log(`[parsePlanFromOutput] Found ${mdPhaseMatches?.length || 0} markdown phase headers`)
		}
		throw new Error(`Phases parsing failed: ${phaseError instanceof Error ? phaseError.message : String(phaseError)}`)
	}

	// Step 4: Parse and apply requirement reinforcement if available
	try {
		const reinforcement = parseRequirementSpecReinforcement(raw)
		if (reinforcement) {
			phases = reinforcePhaseRequirements(phases, reinforcement)
		}
	} catch (reinforcementError) {
		console.warn("[parsePlanFromOutput] Requirement reinforcement failed, continuing without it:", reinforcementError)
	}

	if (phases.length === 0) {
		console.error("[parsePlanFromOutput] No phases found in the Phase Plan content")
		throw new Error("No phases found in the Phase Plan content")
	}

	console.log(`[parsePlanFromOutput] Successfully parsed plan with ${phases.length} phases`)
	return { projOverview: projOverviewSection, executionPlan, phases }
}

// 새로운 함수: plan.txt 파일의 subtask 구조를 파싱
// export function parsePlanFromSubtaskFormat(raw: string): ParsedPlan {
// 	console.log("[parsePlanFromSubtaskFormat] Starting to parse plan content from subtask format")
// 	console.log("[parsePlanFromSubtaskFormat] Raw content length:", raw.length)

// 	// subtask 블록들을 찾기
// 	const subtaskRegex = /<subtask>([\s\S]*?)<\/subtask>/g
// 	const subtaskMatches = []
// 	let match

// 	while ((match = subtaskRegex.exec(raw)) !== null) {
// 		subtaskMatches.push(match[1])
// 	}

// 	console.log("[parsePlanFromSubtaskFormat] Found subtask blocks:", subtaskMatches.length)

// 	if (subtaskMatches.length === 0) {
// 		console.error("[parsePlanFromSubtaskFormat] No subtask blocks found")
// 		console.log("[parsePlanFromSubtaskFormat] Raw content first 1000 chars:", raw.substring(0, 1000))
// 		throw new Error("No subtask blocks found in the plan content")
// 	}

// 	// 각 subtask 블록을 Phase로 변환
// 	const phases: Phase[] = []

// 	subtaskMatches.forEach((subtaskContent, idx) => {
// 		console.log(`[parsePlanFromSubtaskFormat] Processing subtask ${idx + 1}:`)

// 		// number 추출
// 		const numberMatch = subtaskContent.match(/<number>(.*?)<\/number>/)
// 		const numberStr = numberMatch ? numberMatch[1].trim() : (idx + 1).toString()
// 		console.log(`[parsePlanFromSubtaskFormat] Found number: ${numberStr}`)

// 		// FINAL을 숫자로 변환
// 		const phaseIndex = numberStr === "FINAL" ? subtaskMatches.length : parseInt(numberStr)
// 		console.log(`[parsePlanFromSubtaskFormat] Phase index: ${phaseIndex}`)

// 		// title 추출
// 		const titleMatch = subtaskContent.match(/<title>(.*?)<\/title>/)
// 		const title = titleMatch ? titleMatch[1].trim() : `Phase ${phaseIndex}`
// 		console.log(`[parsePlanFromSubtaskFormat] Found title: ${title}`)

// 		// description을 전체 내용으로 설정 (나중에 필요시 더 세분화 가능)
// 		const description = subtaskContent.trim()

// 		phases.push({
// 			index: phaseIndex,
// 			phase_prompt: description,
// 			title: title,
// 			description: description,
// 			paths: [], // 빈 배열로 시작
// 			subtasks: [], // 빈 배열로 시작 (실행 중에 동적으로 생성)
// 			complete: false,
// 		})

// 		console.log(`[parsePlanFromSubtaskFormat] Successfully parsed phase ${phaseIndex}: ${title}`)
// 	})

// 	// index 기준으로 정렬
// 	phases.sort((a, b) => a.index - b.index)

// 	console.log("[parsePlanFromSubtaskFormat] Successfully parsed", phases.length, "phases")
// 	phases.forEach((phase) => {
// 		console.log(`[parsePlanFromSubtaskFormat] Phase ${phase.index}: ${phase.title}`)
// 	})

// 	return {
// 		rawPlan: raw,
// 		phases: phases,
// 	}
// }

// 새로운 함수: plan.txt 파일에서 고정된 플랜 로드

export async function parsePlanFromFixedFile(extensionContext: vscode.ExtensionContext): Promise<ParsedPlan> {
	console.log("[parsePlanFromFixedFile] Starting to load plan.txt file...")
	console.log("[parsePlanFromFixedFile] Extension URI:", extensionContext.extensionUri.toString())

	// 개발 환경에서 src 폴더를 먼저 시도
	try {
		const devPlanFileUri = vscode.Uri.joinPath(extensionContext.extensionUri, "src", "core", "assistant-message", "plan.txt")

		console.log("[parsePlanFromFixedFile] Trying dev path:", devPlanFileUri.toString())
		const planContent = await fs.readFile(devPlanFileUri.fsPath, "utf8")

		console.log("[parsePlanFromFixedFile] Successfully loaded plan.txt from dev path")
		console.log("[parsePlanFromFixedFile] Content length:", planContent.length)

		// Use the improved parsing
		return parsePlanFromOutput(planContent)
	} catch (devError) {
		console.warn("[parsePlanFromFixedFile] Dev path failed:", devError)

		// 개발 환경에서 실패한 경우, 빌드된 extension 경로 시도
		try {
			const planFileUri = vscode.Uri.joinPath(
				extensionContext.extensionUri,
				"dist",
				"core",
				"assistant-message",
				"plan.txt",
			)

			console.log("[parsePlanFromFixedFile] Trying dist path:", planFileUri.toString())
			const planContent = await fs.readFile(planFileUri.fsPath, "utf8")

			console.log("[parsePlanFromFixedFile] Successfully loaded plan.txt from dist path")
			console.log("[parsePlanFromFixedFile] Content length:", planContent.length)

			// 새로운 subtask 형식으로 파싱
			// return parsePlanFromSubtaskFormat(planContent)
			return parsePlanFromOutput(planContent)
		} catch (distError) {
			console.error("[parsePlanFromFixedFile] Both paths failed")
			console.error("[parsePlanFromFixedFile] Dev error:", devError)
			console.error("[parsePlanFromFixedFile] Dist error:", distError)

			// 두 경로 모두 실패한 경우 기본 플랜 반환
			return {
				projOverview: {
					title: "Error Loading Plan",
					projectVision: ["고정된 plan.txt 파일을 읽을 수 없습니다. Extension 빌드를 확인해주세요."],
				},
				executionPlan: "고정된 plan.txt 파일을 읽을 수 없습니다. Extension 빌드를 확인해주세요.",
				phases: [],
			}
		}
	}
}

export class PhaseTracker {
	public phaseStates: PhaseState[] = []
	public currentPhaseIndex = 0
	public isRestored: boolean = false
	public parsedProjOverview: ProjectOverview

	constructor(
		public projOverview: string,
		public executionPlan: string,
		private controller: Controller,
	) {
		// Parse the string project overview into structured data
		try {
			this.parsedProjOverview = parseProjectOverviewSection(this.projOverview)
		} catch {
			// Fallback to a simple structure if parsing fails
			this.parsedProjOverview = {
				title: "Project Overview",
				projectVision: [this.projOverview],
			}
		}

		// Step 1: Set up the first Phase (Plan) in Plan Mode
		this.phaseStates.push({
			index: 0,
			taskId: "",
			projOverview: this.parsedProjOverview,
			executionPlan: this.executionPlan,
			phase: {
				phaseIdx: 0,
				title: "Plan Phase",
				exeOrderIdx: 0,
			},
			status: PhaseStatus.Pending,
			startTime: Date.now(),
			retryCount: 0,
		})
	}

	// Called after the Plan phase is completed to populate the actual execution Phase list.
	public async addPhasesFromPlan(parsedPhases: Phase[]): Promise<void> {
		parsedPhases.forEach((p) => {
			this.phaseStates.push({
				index: p.phaseIdx,
				taskId: "",
				phase: p,
				status: PhaseStatus.Pending,
				startTime: undefined,
				endTime: undefined,
				retryCount: 0,
			})
		})
		await this.saveCheckpoint()
	}

	// Called when updating/replacing phases from a modified plan
	public async replacePhasesFromPlan(parsedPhases: Phase[]): Promise<void> {
		// Keep only the initial Plan phase (index 0), remove all execution phases
		const planPhase = this.phaseStates.find((ps) => ps.index === 0)
		if (!planPhase) {
			throw new Error("Plan phase not found - cannot replace phases")
		}

		// Reset to only contain the plan phase
		this.phaseStates = [planPhase]
		this.currentPhaseIndex = 0

		// Add the new phases
		parsedPhases.forEach((p) => {
			this.phaseStates.push({
				index: p.phaseIdx,
				taskId: "",
				phase: p,
				status: PhaseStatus.Pending,
				startTime: undefined,
				endTime: undefined,
				retryCount: 0,
			})
		})

		await this.saveCheckpoint()
	}

	public async markCurrentPhaseComplete(): Promise<void> {
		const ps = this.phaseStates[this.currentPhaseIndex]
		await this.completePhase(ps.index)
	}

	public async markCurrentPhaseSkipped(skipRest: boolean = false): Promise<void> {
		if (
			this.currentPhaseIndex < 0 ||
			this.currentPhaseIndex >= this.phaseStates.length ||
			!this.phaseStates[this.currentPhaseIndex]
		) {
			console.warn("Invalid phase index or phase not found")
			return
		}

		const ps = this.phaseStates[this.currentPhaseIndex]
		ps.status = PhaseStatus.Skipped
		ps.startTime = Date.now()
		ps.endTime = Date.now()

		if (skipRest) {
			// Skip all remaining phases
			for (let i = this.currentPhaseIndex + 1; i < this.phaseStates.length; i++) {
				const phase = this.phaseStates[i]
				phase.status = PhaseStatus.Skipped
				phase.startTime = Date.now()
				phase.endTime = Date.now()
			}
		}
	}

	/**
	 * Update the task ID for a specific phase
	 */
	public updateTaskIdPhase(phaseId: number, taskId: string): void {
		const phaseState = this.phaseStates.find((p) => p.index === phaseId)
		if (!phaseState) {
			return
		}
		phaseState.taskId = taskId
		this.saveCheckpoint()
	}

	/**
	 * Get the current phase's retry count
	 */
	public getCurrentPhaseRetryCount(): number {
		const ps = this.phaseStates[this.currentPhaseIndex]
		return ps?.retryCount || 0
	}

	/**
	 * Check if the current phase can be retried (max 3 attempts total)
	 */
	public canRetryCurrentPhase(): boolean {
		const retryCount = this.getCurrentPhaseRetryCount()
		return retryCount < PHASE_RETRY_LIMIT
	}

	/**
	 * Increment the retry count for the current phase and reset its status
	 */
	public async retryCurrentPhase(): Promise<void> {
		if (!this.phaseStates[this.currentPhaseIndex]) {
			throw new Error("Invalid phase index during retry")
		}

		const ps = this.phaseStates[this.currentPhaseIndex]
		// Increment retry count
		ps.retryCount = (ps.retryCount || 0) + 1

		// Reset phase status to pending
		ps.status = PhaseStatus.Pending
		ps.startTime = undefined
		ps.endTime = undefined
		ps.startCheckpointHash = undefined // Clear start checkpoint hash

		await this.saveCheckpoint()
	}

	public getPhaseCompletionAction(): "all_complete" | "partial_complete" | "non_phase" {
		if (this.isAllComplete()) {
			return "all_complete"
		} else if (this.currentPhaseIndex < this.phaseStates.length - 1) {
			return "partial_complete"
		} else {
			return "non_phase"
		}
	}

	public shouldShowRetryOption(): boolean {
		return this.canRetryCurrentPhase()
	}

	public getRetryLimitMessage(): string {
		const isAllComplete = this.isAllComplete()
		const action = isAllComplete ? "종료합니다" : "다음 Phase로 강제 이동합니다"
		return `⚠️ **재시도 한계 초과**\n\n최대 재시도 횟수(${PHASE_RETRY_LIMIT}회)를 초과했습니다. ${action}.`
	}

	/**
	 * Force move to next phase when retry limit is exceeded
	 */
	public async forceNextPhase(): Promise<void> {
		const ps = this.phaseStates[this.currentPhaseIndex]
		if (ps) {
			ps.status = PhaseStatus.Skipped // Failed TODO: (sa)
			ps.endTime = Date.now()
		}

		if (this.hasNextPhase()) {
			this.updatePhase()
		}

		await this.saveCheckpoint()
	}

	/**
	 * Set the start checkpoint hash for the current phase
	 */
	public setCurrentPhaseStartCheckpoint(checkpointHash: string): void {
		const ps = this.phaseStates[this.currentPhaseIndex]
		if (ps) {
			ps.startCheckpointHash = checkpointHash
		}
	}

	/**
	 * Get the start checkpoint hash for the current phase
	 */
	public getCurrentPhaseStartCheckpoint(): string | undefined {
		const ps = this.phaseStates[this.currentPhaseIndex]
		return ps?.startCheckpointHash
	}

	public async completePhase(phaseId: number): Promise<void> {
		const phaseState = this.phaseStates.find((p) => p.index === phaseId)
		if (!phaseState) {
			return
		}

		// Function to process all checklist items in batch
		const markChecklistDone = (subs?: Subtask[]) => {
			subs?.forEach((s) => {
				s.completed = true
			})
		}

		// Mark all checklist items as completed
		markChecklistDone(phaseState.phase?.completionCriteria)
		markChecklistDone(phaseState.phase?.validationChecklist)

		// Legacy support - mark old checklist fields as completed
		markChecklistDone(phaseState.phase?.handoffChecklist)

		// Handle additional checklists for the FINAL phase
		if (phaseState.phase?.originalRequirementsValidations || phaseState.phase?.finalDeliverables) {
			markChecklistDone(phaseState.phase.originalRequirementsValidations)
			markChecklistDone(phaseState.phase.finalDeliverables)
		}

		// Update status
		phaseState.status = PhaseStatus.Completed
		phaseState.endTime = Date.now()

		await this.saveCheckpoint()
	}

	public hasNextPhase(): boolean {
		// Check if there are any pending phases after the current one
		for (let i = this.currentPhaseIndex + 1; i < this.phaseStates.length; i++) {
			const phase = this.phaseStates[i]
			if (phase.status === PhaseStatus.Pending) {
				return true
			}
		}
		return false
	}

	public updatePhase(): void {
		// Add bounds checking
		if (this.currentPhaseIndex >= this.phaseStates.length - 1) {
			throw new Error("Cannot advance beyond last phase")
		}

		this.currentPhaseIndex++
		const next = this.phaseStates[this.currentPhaseIndex]
		next.status = PhaseStatus.InProgress
		next.startTime = Date.now()
	}

	public get currentPhase(): Phase {
		const p = this.phaseStates[this.currentPhaseIndex]
		if (!p || !p.phase) {
			throw new Error(`Phase ${this.currentPhaseIndex} is not properly initialized: missing phase data`)
		}
		return p.phase
	}

	public getPhaseByIdx(index: number): Phase {
		const p = this.phaseStates[index]
		if (!p || !p.phase) {
			throw new Error(`Phase ${index} is not properly initialized: missing phase data`)
		}
		return p.phase
	}

	public getPhaseByTaskId(taskId: string): number {
		const phaseState = this.phaseStates.find((p) => p.taskId && p.taskId === taskId)
		if (!phaseState) {
			return -1
		}
		return phaseState.index
	}

	public resetPhaseStatus(startIdx: number) {
		// reset
		this.phaseStates.slice(startIdx).forEach((item) => {
			item.taskId = ""
			item.status = PhaseStatus.Pending
		})
		this.saveCheckpoint()
	}

	public get totalPhases(): number {
		return this.phaseStates.length
	}

	public isAllComplete(): boolean {
		return this.phaseStates.every((p) => p.status === PhaseStatus.Completed || p.status === PhaseStatus.Skipped)
	}

	public getProjectOverview(): ProjectOverview {
		return this.parsedProjOverview
	}

	public getProjectOverviewAsString(): string {
		return this.projOverview
	}

	public async getBaseUri(controller: Controller): Promise<vscode.Uri> {
		// Determine the base URI for storage (prefer workspace, fallback to globalStorage)
		let baseUri: vscode.Uri
		const workspacePaths = await HostProvider.workspace.getWorkspacePaths({})
		if (workspacePaths.paths && workspacePaths.paths.length > 0) {
			// If workspace is open, create .cline directory under the first folder
			baseUri = vscode.Uri.joinPath(vscode.Uri.file(workspacePaths.paths[0]), ".cline")
		} else {
			// If no workspace is available, use the extension's globalStorageUri
			// ("globalStorage" permission is required in package.json)
			baseUri = vscode.Uri.joinPath(controller.context.globalStorageUri, ".cline")
		}
		return baseUri
	}

	public checkpointUri: vscode.Uri | undefined = undefined
	async getCheckpointFileUri(): Promise<vscode.Uri> {
		// Get the base URI for storage
		if (!this.checkpointUri) {
			const baseUri = await this.getBaseUri(this.controller)
			// Return the full path to the checkpoint file
			this.checkpointUri = vscode.Uri.joinPath(baseUri, "phase-checkpoint.json")
			return this.checkpointUri
		} else {
			// If already set, return the existing URI
			return this.checkpointUri
		}
	}

	/** Restore tracker progress from .cline/phase-checkpoint.json if present */
	public async fromCheckpoint(): Promise<PhaseTracker | undefined> {
		try {
			const checkpointUri = await this.getCheckpointFileUri()

			// Read file
			const text = await fs.readFile(checkpointUri.fsPath, "utf8")
			const checkpoint = JSON.parse(text)

			// Restore PhaseTracker
			const tracker = new PhaseTracker(checkpoint.projOverview, checkpoint.executionPlan, this.controller)
			// Restore parsed project overview if available, otherwise use the parsed version from constructor
			if (checkpoint.parsedProjOverview) {
				tracker.parsedProjOverview = checkpoint.parsedProjOverview
			}
			tracker.phaseStates = checkpoint.phaseStates
			tracker.currentPhaseIndex = checkpoint.currentPhaseIndex
			tracker.isRestored = true // Mark as restored
			// Restored phase checkpoint
			return tracker
		} catch {
			// No phase checkpoint to restore or failed
			return undefined
		}
	}

	public async saveCheckpoint(): Promise<void> {
		try {
			// 1) Determine the base URI for saving
			const baseUri = await this.getBaseUri(this.controller)

			// 2) Create the .cline directory if it doesn't exist
			if (!(await fileExistsAtPath(baseUri.fsPath))) {
				await createDirectoriesForFile(baseUri.fsPath)
			}

			// 3) Prepare checkpoint data
			const checkpointData: Record<string, any> = {
				projOverview: this.projOverview, // string (original)
				parsedProjOverview: this.parsedProjOverview, // ProjectOverview (parsed)
				executionPlan: this.executionPlan, // string
				phaseStates: this.phaseStates, // PhaseState[]
				currentPhaseIndex: this.currentPhaseIndex, // number
			}
			const content = JSON.stringify(checkpointData, null, 2)

			// Simply use the method which already computes the proper URI
			const checkpointUri = await this.getCheckpointFileUri()
			const tmpUri = vscode.Uri.joinPath(baseUri, "phase-checkpoint.json.tmp")
			await writeFile(tmpUri.fsPath, content)
			await fs.rename(tmpUri.fsPath, checkpointUri.fsPath)

			// Note: Plan markdown is saved during initial parsing, not during checkpoint saves
		} catch {}
	}

	public async deleteCheckpoint(): Promise<void> {
		try {
			const checkpointUri = await this.getCheckpointFileUri()

			if (await fileExistsAtPath(checkpointUri.fsPath)) {
				console.log(`[deleteCheckpoint] File exists at: ${checkpointUri.toString()}`)
				await fs.unlink(checkpointUri.fsPath)
			} else {
				console.log(`[deleteCheckpoint] File does not exist at: ${checkpointUri.toString()}`)
				return
			}
			console.log(`[deleteCheckpoint] Successfully deleted: ${checkpointUri.toString()}`)
		} catch {}
	}

	public async deletePlanMD(): Promise<void> {
		try {
			const baseUri = await this.getBaseUri(this.controller)
			const taskId = this.phaseStates[0].taskId
			const filename = `project-execution-plan-${taskId}.md`
			const fileUri = vscode.Uri.joinPath(baseUri, filename)

			if (await fileExistsAtPath(fileUri.fsPath)) {
				console.log(`[deletePlanMD] File exists at: ${fileUri.toString()}`)
				await fs.unlink(fileUri.fsPath)
			} else {
				console.log(`[deletePlanMD] File does not exist at: ${fileUri.toString()}`)
				return
			}
			console.log(`[deletePlanMD] Successfully deleted: ${fileUri.toString()}`)
		} catch {}
	}
}
