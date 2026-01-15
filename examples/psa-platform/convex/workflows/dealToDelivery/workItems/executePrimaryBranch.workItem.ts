import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProjectByWorkflowId,
  updateTask,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires tasks:edit:all scope to execute primary branch
const executePrimaryBranchPolicy = authService.policies.requireScope('dealToDelivery:tasks:edit:all')

// Schema for the complete action payload
const executePrimaryBranchPayloadSchema = z.object({
  // Optional: specific tasks to execute in primary branch
  taskIds: z.array(z.string()).optional(),
  // Description of primary branch action
  action: z.string().optional(),
  notes: z.string().optional(),
})

const executePrimaryBranchActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), executePrimaryBranchPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - execute the primary branch
  .complete(
    executePrimaryBranchPayloadSchema,
    executePrimaryBranchPolicy,
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

      // Execute primary branch tasks if specified
      if (payload.taskIds && payload.taskIds.length > 0) {
        for (const taskId of payload.taskIds) {
          await updateTask(mutationCtx.db, taskId as Id<'tasks'>, {
            status: 'InProgress',
          })
          // Complete the task
          await updateTask(mutationCtx.db, taskId as Id<'tasks'>, {
            status: 'Done',
          })
        }
      }

      // Primary branch execution complete
      // The workflow continues along the primary path
    },
  )

export const executePrimaryBranchWorkItem = Builder.workItem('executePrimaryBranch')
  .withActions(executePrimaryBranchActions.build())

export const executePrimaryBranchTask = Builder.task(executePrimaryBranchWorkItem)
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
        scope: 'dealToDelivery:tasks:edit:all',
        payload: {
          type: 'executePrimaryBranch',
          taskName: 'Execute Primary Branch',
          projectId: project._id,
        },
      })
    },
  })
