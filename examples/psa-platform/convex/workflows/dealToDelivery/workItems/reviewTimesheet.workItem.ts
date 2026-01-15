import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  listTimeEntriesByUserAndDateRange,
  updateTimeEntry,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires time:approve scope
const reviewTimesheetPolicy = authService.policies.requireScope(
  'dealToDelivery:time:approve'
)

// Schema for the complete action payload
// Manager reviews submitted time entries and decides to approve or reject
const reviewTimesheetPayloadSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  comments: z.string().optional(),
  // Individual decisions for partial approvals (optional)
  individualDecisions: z
    .array(
      z.object({
        timeEntryId: z.string(),
        decision: z.enum(['approve', 'reject']),
        comment: z.string().optional(),
      })
    )
    .optional(),
})

const reviewTimesheetActions = authService.builders.workItemActions
  // Start action - manager claims the work item to review
  .start(z.never(), reviewTimesheetPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    // Claim the work item for this reviewer
    await DealToDeliveryWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      userId
    )
    await workItem.start()
  })
  // Complete action - manager submits their review decision
  .complete(
    reviewTimesheetPayloadSchema,
    reviewTimesheetPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const reviewerId = authUser.userId
      invariant(reviewerId, 'USER_DOES_NOT_EXIST')

      // Verify the reviewer has claimed this work item
      const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id
      )
      invariant(metadata, 'WORK_ITEM_METADATA_NOT_FOUND')

      const claimedBy = isHumanClaim(metadata?.claim)
        ? metadata.claim.userId
        : null
      if (!claimedBy || claimedBy !== reviewerId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }

      // Get the timesheet metadata (userId and weekStartDate)
      const timesheetPayload = metadata.payload as {
        type: 'reviewTimesheet'
        taskName: string
        userId: Id<'users'>
        weekStartDate: number
      }
      invariant(
        timesheetPayload.type === 'reviewTimesheet',
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

      if (submittedEntries.length === 0) {
        throw new Error('NO_SUBMITTED_TIME_ENTRIES_TO_REVIEW')
      }

      const reviewerUserId = reviewerId as Id<'users'>

      // Cannot approve own timesheets (except system can bypass via internal mutation)
      if (timesheetPayload.userId === reviewerUserId) {
        throw new Error('CANNOT_APPROVE_OWN_TIMESHEET')
      }

      // If individual decisions provided, process them
      if (payload.individualDecisions && payload.individualDecisions.length > 0) {
        for (const decision of payload.individualDecisions) {
          const entry = submittedEntries.find(
            (e) => e._id === decision.timeEntryId
          )
          if (entry) {
            // Store the individual decision as a comment for now
            // The actual status update happens in approve/reject tasks
            if (decision.comment) {
              await updateTimeEntry(
                mutationCtx.db,
                decision.timeEntryId as Id<'timeEntries'>,
                { notes: `${entry.notes || ''}\n[Review note: ${decision.comment}]` }
              )
            }
          }
        }
      }

      // Store the decision in metadata for routing
      // The XOR routing will use this to determine next task
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...timesheetPayload,
          decision: payload.decision,
          reviewComments: payload.comments,
          reviewedBy: reviewerUserId,
          reviewedAt: Date.now(),
        },
      })

      // Note: Actual approval/rejection happens in approveTimesheet or rejectTimesheet tasks
      // This task just records the decision for workflow routing
    }
  )

export const reviewTimesheetWorkItem = Builder.workItem('reviewTimesheet')
  .withActions(reviewTimesheetActions.build())

export const reviewTimesheetTask = Builder.task(reviewTimesheetWorkItem)
  .withJoinType('xor') // XOR join for revision loop
  .withSplitType('xor') // XOR split for approve/reject paths
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Get metadata from parent workflow to know which user's timesheet to review
      // In a real scenario, this would come from the triggering event
      // For now, use placeholder values that will be set by the triggering workflow
      const now = Date.now()
      const weekStartDate = getWeekStartDate(now)

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:time:approve',
        payload: {
          type: 'reviewTimesheet',
          taskName: 'Review Timesheet',
          // These will be overridden by the workflow that triggers this
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
  const diff = date.getDate() - day + (day === 0 ? -6 : 1) // Adjust for Sunday
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}
