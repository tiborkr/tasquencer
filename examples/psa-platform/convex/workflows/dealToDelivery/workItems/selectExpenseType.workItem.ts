import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires expenses:create scope (user can create their own expenses)
const selectExpenseTypePolicy = authService.policies.requireScope('dealToDelivery:expenses:create')

// Schema for the complete action payload
const selectExpenseTypePayloadSchema = z.object({
  expenseType: z.enum(['Software', 'Travel', 'Materials', 'Subcontractor', 'Other']),
  projectId: z.string(), // Will be cast to Id<"projects">
})

const selectExpenseTypeActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), selectExpenseTypePolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - record the selected expense type for routing
  .complete(
    selectExpenseTypePayloadSchema,
    selectExpenseTypePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      // Verify the user has claimed this work item
      const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id,
      )
      const claimedBy = isHumanClaim(metadata?.claim)
        ? metadata.claim.userId
        : null
      if (!claimedBy || claimedBy !== userId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }

      // Update work item metadata with the selected expense type
      // The routing decision will be made by the workflow based on this payload
      await mutationCtx.db.patch(metadata!._id, {
        payload: {
          type: 'selectExpenseType' as const,
          taskName: 'Select Expense Type',
          userId: userId as Id<'users'>,
          projectId: payload.projectId as Id<'projects'>,
        },
      })

      // Store selected expense type for workflow routing decision
      // This will be read by the route function in the workflow
    },
  )

export const selectExpenseTypeWorkItem = Builder.workItem('selectExpenseType')
  .withActions(selectExpenseTypeActions.build())

export const selectExpenseTypeTask = Builder.task(selectExpenseTypeWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Initialize with minimal metadata - projectId will be set in complete action
      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:expenses:create',
        payload: {
          type: 'selectExpenseType',
          taskName: 'Select Expense Type',
          userId: userId as Id<'users'>,
          projectId: '' as Id<'projects'>, // Will be set when completing
        },
      })
    },
  })
