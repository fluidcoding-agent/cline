import * as vscode from "vscode"
import { createTwoFilesPatch } from "diff"
import { ParsedPlan, ProjectOverview, Subtask } from "./phase-tracker"
import * as fs from "fs"

export const PHASE_RETRY_LIMIT = 2
export const PLANNING_MAX_RETRIES = 2

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
 * Extracts content between specified HTML-like tags from a string.
 * The function looks for content between <tag> and </tag> patterns,
 * trims whitespace from the extracted content, and returns it.
 */
export function extractTag(tag: string, source: string): string {
	//   <tag>   (including all spaces)   </tag>
	const re = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, "i")
	const match = source.match(re)
	return match ? match[1].trim() : ""
}

/**
 * Extracts the content of a specific tag and returns it as an array of lines.
 */
export function extractTagAsLines(tag: string, source: string, removeListMarkers: boolean = false): string[] {
	const content = extractTag(tag, source)
	return splitAndCleanLines(content, removeListMarkers)
}

/**
 * Converts ProjectOverview to markdown string
 */
function projectOverviewToMarkdown(projOverview: ProjectOverview): string {
	const lines: string[] = []

	if (projOverview.title) {
		lines.push(`**제목**: ${projOverview.title}`)
		lines.push("")
	}

	if (projOverview.projectVision && projOverview.projectVision.length > 0) {
		lines.push("**프로젝트 비전**:")
		projOverview.projectVision.forEach((vision) => {
			lines.push(`- ${vision}`)
		})
		lines.push("")
	}

	if (projOverview.common && projOverview.common.length > 0) {
		lines.push("**공통 요구사항**:")
		projOverview.common.forEach((common) => {
			lines.push(`- ${common}`)
		})
		lines.push("")
	}

	if (projOverview.primaryObjectives && projOverview.primaryObjectives.length > 0) {
		lines.push("**주요 목표**:")
		projOverview.primaryObjectives.forEach((objective) => {
			const status = objective.completed ? "☑" : "☐"
			lines.push(`${status} ${objective.description}`)
		})
		lines.push("")
	}

	return lines.join("\n").trim()
}

/**
 * Saves the parsed plan as a markdown file for documentation purposes
 */
export async function saveParsedPlanAsMarkdown(
	parsedPlan: ParsedPlan,
	saveUri: vscode.Uri,
	taskId: string,
): Promise<{ fileUri: vscode.Uri | undefined; snapshotUri: vscode.Uri | undefined }> {
	try {
		const mdContent = generateMarkdownContent(parsedPlan)
		const filename = `project-execution-plan-${taskId}.md`
		const fileUri = vscode.Uri.joinPath(saveUri, filename)

		const encoder = new TextEncoder()
		await vscode.workspace.fs.writeFile(fileUri, encoder.encode(mdContent))
		console.log(`[saveParsedPlanAsMarkdown] Plan saved to: ${fileUri.fsPath}`)

		const snapshotUri = await createSnapshot(fileUri, saveUri, taskId)
		return { fileUri, snapshotUri }
	} catch (error) {
		console.error("[saveParsedPlanAsMarkdown] Failed to save plan:", error)
		return { fileUri: undefined, snapshotUri: undefined }
	}
}

/**
 * Creates a snapshot of a project execution plan.
 *
 * This function creates a snapshot of the plan file at the specified base location.
 * If a snapshot already exists, it returns the URI of the existing snapshot.
 * Otherwise, it creates a new snapshot using a simple file-locking mechanism
 * to prevent race conditions when multiple processes attempt to create a snapshot simultaneously.
 */
