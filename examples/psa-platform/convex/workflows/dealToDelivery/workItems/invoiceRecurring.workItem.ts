import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProject,
  getCompany,
  getBudgetByProject,
  listTimeEntriesByProject,
  insertInvoice,
  insertInvoiceLineItem,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires invoices:create scope
const invoiceRecurringPolicy = authService.policies.requireScope(
  'dealToDelivery:invoices:create'
)

// Schema for recurring/retainer invoice generation
const invoiceRecurringPayloadSchema = z.object({
  projectId: z.string(),
  billingPeriod: z.object({
    startDate: z.number(),
    endDate: z.number(),
  }),
  retainerAmount: z.number().optional(), // Override retainer amount if needed
  includedHours: z.number().optional(), // Hours included in retainer
  overageRate: z.number().optional(), // Rate for hours over retainer
  includeOverage: z.boolean().default(true),
  rolloverUnused: z.boolean().default(false),
})

const invoiceRecurringActions = authService.builders.workItemActions
  // Start action
  .start(z.never(), invoiceRecurringPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - generate recurring invoice
  .complete(
    invoiceRecurringPayloadSchema,
    invoiceRecurringPolicy,
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

      const budget = await getBudgetByProject(mutationCtx.db, projectId)

      // Use payload values or defaults from budget
      const retainerAmount = payload.retainerAmount ?? budget?.totalAmount ?? 0
      const includedHours = payload.includedHours ?? 0
      const overageRate = payload.overageRate ?? 15000 // Default $150/hr in cents

      // Calculate hours used in this billing period
      const allTimeEntries = await listTimeEntriesByProject(mutationCtx.db, projectId)
      const periodEntries = allTimeEntries.filter(
        (e) =>
          e.date >= payload.billingPeriod.startDate &&
          e.date <= payload.billingPeriod.endDate &&
          (e.status === 'Approved' || e.status === 'Locked')
      )
      const hoursUsed = periodEntries.reduce((sum, e) => sum + e.hours, 0)

      // Format period description
      const startDate = new Date(payload.billingPeriod.startDate)
      const endDate = new Date(payload.billingPeriod.endDate)
      const periodDescription = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`

      // Calculate due date
      const dueDate = Date.now() + (company.paymentTerms * 24 * 60 * 60 * 1000)

      // Create draft invoice
      const invoiceId = await insertInvoice(mutationCtx.db, {
        organizationId: project.organizationId,
        projectId,
        companyId: project.companyId,
        status: 'Draft',
        method: 'Recurring',
        subtotal: retainerAmount,
        tax: 0,
        total: retainerAmount,
        dueDate,
        createdAt: Date.now(),
      })

      // Create line items
      let lineItemSortOrder = 0
      let subtotal = 0

      // Base retainer line item
      await insertInvoiceLineItem(mutationCtx.db, {
        invoiceId,
        description: `Retainer: ${periodDescription}`,
        quantity: 1,
        rate: retainerAmount,
        amount: retainerAmount,
        sortOrder: lineItemSortOrder++,
      })
      subtotal += retainerAmount

      // Calculate overage if hours exceed included hours
      if (payload.includeOverage && hoursUsed > includedHours) {
        const overageHours = hoursUsed - includedHours
        const overageAmount = Math.round(overageHours * overageRate)
        subtotal += overageAmount

        await insertInvoiceLineItem(mutationCtx.db, {
          invoiceId,
          description: `Additional hours (${overageHours.toFixed(2)} hrs @ $${(overageRate / 100).toFixed(2)}/hr)`,
          quantity: overageHours,
          rate: overageRate,
          amount: overageAmount,
          sortOrder: lineItemSortOrder++,
        })
      }

      // Handle rollover credit (informational only for now)
      if (payload.rolloverUnused && includedHours > hoursUsed) {
        const unusedHours = includedHours - hoursUsed
        // Add a note line item for rollover credit (no charge)
        await insertInvoiceLineItem(mutationCtx.db, {
          invoiceId,
          description: `Unused hours rollover credit: ${unusedHours.toFixed(2)} hrs`,
          quantity: unusedHours,
          rate: 0,
          amount: 0,
          sortOrder: lineItemSortOrder++,
        })
      }

      // Update invoice totals
      await mutationCtx.db.patch(invoiceId, {
        subtotal,
        total: subtotal,
      })

      // Update metadata with created invoice
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...metadata.payload,
          invoiceId,
          total: subtotal,
          hoursUsed,
        } as typeof metadata.payload,
      })
    }
  )

export const invoiceRecurringWorkItem = Builder.workItem('invoiceRecurring')
  .withActions(invoiceRecurringActions.build())

export const invoiceRecurringTask = Builder.task(invoiceRecurringWorkItem)
  .withJoinType('xor')
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:invoices:create',
        payload: {
          type: 'invoiceRecurring',
          taskName: 'Generate Recurring Invoice',
          projectId: '' as Id<'projects'>,
        },
      })
    },
  })
