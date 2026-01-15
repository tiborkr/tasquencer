import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProject,
  updateProject,
  getBudget,
  listTasksByProject,
  listTimeEntriesByProject,
  listExpensesByProject,
  listInvoicesByProject,
  listBookingsByProject,
  deleteBooking,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires dealToDelivery:projects:close scope
const closeProjectPolicy = authService.policies.requireScope('dealToDelivery:projects:close')

// Schema for closing a project
const closeProjectPayloadSchema = z.object({
  projectId: z.string(),
  closeDate: z.number(),
  completionStatus: z.enum(['completed', 'cancelled', 'on_hold_indefinitely']),
  closureNotes: z.string().optional(),
})

const closeProjectActions = authService.builders.workItemActions
  // Start action - claim the work item
  .start(z.never(), closeProjectPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await DealToDeliveryWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      userId
    )
    await workItem.start()
  })
  // Complete action - close the project
  .complete(
    closeProjectPayloadSchema,
    closeProjectPolicy,
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

      const projectId = payload.projectId as Id<'projects'>
      const project = await getProject(mutationCtx.db, projectId)
      invariant(project, 'PROJECT_NOT_FOUND')

      // Verify closure criteria
      const tasks = await listTasksByProject(mutationCtx.db, projectId)
      const timeEntries = await listTimeEntriesByProject(mutationCtx.db, projectId)
      const expenses = await listExpensesByProject(mutationCtx.db, projectId)
      const invoices = await listInvoicesByProject(mutationCtx.db, projectId)
      const bookings = await listBookingsByProject(mutationCtx.db, projectId)

      // Check closure conditions (task statuses: Todo, InProgress, Review, Done)
      const incompleteTasks = tasks.filter(t => t.status !== 'Done')
      const unapprovedTime = timeEntries.filter(t => t.status !== 'Approved')
      const unapprovedExpenses = expenses.filter(e => e.status !== 'Approved')
      const unsentInvoices = invoices.filter(i => i.status === 'Draft' || i.status === 'Finalized')
      const unpaidInvoices = invoices.filter(i => i.status === 'Sent' || i.status === 'Viewed')

      const warnings: string[] = []
      if (incompleteTasks.length > 0) {
        warnings.push(`${incompleteTasks.length} incomplete task(s)`)
      }
      if (unapprovedTime.length > 0) {
        warnings.push(`${unapprovedTime.length} unapproved time entry(ies)`)
      }
      if (unapprovedExpenses.length > 0) {
        warnings.push(`${unapprovedExpenses.length} unapproved expense(s)`)
      }
      if (unsentInvoices.length > 0) {
        warnings.push(`${unsentInvoices.length} unsent invoice(s)`)
      }
      if (unpaidInvoices.length > 0) {
        warnings.push(`${unpaidInvoices.length} unpaid invoice(s)`)
      }

      const verification = {
        allTasksComplete: incompleteTasks.length === 0,
        allTimeApproved: unapprovedTime.length === 0,
        allExpensesApproved: unapprovedExpenses.length === 0,
        allInvoicesSent: unsentInvoices.length === 0,
        allInvoicesPaid: unpaidInvoices.length === 0,
        warnings: warnings.length > 0 ? warnings : undefined,
      }

      // Calculate project metrics
      const totalRevenue = invoices
        .filter(i => i.status !== 'Void')
        .reduce((sum, i) => sum + i.total, 0)

      // Calculate time cost (we need user cost rates - approximating with hours * average rate)
      const totalTimeHours = timeEntries.reduce((sum, t) => sum + (t.hours || 0), 0)
      const avgCostRate = 5000 // Default average cost rate in cents/hour
      const timeCost = totalTimeHours * avgCostRate

      // Calculate expense cost
      const expenseCost = expenses.reduce((sum, e) => sum + e.amount, 0)
      const totalCost = timeCost + expenseCost

      const profit = totalRevenue - totalCost
      const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0

      // Get budget for variance calculation
      const budget = project.budgetId
        ? await getBudget(mutationCtx.db, project.budgetId)
        : null
      const budgetVariance = budget && budget.totalAmount > 0
        ? (totalCost / budget.totalAmount) * 100
        : 0

      const durationDays = Math.ceil(
        (payload.closeDate - project.startDate) / (1000 * 60 * 60 * 24)
      )

      const metrics = {
        totalRevenue,
        totalCost,
        profit,
        profitMargin,
        budgetVariance,
        durationDays,
      }

      // Cancel future bookings
      const now = Date.now()
      const futureBookings = bookings.filter(b => b.startDate > now)
      for (const booking of futureBookings) {
        await deleteBooking(mutationCtx.db, booking._id)
      }

      // Update project status
      await updateProject(mutationCtx.db, projectId, {
        status: 'Completed',
        endDate: payload.closeDate,
      })

      // Update work item metadata with closure details
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...metadata.payload,
          closeDate: payload.closeDate,
          completionStatus: payload.completionStatus,
          closureNotes: payload.closureNotes,
          closedBy: userId as Id<'users'>,
          closedAt: Date.now(),
          verification,
          metrics,
        } as typeof metadata.payload,
      })
    }
  )

export const closeProjectWorkItem = Builder.workItem('closeProject')
  .withActions(closeProjectActions.build())

export const closeProjectTask = Builder.task(closeProjectWorkItem).withActivities(
  {
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:projects:close',
        payload: {
          type: 'closeProject',
          taskName: 'Close Project',
          projectId: '' as Id<'projects'>,
        },
      })
    },
  }
)
