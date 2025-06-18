import { Empty } from "@shared/proto/cline/common"
import { NewTaskRequest } from "@shared/proto/cline/task"
import { Controller } from ".."

/**
 * Creates a new task with the given text and optional images
 * @param controller The controller instance
 * @param request The new task request containing text and optional images
 * @returns Empty response
 */
export async function newTask(controller: Controller, request: NewTaskRequest): Promise<Empty> {
	// await controller.spawnNewTask(request.text, request.images)
	await controller.initTask(request.text, request.images, request.files, undefined)
	return Empty.create()
}
