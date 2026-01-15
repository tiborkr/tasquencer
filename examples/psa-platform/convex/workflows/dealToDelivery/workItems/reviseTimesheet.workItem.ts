import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getTimeEntry,
  updateTimeEntry,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires time:edit:own scope for revision
const reviseTimesheetPolicy = authService.policies.requireScope(
  'dealToDelivery:time:edit:own'
)

// Schema for the complete action payload
// Team member corrects rejected time entries
const reviseTimesheetPayloadSchema = z.object({
  revisions: z.array(
    z.object({
      timeEntryId: z.string(),
      hours: z.number().min(0.25).max(24).optional(),
      projectId: z.string().optional(),
      taskId: z.string().optional(),
      serviceId: z.string().optional(),
      notes: z.string().optional(),
      billable: z.boolean().optional(),
      date: z.number().optional(),
    })
  ),
  resubmit: z.boolean().default(true),
})

const reviseTimesheetActions = authService.builders.workItemActions
  // Start action - team member starts revision
  .start(z.never(), reviseTimesheetPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    // Claim the work item for this team member
    await DealToDeliveryWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      userId
    )
    await workItem.start()
  })
  // Complete action - apply revisions and optionally resubmit
  .complete(
    reviseTimesheetPayloadSchema,
    reviseTimesheetPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      // Verify the user has claimed this work item
      const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id
      )
      invariant(metadata, 'WORK_ITEM_METADATA_NOT_FOUND')

      const claimedBy = isHumanClaim(metadata?.claim)
        ? metadata.claim.userId
        : null
      if (!claimedBy || claimedBy !== userId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }

      // Get the timesheet metadata
      const timesheetPayload = metadata.payload as {
        type: 'reviseTimesheet'
        taskName: string
        userId: Id<'users'>
        weekStartDate: number
      }
      invariant(
        timesheetPayload.type === 'reviseTimesheet',
        'INVALID_WORK_ITEM_TYPE'
      )

      // Verify the user is revising their own timesheet
      if (timesheetPayload.userId !== userId) {
        throw new Error('CAN_ONLY_REVISE_OWN_TIMESHEET')
      }

      // Apply each revision
      for (const revision of payload.revisions) {
        const entry = await getTimeEntry(
          mutationCtx.db,
          revision.timeEntryId as Id<'timeEntries'>
        )
        if (!entry) {
          throw new Error(`TIME_ENTRY_NOT_FOUND: ${revision.timeEntryId}`)
        }

        // Verify entry belongs to this user
        if (entry.userId !== userId) {
          throw new Error('TIME_ENTRY_DOES_NOT_BELONG_TO_USER')
        }

        // Verify entry is in Rejected status
        if (entry.status !== 'Rejected') {
          throw new Error('TIME_ENTRY_MUST_BE_REJECTED_TO_REVISE')
        }

        // Build update object with only provided fields
        const updates: Parameters<typeof updateTimeEntry>[2] = {
          // Clear rejection comments when revising
          rejectionComments: undefined,
        }

        if (revision.hours !== undefined) {
          updates.hours = revision.hours
        }
        if (revision.projectId !== undefined) {
          updates.projectId = revision.projectId as Id<'projects'>
        }
        if (revision.taskId !== undefined) {
          updates.taskId = revision.taskId as Id<'tasks'>
        }
        if (revision.serviceId !== undefined) {
          updates.serviceId = revision.serviceId as Id<'services'>
        }
        if (revision.notes !== undefined) {
          updates.notes = revision.notes
        }
        if (revision.billable !== undefined) {
          updates.billable = revision.billable
        }
        if (revision.date !== undefined) {
          updates.date = revision.date
        }

        // Set status based on resubmit flag
        if (payload.resubmit) {
          updates.status = 'Submitted'
        } else {
          updates.status = 'Draft'
        }

        await updateTimeEntry(
          mutationCtx.db,
          revision.timeEntryId as Id<'timeEntries'>,
          updates
        )
      }

      // Update metadata to record completion
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...timesheetPayload,
          revisedAt: Date.now(),
          resubmitted: payload.resubmit,
          revisionCount: payload.revisions.length,
        },
      })

      // Note: If resubmit=true, this will trigger another review cycle
      // The workflow will route back to reviewTimesheet
    }
  )

export const reviseTimesheetWorkItem = Builder.workItem('reviseTimesheet')
  .withActions(reviseTimesheetActions.build())

export const reviseTimesheetTask = Builder.task(reviseTimesheetWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Initialize with the same user/week context
      const now = Date.now()
      const weekStartDate = getWeekStartDate(now)

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:time:edit:own',
        payload: {
          type: 'reviseTimesheet',
          taskName: 'Revise Timesheet',
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
