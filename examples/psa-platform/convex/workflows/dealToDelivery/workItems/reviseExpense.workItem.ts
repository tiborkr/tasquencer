import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { getExpense, updateExpense } from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires expenses:edit:own scope for revision
const reviseExpensePolicy = authService.policies.requireScope(
  'dealToDelivery:expenses:edit:own'
)

// Schema for the complete action payload
// Team member corrects rejected expense based on feedback
const reviseExpensePayloadSchema = z.object({
  revisions: z.object({
    description: z.string().optional(),
    amount: z.number().positive().optional(),
    date: z.number().optional(),
    type: z.enum(['Software', 'Travel', 'Materials', 'Subcontractor', 'Other']).optional(),
    receiptUrl: z.string().url().optional(),
    vendorInfo: z.object({
      name: z.string(),
      taxId: z.string().optional(),
    }).optional(),
    billable: z.boolean().optional(),
    markupRate: z.number().min(0).max(0.5).optional(),
    notes: z.string().optional(),
  }),
  resubmit: z.boolean().default(true),
})

const reviseExpenseActions = authService.builders.workItemActions
  // Start action - team member starts revision
  .start(z.never(), reviseExpensePolicy, async ({ mutationCtx, workItem }) => {
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
    reviseExpensePayloadSchema,
    reviseExpensePolicy,
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

      // Get the expense metadata
      const expensePayload = metadata.payload as {
        type: 'reviseExpense'
        taskName: string
        expenseId: Id<'expenses'>
      }
      invariant(
        expensePayload.type === 'reviseExpense',
        'INVALID_WORK_ITEM_TYPE'
      )

      // Get the expense
      const expense = await getExpense(mutationCtx.db, expensePayload.expenseId)
      invariant(expense, 'EXPENSE_NOT_FOUND')

      // Verify expense belongs to this user
      if (expense.userId !== userId) {
        throw new Error('EXPENSE_DOES_NOT_BELONG_TO_USER')
      }

      // Verify expense is in Rejected status
      if (expense.status !== 'Rejected') {
        throw new Error('EXPENSE_MUST_BE_REJECTED_TO_REVISE')
      }

      // Build update object with only provided fields
      const updates: Parameters<typeof updateExpense>[2] = {
        // Clear rejection comments when revising
        rejectionComments: undefined,
      }

      if (payload.revisions.description !== undefined) {
        updates.description = payload.revisions.description
      }
      if (payload.revisions.amount !== undefined) {
        updates.amount = payload.revisions.amount
      }
      if (payload.revisions.date !== undefined) {
        updates.date = payload.revisions.date
      }
      if (payload.revisions.type !== undefined) {
        updates.type = payload.revisions.type
      }
      if (payload.revisions.receiptUrl !== undefined) {
        updates.receiptUrl = payload.revisions.receiptUrl
      }
      if (payload.revisions.vendorInfo !== undefined) {
        updates.vendorInfo = payload.revisions.vendorInfo
      }
      if (payload.revisions.billable !== undefined) {
        updates.billable = payload.revisions.billable
      }
      if (payload.revisions.markupRate !== undefined) {
        updates.markupRate = payload.revisions.markupRate
      }

      // Set status based on resubmit flag
      if (payload.resubmit) {
        updates.status = 'Submitted'
      } else {
        updates.status = 'Draft'
      }

      await updateExpense(mutationCtx.db, expensePayload.expenseId, updates)

      // Update metadata to record completion
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...expensePayload,
          revisedAt: Date.now(),
          resubmitted: payload.resubmit,
        },
      })

      // Note: If resubmit=true, this will trigger another review cycle
      // The workflow will route back to reviewExpense
    }
  )

export const reviseExpenseWorkItem = Builder.workItem('reviseExpense')
  .withActions(reviseExpenseActions.build())

export const reviseExpenseTask = Builder.task(reviseExpenseWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:expenses:edit:own',
        payload: {
          type: 'reviseExpense',
          taskName: 'Revise Expense',
          expenseId: '' as Id<'expenses'>,
        },
      })
    },
  })
