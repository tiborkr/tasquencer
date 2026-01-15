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

// Policy: requires expenses:approve scope
const approveExpensePolicy = authService.policies.requireScope(
  'dealToDelivery:expenses:approve'
)

// Schema for the complete action payload
// Finalize approval of reviewed expense
const approveExpensePayloadSchema = z.object({
  approvalNotes: z.string().optional(),
  finalBillable: z.boolean().optional(),
  finalMarkup: z.number().min(0).max(0.5).optional(), // 0-50% markup
})

const approveExpenseActions = authService.builders.workItemActions
  // Start action - automatic continuation from reviewExpense
  .start(z.never(), approveExpensePolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - finalize the approval
  .complete(
    approveExpensePayloadSchema,
    approveExpensePolicy,
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

      // Get the expense metadata
      const expensePayload = metadata.payload as {
        type: 'approveExpense'
        taskName: string
        expenseId: Id<'expenses'>
      }
      invariant(
        expensePayload.type === 'approveExpense',
        'INVALID_WORK_ITEM_TYPE'
      )

      // Get the expense
      const expense = await getExpense(mutationCtx.db, expensePayload.expenseId)
      invariant(expense, 'EXPENSE_NOT_FOUND')

      // Verify expense is in Submitted status
      if (expense.status !== 'Submitted') {
        throw new Error('EXPENSE_MUST_BE_SUBMITTED_TO_APPROVE')
      }

      const approverUserId = approverId as Id<'users'>
      const now = Date.now()

      // Build updates
      const updates: Parameters<typeof updateExpense>[2] = {
        status: 'Approved',
        approvedBy: approverUserId,
        approvedAt: now,
      }

      // Apply final adjustments if provided
      if (payload.finalBillable !== undefined) {
        updates.billable = payload.finalBillable
      }
      if (payload.finalMarkup !== undefined) {
        updates.markupRate = payload.finalMarkup
      }

      // Approve the expense
      await updateExpense(mutationCtx.db, expensePayload.expenseId, updates)

      // Calculate final billed amount
      const finalBillable = payload.finalBillable ?? expense.billable
      const finalMarkup = payload.finalMarkup ?? expense.markupRate ?? 0
      const finalAmount = finalBillable
        ? Math.round(expense.amount * (1 + finalMarkup))
        : expense.amount

      // Update metadata to record completion
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...expensePayload,
          approvedBy: approverUserId,
          approvedAt: now,
          approvalNotes: payload.approvalNotes,
          finalAmount,
        },
      })

      // Note: Team member notification would be handled by a separate notification service
      // that watches for status changes on expenses
    }
  )

export const approveExpenseWorkItem = Builder.workItem('approveExpense')
  .withActions(approveExpenseActions.build())

export const approveExpenseTask = Builder.task(approveExpenseWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:expenses:approve',
        payload: {
          type: 'approveExpense',
          taskName: 'Approve Expense',
          expenseId: '' as Id<'expenses'>,
        },
      })
    },
  })
