import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { insertTimeEntry, getUser } from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires time:create:own scope
const importFromCalendarPolicy = authService.policies.requireScope('dealToDelivery:time:create:own')

// Schema for calendar event to import
const calendarEventSchema = z.object({
  eventId: z.string(), // External calendar event ID
  title: z.string(),
  startTime: z.number(), // Unix timestamp
  endTime: z.number(), // Unix timestamp
  projectId: z.string(), // User maps event to project
  taskId: z.string().optional(),
  serviceId: z.string().optional(),
  billable: z.boolean().default(true),
})

// Schema for the complete action payload
const importFromCalendarPayloadSchema = z.object({
  calendarSource: z.enum(['google', 'outlook']),
  dateRange: z.object({
    startDate: z.number(),
    endDate: z.number(),
  }),
  selectedEvents: z.array(calendarEventSchema),
  excludePatterns: z.array(z.string()).optional(), // Event titles to exclude
})

const importFromCalendarActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), importFromCalendarPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - import calendar events as time entries
  .complete(
    importFromCalendarPayloadSchema,
    importFromCalendarPolicy,
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

      // Get user's organization
      const user = await getUser(mutationCtx.db, userId as Id<'users'>)
      invariant(user, 'USER_NOT_FOUND')
      invariant(user.organizationId, 'USER_NOT_IN_ORGANIZATION')

      // Create time entries for each selected event
      const timeEntryIds: Id<'timeEntries'>[] = []

      for (const event of payload.selectedEvents) {
        // Calculate hours from event duration
        const durationMs = event.endTime - event.startTime
        const hours = Math.round((durationMs / 3600000) * 100) / 100 // Round to 2 decimal places

        // Skip events with invalid duration
        if (hours <= 0) continue
        if (hours > 24) continue // Skip unreasonably long events

        // Create the time entry
        const timeEntryId = await insertTimeEntry(mutationCtx.db, {
          organizationId: user.organizationId,
          userId: userId as Id<'users'>,
          projectId: event.projectId as Id<'projects'>,
          taskId: event.taskId ? (event.taskId as Id<'tasks'>) : undefined,
          serviceId: event.serviceId ? (event.serviceId as Id<'services'>) : undefined,
          date: event.startTime, // Use event start time as the date
          hours,
          billable: event.billable,
          status: 'Draft',
          notes: `Imported from ${payload.calendarSource}: ${event.title}`,
          createdAt: Date.now(),
        })

        timeEntryIds.push(timeEntryId)
      }

      // Update metadata
      await mutationCtx.db.patch(metadata!._id, {
        payload: {
          type: 'importFromCalendar' as const,
          taskName: 'Import from Calendar',
          userId: userId as Id<'users'>,
          projectId: payload.selectedEvents[0]?.projectId as Id<'projects'> || '' as Id<'projects'>,
        },
      })
    },
  )

export const importFromCalendarWorkItem = Builder.workItem('importFromCalendar')
  .withActions(importFromCalendarActions.build())

export const importFromCalendarTask = Builder.task(importFromCalendarWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:time:create:own',
        payload: {
          type: 'importFromCalendar',
          taskName: 'Import from Calendar',
          userId: userId as Id<'users'>,
          projectId: '' as Id<'projects'>, // Will be set from context
        },
      })
    },
  })
