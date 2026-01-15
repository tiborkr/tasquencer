import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { listTimeEntriesByUserAndDateRange, updateTimeEntry } from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires time:approve scope for rejection
const rejectTimesheetPolicy = authService.policies.requireScope(
  'dealToDelivery:time:approve'
)

// Schema for the complete action payload
// Reject time entries with feedback
const rejectTimesheetPayloadSchema = z.object({
  comments: z.string().min(1, 'Rejection comments are required'),
})

const rejectTimesheetActions = authService.builders.workItemActions
  // Start action - automatic continuation from reviewTimesheet
  .start(z.never(), rejectTimesheetPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    // Claim the work item for this rejecter
    await DealToDeliveryWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      userId
    )
    await workItem.start()
  })
  // Complete action - reject the time entries with comments
  .complete(
    rejectTimesheetPayloadSchema,
    rejectTimesheetPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const rejecterId = authUser.userId
      invariant(rejecterId, 'USER_DOES_NOT_EXIST')

      // Verify the rejecter has claimed this work item
      const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id
      )
      invariant(metadata, 'WORK_ITEM_METADATA_NOT_FOUND')

      const claimedBy = isHumanClaim(metadata?.claim)
        ? metadata.claim.userId
        : null
      if (!claimedBy || claimedBy !== rejecterId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }

      // Get the timesheet metadata
      const timesheetPayload = metadata.payload as {
        type: 'rejectTimesheet'
        taskName: string
        userId: Id<'users'>
        weekStartDate: number
      }
      invariant(
        timesheetPayload.type === 'rejectTimesheet',
        'INVALID_WORK_ITEM_TYPE'
      )

      // Calculate week end date (7 days from start)
      const weekEndDate = timesheetPayload.weekStartDate + 7 * 24 * 60 * 60 * 1000

      // Get all submitted time entries for the user within this week
      const allEntries = await listTimeEntriesByUserAndDateRange(
        mutationCtx.db,
        timesheetPayload.userId,
        timesheetPayload.weekStartDate,
        weekEndDate
      )
      const submittedEntries = allEntries.filter(
        (e) => e.status === 'Submitted'
      )

      // Reject all submitted entries
      let rejectedCount = 0
      const rejecterUserId = rejecterId as Id<'users'>

      for (const entry of submittedEntries) {
        await updateTimeEntry(mutationCtx.db, entry._id, {
          status: 'Rejected',
          rejectionComments: payload.comments,
        })
        rejectedCount++
      }

      // Update metadata to record completion
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...timesheetPayload,
          rejectedBy: rejecterUserId,
          rejectedAt: Date.now(),
          rejectionComments: payload.comments,
          rejectedCount,
        },
      })

      // Note: Team member notification would be handled by a separate notification service
      // that watches for status changes on time entries
    }
  )

export const rejectTimesheetWorkItem = Builder.workItem('rejectTimesheet')
  .withActions(rejectTimesheetActions.build())

export const rejectTimesheetTask = Builder.task(rejectTimesheetWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Initialize with the same user/week context
      const now = Date.now()
      const weekStartDate = getWeekStartDate(now)

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:time:approve',
        payload: {
          type: 'rejectTimesheet',
          taskName: 'Reject Timesheet',
          userId: '' as Id<'users'>,
          weekStartDate,
        },
      })
    },
  })

// Helper to get the start of the week (Monday)
function getWeekStartDate(timestamp: number): number {
  const date = new Date(timestamp)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}
