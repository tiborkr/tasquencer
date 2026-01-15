import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProject,
  getCompany,
  listApprovedBillableTimeEntriesForInvoicing,
  listApprovedBillableExpensesForInvoicing,
  getService,
  insertInvoice,
  insertInvoiceLineItem,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id, Doc } from '../../../_generated/dataModel'

// Policy: requires invoices:create scope
const invoiceTimeAndMaterialsPolicy = authService.policies.requireScope(
  'dealToDelivery:invoices:create'
)

// Schema for T&M invoice generation
const invoiceTimeAndMaterialsPayloadSchema = z.object({
  projectId: z.string(),
  dateRange: z.object({
    startDate: z.number(),
    endDate: z.number(),
  }).optional(),
  includeExpenses: z.boolean().default(true),
  groupBy: z.enum(['service', 'task', 'date', 'person']).default('service'),
  detailLevel: z.enum(['summary', 'detailed']).default('summary'),
})

const invoiceTimeAndMaterialsActions = authService.builders.workItemActions
  // Start action - finance user claims the work item
  .start(z.never(), invoiceTimeAndMaterialsPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - generate T&M invoice
  .complete(
    invoiceTimeAndMaterialsPayloadSchema,
    invoiceTimeAndMaterialsPolicy,
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

      const company = await getCompany(mutationCtx.db, project.companyId)
      invariant(company, 'COMPANY_NOT_FOUND')

      // Get uninvoiced time entries
      let timeEntries = await listApprovedBillableTimeEntriesForInvoicing(
        mutationCtx.db,
        projectId
      )

      // Filter by date range if specified
      if (payload.dateRange) {
        timeEntries = timeEntries.filter(
          (e) => e.date >= payload.dateRange!.startDate && e.date <= payload.dateRange!.endDate
        )
      }

      // Get uninvoiced expenses if included
      let expenses: Doc<'expenses'>[] = []
      if (payload.includeExpenses) {
        expenses = await listApprovedBillableExpensesForInvoicing(
          mutationCtx.db,
          projectId
        )
        if (payload.dateRange) {
          expenses = expenses.filter(
            (e) => e.date >= payload.dateRange!.startDate && e.date <= payload.dateRange!.endDate
          )
        }
      }

      if (timeEntries.length === 0 && expenses.length === 0) {
        throw new Error('NO_UNINVOICED_ITEMS')
      }

      // Group time entries by service (default grouping)
      // Build service-grouped line items
      const serviceGroups = new Map<string, {
        name: string
        rate: number
        hours: number
        timeEntryIds: Id<'timeEntries'>[]
      }>()

      for (const entry of timeEntries) {
        let serviceName = 'General'
        let rate = 0

        if (entry.serviceId) {
          const service = await getService(mutationCtx.db, entry.serviceId)
          if (service) {
            serviceName = service.name
            rate = service.rate
          }
        }

        const key = `${serviceName}-${rate}`
        const existing = serviceGroups.get(key)
        if (existing) {
          existing.hours += entry.hours
          existing.timeEntryIds.push(entry._id)
        } else {
          serviceGroups.set(key, {
            name: serviceName,
            rate,
            hours: entry.hours,
            timeEntryIds: [entry._id],
          })
        }
      }

      // Calculate due date (default 30 days from company payment terms)
      const dueDate = Date.now() + (company.paymentTerms * 24 * 60 * 60 * 1000)

      // Create draft invoice
      const invoiceId = await insertInvoice(mutationCtx.db, {
        organizationId: project.organizationId,
        projectId,
        companyId: project.companyId,
        status: 'Draft',
        method: 'TimeAndMaterials',
        subtotal: 0, // Will be updated after line items
        tax: 0,
        total: 0,
        dueDate,
        createdAt: Date.now(),
      })

      // Create line items for time entries
      let lineItemSortOrder = 0
      let subtotal = 0

      for (const [_, group] of serviceGroups) {
        const amount = Math.round(group.hours * group.rate)
        subtotal += amount

        await insertInvoiceLineItem(mutationCtx.db, {
          invoiceId,
          description: group.name,
          quantity: group.hours,
          rate: group.rate,
          amount,
          timeEntryIds: group.timeEntryIds,
          sortOrder: lineItemSortOrder++,
        })
      }

      // Create line items for expenses
      for (const expense of expenses) {
        const markupMultiplier = expense.markupRate ?? 1
        const amount = Math.round(expense.amount * markupMultiplier)
        subtotal += amount

        await insertInvoiceLineItem(mutationCtx.db, {
          invoiceId,
          description: `Expense: ${expense.description}`,
          quantity: 1,
          rate: amount,
          amount,
          expenseIds: [expense._id],
          sortOrder: lineItemSortOrder++,
        })
      }

      // Update invoice totals (no tax for now)
      const total = subtotal
      await mutationCtx.db.patch(invoiceId, {
        subtotal,
        tax: 0,
        total,
      })

      // Update metadata with created invoice
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...metadata.payload,
          invoiceId,
          lineItemCount: lineItemSortOrder,
          total,
        } as typeof metadata.payload,
      })
    }
  )

export const invoiceTimeAndMaterialsWorkItem = Builder.workItem('invoiceTimeAndMaterials')
  .withActions(invoiceTimeAndMaterialsActions.build())

export const invoiceTimeAndMaterialsTask = Builder.task(invoiceTimeAndMaterialsWorkItem)
  .withJoinType('xor')
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:invoices:create',
        payload: {
          type: 'invoiceTimeAndMaterials',
          taskName: 'Generate T&M Invoice',
          projectId: '' as Id<'projects'>,
        },
      })
    },
  })
