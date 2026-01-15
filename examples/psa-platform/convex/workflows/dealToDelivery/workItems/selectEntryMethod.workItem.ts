import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires time:create:own scope (user can create their own time entries)
const selectEntryMethodPolicy = authService.policies.requireScope('dealToDelivery:time:create:own')

// Schema for the complete action payload
const selectEntryMethodPayloadSchema = z.object({
  method: z.enum(['timer', 'manual', 'calendar', 'autoBooking']),
  projectId: z.string(), // Will be cast to Id<"projects">
  date: z.number().optional(), // Date for manual/calendar entries
})

const selectEntryMethodActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), selectEntryMethodPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - record the selected method
  .complete(
    selectEntryMethodPayloadSchema,
    selectEntryMethodPolicy,
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

      // Update work item metadata with the selected method
      // The routing decision will be made by the workflow based on this payload
      await mutationCtx.db.patch(metadata!._id, {
        payload: {
          type: 'selectEntryMethod' as const,
          taskName: 'Select Time Entry Method',
          userId: userId as Id<'users'>,
          projectId: payload.projectId as Id<'projects'>,
          method: payload.method, // Store the selected method for routing
        },
      })
    },
  )

export const selectEntryMethodWorkItem = Builder.workItem('selectEntryMethod')
  .withActions(selectEntryMethodActions.build())

export const selectEntryMethodTask = Builder.task(selectEntryMethodWorkItem)
  .withJoinType('xor') // XOR join for multiple incoming paths
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Initialize with minimal metadata - projectId will be set in complete action
      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:time:create:own',
        payload: {
          type: 'selectEntryMethod',
          taskName: 'Select Time Entry Method',
          userId: userId as Id<'users'>,
          projectId: '' as Id<'projects'>, // Will be set when completing
        },
      })
    },
  })
