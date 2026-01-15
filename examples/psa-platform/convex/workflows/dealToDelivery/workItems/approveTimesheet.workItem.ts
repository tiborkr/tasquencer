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

// Policy: requires time:approve scope
const approveTimesheetPolicy = authService.policies.requireScope(
  'dealToDelivery:time:approve'
)

// Schema for the complete action payload
// Finalize approval of reviewed time entries
const approveTimesheetPayloadSchema = z.object({
  approvalNotes: z.string().optional(),
})

const approveTimesheetActions = authService.builders.workItemActions
  // Start action - automatic continuation from reviewTimesheet
  .start(z.never(), approveTimesheetPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    // Claim the work item for this approver
    await DealToDeliveryWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      userId
    )
    await workItem.start()
  })
  // Complete action - finalize the approval and lock entries
  .complete(
    approveTimesheetPayloadSchema,
    approveTimesheetPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const approverId = authUser.userId
      invariant(approverId, 'USER_DOES_NOT_EXIST')

      // Verify the approver has claimed this work item
      const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id
      )
      invariant(metadata, 'WORK_ITEM_METADATA_NOT_FOUND')

      const claimedBy = isHumanClaim(metadata?.claim)
        ? metadata.claim.userId
        : null
      if (!claimedBy || claimedBy !== approverId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }

      // Get the timesheet metadata
      const timesheetPayload = metadata.payload as {
        type: 'approveTimesheet'
        taskName: string
        userId: Id<'users'>
        weekStartDate: number
      }
      invariant(
        timesheetPayload.type === 'approveTimesheet',
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

      // Approve all submitted entries
      const now = Date.now()
      let approvedCount = 0
      const approverUserId = approverId as Id<'users'>

      for (const entry of submittedEntries) {
        await updateTimeEntry(mutationCtx.db, entry._id, {
          status: 'Approved',
          approvedBy: approverUserId,
          approvedAt: now,
        })
        approvedCount++
      }

      // Update metadata to record completion
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...timesheetPayload,
          approvedBy: approverUserId,
          approvedAt: now,
          approvalNotes: payload.approvalNotes,
          approvedCount,
        },
      })

      // Note: Team member notification would be handled by a separate notification service
      // that watches for status changes on time entries
    }
  )

export const approveTimesheetWorkItem = Builder.workItem('approveTimesheet')
  .withActions(approveTimesheetActions.build())

export const approveTimesheetTask = Builder.task(approveTimesheetWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Initialize with the same user/week context as reviewTimesheet
      const now = Date.now()
      const weekStartDate = getWeekStartDate(now)

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:time:approve',
        payload: {
          type: 'approveTimesheet',
          taskName: 'Approve Timesheet',
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
