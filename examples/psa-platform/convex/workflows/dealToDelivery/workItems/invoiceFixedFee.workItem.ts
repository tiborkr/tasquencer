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
  listApprovedBillableExpensesForInvoicing,
  insertInvoice,
  insertInvoiceLineItem,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires invoices:create scope
const invoiceFixedFeePolicy = authService.policies.requireScope(
  'dealToDelivery:invoices:create'
)

// Schema for fixed fee invoice generation
const invoiceFixedFeePayloadSchema = z.object({
  projectId: z.string(),
  invoiceAmount: z.number().optional(), // Amount in cents
  percentageOfBudget: z.number().min(0).max(100).optional(), // As percentage
  description: z.string().default('Fixed Fee Services'),
  includeExpenses: z.boolean().default(false),
})

const invoiceFixedFeeActions = authService.builders.workItemActions
  // Start action
  .start(z.never(), invoiceFixedFeePolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - generate fixed fee invoice
  .complete(
    invoiceFixedFeePayloadSchema,
    invoiceFixedFeePolicy,
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

      // Calculate invoice amount
      let invoiceAmount: number
      if (payload.invoiceAmount !== undefined) {
        invoiceAmount = payload.invoiceAmount
      } else if (payload.percentageOfBudget !== undefined && budget) {
        invoiceAmount = Math.round(budget.totalAmount * (payload.percentageOfBudget / 100))
      } else if (budget) {
        // Default to full budget amount
        invoiceAmount = budget.totalAmount
      } else {
        throw new Error('INVOICE_AMOUNT_REQUIRED')
      }

      // Calculate due date
      const dueDate = Date.now() + (company.paymentTerms * 24 * 60 * 60 * 1000)

      // Create draft invoice
      const invoiceId = await insertInvoice(mutationCtx.db, {
        organizationId: project.organizationId,
        projectId,
        companyId: project.companyId,
        status: 'Draft',
        method: 'FixedFee',
        subtotal: invoiceAmount,
        tax: 0,
        total: invoiceAmount,
        dueDate,
        createdAt: Date.now(),
      })

      // Create single fixed fee line item
      let lineItemSortOrder = 0
      await insertInvoiceLineItem(mutationCtx.db, {
        invoiceId,
        description: payload.description,
        quantity: 1,
        rate: invoiceAmount,
        amount: invoiceAmount,
        sortOrder: lineItemSortOrder++,
      })

      let subtotal = invoiceAmount

      // Optionally add expense line items
      if (payload.includeExpenses) {
        const expenses = await listApprovedBillableExpensesForInvoicing(
          mutationCtx.db,
          projectId
        )

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

        // Update invoice totals if expenses were added
        await mutationCtx.db.patch(invoiceId, {
          subtotal,
          total: subtotal,
        })
      }

      // Update metadata with created invoice
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...metadata.payload,
          invoiceId,
          total: subtotal,
        } as typeof metadata.payload,
      })
    }
  )

export const invoiceFixedFeeWorkItem = Builder.workItem('invoiceFixedFee')
  .withActions(invoiceFixedFeeActions.build())

export const invoiceFixedFeeTask = Builder.task(invoiceFixedFeeWorkItem)
  .withJoinType('xor')
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:invoices:create',
        payload: {
          type: 'invoiceFixedFee',
          taskName: 'Generate Fixed Fee Invoice',
          projectId: '' as Id<'projects'>,
        },
      })
    },
  })
