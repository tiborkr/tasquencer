import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProjectByWorkflowId,
  insertTask,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires both tasks:create and tasks:assign scopes
const createAndAssignTasksPolicy = authService.policies.requireScope('dealToDelivery:tasks:create')

// Schema for task definition
const taskDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  assigneeIds: z.array(z.string()).min(1), // At least one assignee required
  estimatedHours: z.number().min(0).optional(),
  dueDate: z.number().optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).default('Medium'),
  parentTaskId: z.string().optional(), // For subtasks
  dependencies: z.array(z.string()).default([]),
})

// Schema for the complete action payload
const createAndAssignTasksPayloadSchema = z.object({
  tasks: z.array(taskDefinitionSchema).min(1),
})

const createAndAssignTasksActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), createAndAssignTasksPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - create tasks and assign them to team members
  .complete(
    createAndAssignTasksPayloadSchema,
    createAndAssignTasksPolicy,
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

      // Create all tasks with sortOrder
      const taskIds: Id<'tasks'>[] = []
      let sortOrder = 0

      for (const taskDef of payload.tasks) {
        const taskId = await insertTask(mutationCtx.db, {
          projectId: project._id,
          organizationId: project.organizationId,
          parentTaskId: taskDef.parentTaskId as Id<'tasks'> | undefined,
          name: taskDef.name,
          description: taskDef.description,
          status: 'Todo',
          assigneeIds: taskDef.assigneeIds as Id<'users'>[],
          dueDate: taskDef.dueDate,
          estimatedHours: taskDef.estimatedHours,
          priority: taskDef.priority,
          dependencies: taskDef.dependencies as Id<'tasks'>[],
          sortOrder,
          createdAt: Date.now(),
        })
        taskIds.push(taskId)
        sortOrder++
      }

      // Note: Returning taskIds for potential use by downstream activities
      // The workflow will proceed to track time/expenses and monitor budget
    },
  )

export const createAndAssignTasksWorkItem = Builder.workItem('createAndAssignTasks')
  .withActions(createAndAssignTasksActions.build())

export const createAndAssignTasksTask = Builder.task(createAndAssignTasksWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Find the project linked to this workflow
      const workflowId = parent.workflow.id
      const project = await getProjectByWorkflowId(mutationCtx.db, workflowId)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      // Initialize work item with human auth (no dealId, uses projectId)
      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:tasks:create',
        payload: {
          type: 'createAndAssignTasks',
          taskName: 'Create and Assign Tasks',
          projectId: project._id,
        },
      })
    },
  })
