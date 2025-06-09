import { Phase, Subtask } from "./phase-tracker"

export const PROMPTS = {
	PLANNING: `**Step 1:** First, analyze the user's request and produce your \`assistantMessage\` using the following tags:
1. \`<thinking>…</thinking>\` - Explain your overall approach and reasoning
2. \`<execute_command>…</execute_command>\` - Any commands to be executed  
3. \`<write_to_file>…</write_to_file>\` - File creation or modification actions
4. \`<attempt_completion>…</attempt_completion>\` - Results or completion attempts
**Step 2:** Organize your implementation into distinct phases. For each phase:
1. Identify a clear, independent unit of work with a specific goal
2. Include only related operations that should be completed together
3. Ensure each phase has a clear starting and completion point
4. Consider logical dependencies (e.g., files need to be created before used)
**Step 3:** Return your implementation in the following EXACT format:
1. First, provide your complete \`assistantMessage\` with all required tags
2. Then, add a divider: \`---\n## Phase Plan\`
3. Finally, list your phases using this specific format:
\`\`\`
Phase 1: [Phase Name/Description]
- Description: [Brief explanation of what this phase accomplishes]
- Paths: [List of relevant file paths, one per line]
- Subtasks:
  * [Specific task 1]
  * [Specific task 2]
Phase 2: [Phase Name/Description]
- Description: [Brief explanation of what this phase accomplishes]
- Paths: [List of relevant file paths, one per line]
- Subtasks:
  * [Specific task 1]
  * [Specific task 2]
\`\`\`
**Alternatively, you may provide phases in this structured JSON format:**
\`\`\`json
{
  "phases": [
    {
      "index": 1,
      "phase_prompt": "Phase Name/Description",
      "description": "Brief explanation of what this phase accomplishes",
      "paths": ["file1.js", "file2.js"],
      "subtasks": [
        {"description": "Specific task 1", "type": "write_to_file"},
        {"description": "Specific task 2", "type": "execute_command"}
      ]
    },
    {
      "index": 2,
      "phase_prompt": "Next Phase Name/Description",
      "description": "Brief explanation of what this phase accomplishes",
      "paths": ["file3.js"],
      "subtasks": [
        {"description": "Another specific task", "type": "write_to_file"}
      ]
    }
  ]
}
\`\`\`
For example (text format):
\`\`\`
Phase 1: File Creation Phase
- Description: Creating necessary source files and directories
- Paths: 
  main.py
  config.json
- Subtasks:
  * Create main.py with application entry point
  * Create config.json with initial configuration
   
Phase 2: Database Setup Phase
- Description: Setting up database schema and initial data
- Paths:
  schema.sql
- Subtasks:
  * Create schema.sql with database structure
  * Initialize database with schema
\`\`\`
Always add a clear divider between your assistantMessage and the Phase Plan. Be specific and structured in listing your phases to ensure easy parsing.`,
} as const

// Subtask 내용에서 특정 섹션을 추출하는 헬퍼 함수들
function extractTagContent(content: string, tagName: string): string | null {
	const regex = new RegExp(`<${tagName}>(.*?)</${tagName}>`, "gs")
	const match = regex.exec(content)
	return match ? match[1].trim() : null
}

function extractListContent(content: string, tagName: string): string[] {
	const extracted = extractTagContent(content, tagName)
	if (!extracted) return []

	// 리스트 아이템들을 추출 (- 로 시작하는 라인들)
	const lines = extracted
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.filter((line) => line.startsWith("- ") || line.startsWith("* ") || line.startsWith("[ ]"))
		.map((line) => line.replace(/^[- *\[\] ]+/, "").trim())

	return lines
}

function extractRequirements(content: string): string[] {
	const reqSection = extractTagContent(content, "related_input_requirements")
	if (!reqSection) return []

	// REQ-XXX 형태의 요구사항들을 추출
	const reqRegex = /- (REQ-\d+): "(.+?)"/g
	const requirements = []
	let match

	while ((match = reqRegex.exec(reqSection)) !== null) {
		requirements.push(`${match[1]}: ${match[2]}`)
	}

	return requirements
}

interface ParsedSubtaskInfo {
	coreObjective?: string
	functionalRequirements?: string
	relatedRequirements: string[]
	deliverables: string[]
	completionCriteria: string[]
	handoffChecklist: string[]
	nonFunctionalRequirements?: string
}

function parseSubtaskContent(phaseDescription: string): ParsedSubtaskInfo {
	return {
		coreObjective: extractTagContent(phaseDescription, "core_objective") || undefined,
		functionalRequirements: extractTagContent(phaseDescription, "functional_requirements") || undefined,
		relatedRequirements: extractRequirements(phaseDescription),
		deliverables: extractListContent(phaseDescription, "deliverables_for_next_phase"),
		completionCriteria: extractListContent(phaseDescription, "completion_criteria"),
		handoffChecklist: extractListContent(phaseDescription, "handoff_checklist"),
		nonFunctionalRequirements: extractTagContent(phaseDescription, "non_functional_requirements") || undefined,
	}
}

