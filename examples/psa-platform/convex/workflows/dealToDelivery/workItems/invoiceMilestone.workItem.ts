import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProject,
  getCompany,
  getMilestone,
  updateMilestone,
  listApprovedBillableExpensesForInvoicing,
  insertInvoice,
  insertInvoiceLineItem,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires invoices:create scope
const invoiceMilestonePolicy = authService.policies.requireScope(
  'dealToDelivery:invoices:create'
)

// Schema for milestone invoice generation
const invoiceMilestonePayloadSchema = z.object({
  projectId: z.string(),
  milestoneId: z.string(),
  completionDate: z.number().optional(),
  includeExpenses: z.boolean().default(false),
})

const invoiceMilestoneActions = authService.builders.workItemActions
  // Start action
  .start(z.never(), invoiceMilestonePolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - generate milestone invoice
  .complete(
    invoiceMilestonePayloadSchema,
    invoiceMilestonePolicy,
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
      const milestoneId = payload.milestoneId as Id<'milestones'>

      const project = await getProject(mutationCtx.db, projectId)
      invariant(project, 'PROJECT_NOT_FOUND')

      const company = await getCompany(mutationCtx.db, project.companyId)
      invariant(company, 'COMPANY_NOT_FOUND')

      const milestone = await getMilestone(mutationCtx.db, milestoneId)
      invariant(milestone, 'MILESTONE_NOT_FOUND')

      // Verify milestone is for this project
      if (milestone.projectId !== projectId) {
        throw new Error('MILESTONE_PROJECT_MISMATCH')
      }

      // Verify milestone not already invoiced
      if (milestone.invoiceId) {
        throw new Error('MILESTONE_ALREADY_INVOICED')
      }

      // Calculate due date
      const dueDate = Date.now() + (company.paymentTerms * 24 * 60 * 60 * 1000)

      // Create draft invoice
      const invoiceId = await insertInvoice(mutationCtx.db, {
        organizationId: project.organizationId,
        projectId,
        companyId: project.companyId,
        status: 'Draft',
        method: 'Milestone',
        subtotal: milestone.amount,
        tax: 0,
        total: milestone.amount,
        dueDate,
        createdAt: Date.now(),
      })

      // Create milestone line item
      let lineItemSortOrder = 0
      await insertInvoiceLineItem(mutationCtx.db, {
        invoiceId,
        description: `Milestone: ${milestone.name}`,
        quantity: 1,
        rate: milestone.amount,
        amount: milestone.amount,
        sortOrder: lineItemSortOrder++,
      })

      let subtotal = milestone.amount

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

      // Mark milestone as completed and link to invoice
      await updateMilestone(mutationCtx.db, milestoneId, {
        completedAt: payload.completionDate ?? Date.now(),
        invoiceId,
      })

      // Update metadata with created invoice
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...metadata.payload,
          invoiceId,
          milestoneName: milestone.name,
          total: subtotal,
        } as typeof metadata.payload,
      })
    }
  )

export const invoiceMilestoneWorkItem = Builder.workItem('invoiceMilestone')
  .withActions(invoiceMilestoneActions.build())

export const invoiceMilestoneTask = Builder.task(invoiceMilestoneWorkItem)
  .withJoinType('xor')
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:invoices:create',
        payload: {
          type: 'invoiceMilestone',
          taskName: 'Generate Milestone Invoice',
          projectId: '' as Id<'projects'>,
          milestoneId: undefined,
        },
      })
    },
  })