export async function createSnapshot(planUri: vscode.Uri, baseUri: vscode.Uri, taskId: string): Promise<vscode.Uri> {
	const filename = `project-execution-plan-${taskId}-snapshot.md`
	const snapshotUri = vscode.Uri.joinPath(baseUri, filename)

	try {
		await vscode.workspace.fs.stat(snapshotUri)
		return snapshotUri // If it exists, return the existing snapshot URI
	} catch {}

	// Simple temporary file for file-locking
	const lockUri = vscode.Uri.joinPath(baseUri, "snapshot.lock")
	try {
		// Prevent other processes from creating it first
		await vscode.workspace.fs.writeFile(lockUri, new Uint8Array())
		const buf = await vscode.workspace.fs.readFile(planUri)
		await vscode.workspace.fs.writeFile(snapshotUri, buf)

		// Set the snapshot file as read-only to prevent accidental modifications
		try {
			// Use Node.js fs to set file as read-only
			await fs.promises.chmod(snapshotUri.fsPath, 0o444) // Read-only for owner, group, and others
			console.log(`[createSnapshot] Set snapshot file as read-only: ${snapshotUri.fsPath}`)
		} catch (permissionError) {
			// If setting permissions fails, log but don't throw - snapshot still works
			console.warn("[createSnapshot] Could not set read-only permissions:", permissionError)
		}

		return snapshotUri
	} finally {
		// Release lock
		try {
			await vscode.workspace.fs.delete(lockUri)
		} catch {}
	}
}

/**
 * Returns unified diff string between snapshot and plan.md.
 * Returns undefined if there are no changes.
 */
export async function getPlanMarkdownDiff(planUri: vscode.Uri, snapshotUri: vscode.Uri): Promise<string | undefined> {
	// If snapshot doesn't exist, return without performing diff
	try {
		await vscode.workspace.fs.stat(snapshotUri)
	} catch {
		return undefined
	}

	const [oldBuf, newBuf] = await Promise.all([vscode.workspace.fs.readFile(snapshotUri), vscode.workspace.fs.readFile(planUri)])

	const oldText = Buffer.from(oldBuf).toString("utf8")
	const newText = Buffer.from(newBuf).toString("utf8")

	if (oldText === newText) {
		return undefined
	}
	return createTwoFilesPatch(snapshotUri.fsPath, planUri.fsPath, oldText, newText, undefined, undefined, { context: 3 })
}

/**
 * Generates markdown content from ParsedPlan for plan review
 */
