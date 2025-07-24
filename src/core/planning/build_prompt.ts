import { Phase, Subtask, ProjectOverview } from "./phase-tracker"

/** 
 * Build the system / user prompt that will be fed to the LLM for one *execution*
 * phase ( i.e. ** after**  the planning phase has produced the full roadmap ).
 *
 * @param phase          The Phase record returned by PhaseTracker.currentPhase
 * @param total          Total number of phases in the roadmap
 * @param projectOverview The structured project overview data from the planning phase
 */
export function buildPhasePrompt(phase: Phase, total: number, projectOverview: ProjectOverview): string {
	// Helper: pretty-print the path list (can be empty)
	const pathsSection =
		phase.paths && phase.paths?.length > 0
			? phase.paths.map((path) => `- ${path}`).join("\n")
			: "- no specific files identified yet"

	// Build requirements section
	let requirementsSection = ""
	
	if (phase.requirements && phase.requirements.list.length > 0) {
		const requirementsList = phase.requirements.list
			.map((req) => `- ${req.id}: ${req.description}`)
			.join("\n")
		
		requirementsSection = `**Requirements** delivers small-unit sub-tasks that must be accomplished in the current Phase with REQ-XXX format IDs and their descriptions. Each Phase must complete all of the multiple sub-tasks, performing them from the macro perspective of project overview and from the Phase perspective considering objectives.

### Requirements

${requirementsList}

`
		
		// Add note section separately if exists
		if (phase.requirements.note) {
			requirementsSection += `**Note** explains the order and flow in which the REQs existing in Requirements should be performed. Please carry out the work based on this.

### Note

${phase.requirements.note}

`
		}
	}
	

	// Build dependencies section
	let dependenciesSection = ""
	if (phase.dependencies && phase.dependencies.length > 0) {
		const dependenciesList = phase.dependencies.map((dep) => `${dep}`).join("\n")
		dependenciesSection = `**Dependencies** are items that need to be checked for readiness before performing the Phase. Please verify that these items are completed, and after confirmation, proceed with the work for the current Phase.

### Dependencies

${dependenciesList}

`
	}

	// Build explain section  
	let explainSection = ""
	if (phase.explain && phase.explain.length > 0) {
		const explainContent = phase.explain.map((item) => `- ${item}`).join("\n")
		explainSection =`**Phase Explanation** defines the tasks to be performed in this Phase. Please familiarize yourself with this first and check the following items.

### Phase Explanation

${explainContent}

`
	}

	// Build project vision section
	let projectVisionSection = ""
	if (projectOverview.projectVision && projectOverview.projectVision.length > 0) {
		const visionContent = projectOverview.projectVision.map((item) => `- ${item}`).join("\n")
		projectVisionSection = `### Project Vision

This section defines the long-term vision and direction of the project. Please understand the overall direction and ensure all work aligns with this vision.

${visionContent}

`
	}

	// Build common section
	let commonSection = ""
	if (projectOverview.common && projectOverview.common.length > 0) {
		const commonContent = projectOverview.common.map((item) => `- ${item}`).join("\n")
		commonSection = `**Common Guidelines** provides detailed definitions of the background, motivation, constraints, common requirements, and design principles. It is essential to thoroughly understand this information and ensure that all phase tasks align with and adhere to these overarching guidelines.

### Common Guidelines

${commonContent}

`
	}

	// Build primary objectives section
	let primaryObjectivesSection = ""
	if (projectOverview.primaryObjectives && projectOverview.primaryObjectives.length > 0) {
		const objectivesContent = projectOverview.primaryObjectives
			.map((item) => `${item.index}. ${item.description}`)
			.join("\n")
		primaryObjectivesSection = `**Primary Objectives** lists the main goals that the entire project aims to achieve. All phase work should contribute to accomplishing these primary objectives.

### Primary Objectives

${objectivesContent}

`
	}

	// Build core objective section
	let objectiveSection = ""
	if (phase.objectives && phase.objectives.length > 0) {
		const coreObjectives = phase.objectives.map((obj) => `- ${obj}`).join("\n")
		objectiveSection = `**Objectives** defines the goals to be achieved through the work of this Phase.

### Objectives

${coreObjectives}

`
	}

	// Build deliverables section
	let deliverablesSection = ""
	if (phase.deliverables && phase.deliverables.length > 0) {
		const deliverables = phase.deliverables.map((item) => `${item}`).join("\n")
		deliverablesSection = `**Expected Deliverables** contains the required outputs after completing the Requirements for the Phase. Please verify that the deliverables (files) have been properly generated after completing the Phase work.

### Expected Deliverables

${deliverables}

`
	}

	// Build completion criteria section
	let completionSection = ""
	if (phase.completionCriteria && phase.completionCriteria.length > 0) {
		const criteria = phase.completionCriteria
			.map((item) => `- [${item.completed ? 'x' : ' '}] ${item.description}`)
			.join("\n")
		completionSection = `Once all Phase work is completed, finally verify and check that the items listed in **Completion Criteria** have been properly accomplished. All items must be satisfied without exception.

### Completion Criteria

${criteria}

`
	} 

	// Final prompt -------------------------------------------------------------
	return `# The title of the entire project is ${projectOverview.title}.

- Since the requirements in the Project are so many, we have to divide them into multiple phases and each Phase is a small unit of work that contributes to the overall project goal.
- There are a total of ${total - 1} Phases in this Project.
- Before executing the current phase, please read the Project Overview and the current phase information carefully.

## Project Overview

Project Overview consists of Project Vision, Common Guidelines, and Primary Objectives and they explain the overall direction and goals of the project.

${projectVisionSection}${commonSection}${primaryObjectivesSection}These information is given to you because you should consider the entire project when you are working on the current phase.

## Current Phase

- Now, here is the information of Current Phase. You must read these all sections of the phase carefully before proceeding.
- We are currently executing Phase ${phase.phaseIdx} with the task name: **${phase.title}** in Project: ${projectOverview.title}.
- Each Phase information consists of Dependencies, Phase Explanation, Objectives, Requirements, Relevant Files, Expected Deliverables, and Completion Criteria.

${dependenciesSection}${explainSection}${objectiveSection}${requirementsSection}### Relevant Files

${pathsSection}

## Execution Guidelines

${deliverablesSection}${completionSection}### Execution Guidelines

#### Primary Directives

- Focus ONLY on this specific phase - Do not deviate or create additional phases
- Complete ALL tasks and deliverables listed in Expected Deliverables section
- Follow the Completion Criteria checklist sequentially and thoroughly
- Verify each requirement is properly implemented before proceeding

#### Tool Usage

- Use &lt;thinking&gt; to analyze prerequisites and approach
- Use &lt;write_to_file&gt; for file creation and modifications
- Use &lt;execute_command&gt; for terminal operations
- Wait for tool results before proceeding to next action
- Use &lt;attempt_completion&gt; ONLY when all criteria are met

#### Success Criteria

- All specified REQs are finished
- All completion criteria are satisfied
- All deliverables are created and ready

#### Cautions

- Verify and validate that each requirement (REQs) is fulfilled through code inspection and analysis, NOT through browsing. Do not use browser testing or visual inspection - validate implementation directly in the code.

- Code validation should focus on semantic correctness, proper structure, and requirement compliance

---

**Now that you have familiarized yourself with all the above specifications, please begin Phase ${phase.phaseIdx}.**
`
}
