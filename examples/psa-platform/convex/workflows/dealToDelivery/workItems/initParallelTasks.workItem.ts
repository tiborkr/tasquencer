import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProjectByWorkflowId,
  listTasksByProject,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires tasks:view:all scope to identify parallel tasks
const initParallelTasksPolicy = authService.policies.requireScope('dealToDelivery:tasks:view:all')

// Schema for the complete action payload
const initParallelTasksPayloadSchema = z.object({
  // Optional: specific task IDs to run in parallel
  taskIds: z.array(z.string()).optional(),
  // Or identify by criteria
  criteria: z.object({
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
    maxTasks: z.number().int().min(1).default(5),
  }).optional(),
})

const initParallelTasksActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), initParallelTasksPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    // Claim the work item for this user
    await DealToDeliveryWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      userId,
    )
    await workItem.start()
  })
  // Complete action - identify tasks that can be executed in parallel
  .complete(
    initParallelTasksPayloadSchema,
    initParallelTasksPolicy,
    async ({ mutationCtx, workItem, parent }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      // Verify the user has claimed this work item
      const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id,
      )
      invariant(metadata, 'WORK_ITEM_METADATA_NOT_FOUND')

      const claimedBy = isHumanClaim(metadata.claim)
        ? metadata.claim.userId
        : null
      if (!claimedBy || claimedBy !== userId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }

      // Get the project from the workflow
      const workflowId = parent.workflow.id
      const project = await getProjectByWorkflowId(mutationCtx.db, workflowId)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      // If specific task IDs provided, validate them
      if (payload.taskIds && payload.taskIds.length > 0) {
        const tasks = await listTasksByProject(mutationCtx.db, project._id)
        const taskMap = new Map(tasks.map((t) => [t._id, t]))

        // Verify all specified tasks exist and are in Todo status
        for (const taskId of payload.taskIds) {
          const task = taskMap.get(taskId as Id<'tasks'>)
          invariant(task, `TASK_NOT_FOUND: ${taskId}`)
          invariant(task.status === 'Todo', `TASK_NOT_IN_TODO_STATUS: ${taskId}`)
        }
        // Tasks are valid for parallel execution
        return
      }

      // Otherwise, identify parallel tasks by criteria
      const tasks = await listTasksByProject(mutationCtx.db, project._id)
      const criteria = payload.criteria ?? { maxTasks: 5 }

      // Find tasks that can be executed in parallel:
      // - Status is Todo
      // - All dependencies are Done
      // - Optionally match priority filter
      const eligibleTasks = tasks.filter((task) => {
        if (task.status !== 'Todo') return false
        if (criteria.priority && task.priority !== criteria.priority) return false

        // Check dependencies
        for (const depId of task.dependencies) {
          const depTask = tasks.find((t) => t._id === depId)
          if (depTask && depTask.status !== 'Done') return false
        }

        return true
      })

      // Take up to maxTasks for parallel execution
      // eligibleTasks.slice(0, criteria.maxTasks) returns the tasks to execute
      void eligibleTasks.slice(0, criteria.maxTasks)

      // The identified tasks are available for parallel execution
      // Downstream workflow will handle creating parallel work items
    },
  )

export const initParallelTasksWorkItem = Builder.workItem('initParallelTasks')
  .withActions(initParallelTasksActions.build())

export const initParallelTasksTask = Builder.task(initParallelTasksWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Find the project linked to this workflow
      const workflowId = parent.workflow.id
      const project = await getProjectByWorkflowId(mutationCtx.db, workflowId)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      // Initialize work item with human auth
      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:tasks:view:all',
        payload: {
          type: 'initParallelTasks',
          taskName: 'Initialize Parallel Tasks',
          projectId: project._id,
        },
      })
    },
  })