/**
 * Build the system / user prompt that will be fed to the LLM for one *execution*
 * phase ( i.e. **after** the planning phase has produced the full roadmap ).
 *
 * @param phase          The Phase record returned by PhaseTracker.currentPhase
 * @param total          Total number of phases in the roadmap
 * @param originalPrompt The very first user request – shown verbatim for context
 */
export function buildPhasePrompt(phase: Phase, total: number, originalPrompt: string): string {
	// Parse detailed information from the phase description
	const parsedInfo = parseSubtaskContent(phase.description || "")

	// Helper: pretty-print the path list (can be empty)
	const pathsSection =
		phase.paths?.length > 0
			? phase.paths.map((path) => `<path>${path}</path>`).join("\n")
			: "<path>no specific files identified yet</path>"

	// Build requirements section
	let requirementsSection = ""
	if (parsedInfo.relatedRequirements.length > 0) {
		const requirements = parsedInfo.relatedRequirements.map((req) => `<requirement>${req}</requirement>`).join("\n")
		requirementsSection = `<key_requirements>
${requirements}
</key_requirements>

`
	}

	// Build core objective section
	let objectiveSection = ""
	if (parsedInfo.coreObjective) {
		objectiveSection = `<core_objective>
${parsedInfo.coreObjective}
</core_objective>

`
	}

	// Build functional requirements section
	let functionalSection = ""
	if (parsedInfo.functionalRequirements) {
		functionalSection = `<functional_requirements>
${parsedInfo.functionalRequirements}
</functional_requirements>

`
	}

	// Build deliverables section
	let deliverablesSection = ""
	if (parsedInfo.deliverables.length > 0) {
		const deliverables = parsedInfo.deliverables.map((item) => `<deliverable>${item}</deliverable>`).join("\n")
		deliverablesSection = `<expected_deliverables>
${deliverables}
</expected_deliverables>

`
	}

	// Build completion criteria section
	let completionSection = ""
	if (parsedInfo.completionCriteria.length > 0) {
		const criteria = parsedInfo.completionCriteria.map((criteria) => `<criterion>${criteria}</criterion>`).join("\n")
		completionSection = `<completion_criteria>
${criteria}
</completion_criteria>

`
	}

	// Build quality requirements section
	let qualitySection = ""
	if (parsedInfo.nonFunctionalRequirements) {
		qualitySection = `<quality_requirements>
${parsedInfo.nonFunctionalRequirements}
</quality_requirements>

`
	}

	// Build handoff checklist section
	let handoffSection = ""
	if (parsedInfo.handoffChecklist.length > 0) {
		const checklist = parsedInfo.handoffChecklist.map((item) => `<checklist_item>${item}</checklist_item>`).join("\n")
		handoffSection = `<handoff_checklist>
${checklist}
</handoff_checklist>

`
	}

	// Helper: numbered sub-tasks (guaranteed at least one – but be defensive)
	const subtasksSection = phase.subtasks.length
		? phase.subtasks.map((st: Subtask, i: number) => `<task>${i + 1}. ${st.description.trim()}</task>`).join("\n")
		: "<task>1. Follow the core objective and completion criteria outlined above</task>"

	// Final prompt -------------------------------------------------------------
	return `<phase_execution>
<phase_info>
<phase_number>${phase.index}</phase_number>
<total_phases>${total - 1}</total_phases>
<phase_title>${phase.title}</phase_title>
</phase_info>

<original_user_request>
${originalPrompt.trim()}
</original_user_request>

${objectiveSection}${requirementsSection}${functionalSection}<relevant_files>
${pathsSection}
</relevant_files>

<specific_tasks>
${subtasksSection}
</specific_tasks>

${deliverablesSection}${completionSection}${qualitySection}${handoffSection}<execution_guidelines>
<primary_directives>
<directive>Focus ONLY on this phase - Do not create additional phases or plans</directive>
<directive>Complete ALL tasks listed above before attempting completion</directive>
<directive>Follow the completion criteria exactly as specified</directive>
<directive>Verify handoff checklist items before marking as complete</directive>
</primary_directives>

<tool_usage>
<instruction>Use &lt;thinking&gt; to analyze prerequisites and approach</instruction>
<instruction>Use &lt;write_to_file&gt; for file creation and modifications</instruction>
<instruction>Use &lt;execute_command&gt; for terminal operations</instruction>
<instruction>Wait for tool results before proceeding to next action</instruction>
<instruction>Use &lt;attempt_completion&gt; ONLY when all criteria are met</instruction>
</tool_usage>

<success_criteria>
<criterion>All specified tasks are finished</criterion>
<criterion>All completion criteria are satisfied</criterion>
<criterion>All deliverables are created and ready</criterion>
<criterion>Handoff checklist items are verified</criterion>
</success_criteria>
</execution_guidelines>

<instruction>Begin Phase ${phase.index} execution now.</instruction>
</phase_execution>`
}