export function generateMarkdownContent(plan: ParsedPlan): string {
	const lines: string[] = []

	// Title and metadata
	lines.push("# 📋 Project Execution Plan")
	lines.push("")
	lines.push(`📅 **Generated**: ${new Date().toLocaleString()}`)
	lines.push("")

	// Project Overview
	lines.push("## Project Overview")
	lines.push("")
	lines.push("<project_overview>")
	lines.push(projectOverviewToMarkdown(plan.projOverview))
	lines.push("</project_overview>")
	lines.push("")

	// Execution Plan
	if (plan.executionPlan) {
		lines.push("## 🚀 Execution Plan")
		lines.push("")
		lines.push("<execution_plan>")
		lines.push(plan.executionPlan)
		lines.push("</execution_plan>")
		lines.push("")
	}

	// Phases
	lines.push("## 📊 Execution Phases")
	lines.push("")
	lines.push(`> **Total Phases**: ${plan.phases.length}`)
	lines.push("")

	plan.phases.forEach((phase, index) => {
		lines.push(`### Phase ${phase.phaseIdx}: ${phase.title}`)
		lines.push("")

		// Basic info
		lines.push(`**Execution Order**: ${phase.exeOrderIdx}`)
		lines.push("")

		// Check if this is FINAL phase
		const isFinalPhase =
			phase.phaseIdx === plan.phases.length ||
			phase.title.toLowerCase().includes("final") ||
			phase.title.toLowerCase().includes("통합") ||
			phase.title.toLowerCase().includes("검증")

		// Dependencies/Prerequisites (unified handling)
		const deps = phase.dependencies || phase.prerequisites || []
		if (deps.length > 0) {
			const depTitle = isFinalPhase ? "Prerequisites" : "Dependencies"
			lines.push(`**${depTitle}:**`)
			deps.forEach((dep) => {
				lines.push(`- ${dep}`)
			})
			lines.push("")
		}

		// Explain (new structure)
		if (phase.explain && phase.explain.length > 0) {
			lines.push("**설명:**")
			phase.explain.forEach((exp) => {
				lines.push(`- ${exp}`)
			})
			lines.push("")
		}

		// Requirements (new structure) - only for non-FINAL phases
		if (!isFinalPhase && phase.requirements && phase.requirements.list && phase.requirements.list.length > 0) {
			lines.push("**Requirements:**")
			phase.requirements.list.forEach((req) => {
				lines.push(`- **${req.id}**: ${req.description}`)
			})
			if (phase.requirements.note) {
				lines.push("")
				lines.push(`*Note: ${phase.requirements.note}*`)
			}
			lines.push("")
		}

		// Related Requirements (legacy support) - only for non-FINAL phases
		if (!isFinalPhase && phase.relatedRequirements && phase.relatedRequirements.length > 0) {
			lines.push("**Related Requirements:**")
			phase.relatedRequirements.forEach((req) => {
				lines.push(`- ${req}`)
			})
			lines.push("")
		}

		// Objectives (unified handling)
		const objectives = phase.objectives || phase.coreObjectives || phase.integrationObjectives || []
		if (objectives.length > 0) {
			lines.push("**Objectives:**")
			objectives.forEach((obj) => {
				lines.push(`- ${obj}`)
			})
			lines.push("")
		}

		// Functional Requirements (legacy support) - only for non-FINAL phases
		if (!isFinalPhase && phase.functionalRequirements && phase.functionalRequirements.length > 0) {
			lines.push("**Functional Requirements:**")
			phase.functionalRequirements.forEach((req) => {
				lines.push(`- ${req}`)
			})
			lines.push("")
		}

		// Deliverables
		if (phase.deliverables && phase.deliverables.length > 0) {
			lines.push("**Deliverables:**")
			phase.deliverables.forEach((deliverable) => {
				lines.push(`- ${deliverable}`)
			})
			lines.push("")
		}

		// Non-Functional Requirements (legacy support) - only for non-FINAL phases
		if (!isFinalPhase && phase.nonFunctionalRequirements && phase.nonFunctionalRequirements.length > 0) {
			lines.push("**Non-Functional Requirements:**")
			phase.nonFunctionalRequirements.forEach((req) => {
				lines.push(`- ${req}`)
			})
			lines.push("")
		}

		// Completion Criteria / Validation Checklist (unified handling)
		const completionItems =
			phase.completionCriteria || phase.validationChecklist || phase.handoffChecklist || phase.finalDeliverables || []
		if (completionItems.length > 0) {
			const criteriaTitle = isFinalPhase ? "Validation Checklist" : "Completion Criteria"
			lines.push(`**${criteriaTitle}:**`)
			completionItems.forEach((criteria) => {
				const status = criteria.completed ? "☑" : "☐"
				lines.push(`${status} ${criteria.description}`)
			})
			lines.push("")
		}

		// FINAL phase specific fields (additional legacy fields)
		if (isFinalPhase) {
			if (phase.integrationSteps && phase.integrationSteps.length > 0) {
				lines.push("**Integration Steps:**")
				phase.integrationSteps.forEach((step) => {
					lines.push(`- ${step}`)
				})
				lines.push("")
			}

			if (phase.originalRequirementsValidations && phase.originalRequirementsValidations.length > 0) {
				lines.push("**Original Requirements Validations:**")
				phase.originalRequirementsValidations.forEach((validation) => {
					const status = validation.completed ? "☑" : "☐"
					lines.push(`${status} ${validation.description}`)
				})
				lines.push("")
			}

			if (phase.systemWideTesting && phase.systemWideTesting.length > 0) {
				lines.push("**System-Wide Testing:**")
				phase.systemWideTesting.forEach((test) => {
					lines.push(`- ${test}`)
				})
				lines.push("")
			}
		}

		lines.push("---")
		lines.push("")
	})

	// Summary
	lines.push("## 📝 Plan Summary")
	lines.push("")
	lines.push(`| Metric | Count |`)
	lines.push(`|--------|-------|`)
	lines.push(`| **Total Phases** | ${plan.phases.length} |`)
	lines.push("")
	lines.push("---")
	lines.push("")
	lines.push("*This plan document was automatically generated from the parsed project requirements and phase structure.*")
	lines.push("")

	return lines.join("\n")
}
