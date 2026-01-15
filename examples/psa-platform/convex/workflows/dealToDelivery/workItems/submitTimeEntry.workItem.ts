import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { getTimeEntry, updateTimeEntry } from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires time:submit scope
const submitTimeEntryPolicy = authService.policies.requireScope('dealToDelivery:time:submit')

// Schema for the complete action payload
const submitTimeEntryPayloadSchema = z.object({
  timeEntryId: z.string(), // Will be cast to Id<"timeEntries">
})

const submitTimeEntryActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), submitTimeEntryPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - submit the time entry for approval
  .complete(
    submitTimeEntryPayloadSchema,
    submitTimeEntryPolicy,
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

      // Get the time entry
      const timeEntry = await getTimeEntry(
        mutationCtx.db,
        payload.timeEntryId as Id<'timeEntries'>,
      )
      invariant(timeEntry, 'TIME_ENTRY_NOT_FOUND')

      // Validate entry belongs to current user
      if (timeEntry.userId !== userId) {
        throw new Error('TIME_ENTRY_DOES_NOT_BELONG_TO_USER')
      }

      // Validate entry is in Draft status
      if (timeEntry.status !== 'Draft') {
        throw new Error('TIME_ENTRY_MUST_BE_DRAFT_TO_SUBMIT')
      }

      // Update status to Submitted
      await updateTimeEntry(
        mutationCtx.db,
        payload.timeEntryId as Id<'timeEntries'>,
        {
          status: 'Submitted',
        },
      )

      // Update metadata with the submitted time entry
      await mutationCtx.db.patch(metadata!._id, {
        payload: {
          type: 'submitTimeEntry' as const,
          taskName: 'Submit Time Entry',
          timeEntryId: payload.timeEntryId as Id<'timeEntries'>,
        },
      })

      // Note: Manager notification would be handled by a separate notification service
      // that watches for status changes on time entries
    },
  )

export const submitTimeEntryWorkItem = Builder.workItem('submitTimeEntry')
  .withActions(submitTimeEntryActions.build())

export const submitTimeEntryTask = Builder.task(submitTimeEntryWorkItem)
  .withJoinType('xor') // XOR join for multiple entry method paths
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // We don't have a timeEntryId yet - will be set in complete action
      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:time:submit',
        payload: {
          type: 'submitTimeEntry',
          taskName: 'Submit Time Entry',
          timeEntryId: '' as Id<'timeEntries'>, // Will be set when completing
        },
      })
    },
  })
