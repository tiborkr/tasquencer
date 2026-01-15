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

// Policy: requires expenses:create scope (same scope for expense operations)
const attachReceiptPolicy = authService.policies.requireScope('dealToDelivery:expenses:create')

// Schema for attaching a receipt to an expense
const attachReceiptPayloadSchema = z.object({
  expenseId: z.string(),
  receiptUrl: z.string().url('Receipt URL must be a valid URL'),
})

const attachReceiptActions = authService.builders.workItemActions
  .start(z.never(), attachReceiptPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await DealToDeliveryWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      userId,
    )
    await workItem.start()
  })
  .complete(
    attachReceiptPayloadSchema,
    attachReceiptPolicy,
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

      // Get the expense and verify ownership
      const expense = await getExpense(mutationCtx.db, payload.expenseId as Id<'expenses'>)
      invariant(expense, 'EXPENSE_NOT_FOUND')

      if (expense.userId !== userId) {
        throw new Error('EXPENSE_DOES_NOT_BELONG_TO_USER')
      }

      if (expense.status !== 'Draft') {
        throw new Error('EXPENSE_MUST_BE_DRAFT_TO_ATTACH_RECEIPT')
      }

      // Update the expense with the receipt URL
      await updateExpense(mutationCtx.db, payload.expenseId as Id<'expenses'>, {
        receiptUrl: payload.receiptUrl,
      })

      // Update metadata
      await mutationCtx.db.patch(metadata!._id, {
        payload: {
          type: 'attachReceipt' as const,
          taskName: 'Attach Receipt',
          expenseId: payload.expenseId as Id<'expenses'>,
        },
      })
    },
  )

export const attachReceiptWorkItem = Builder.workItem('attachReceipt')
  .withActions(attachReceiptActions.build())

export const attachReceiptTask = Builder.task(attachReceiptWorkItem)
  .withJoinType('xor') // XOR join for multiple expense type paths
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:expenses:create',
        payload: {
          type: 'attachReceipt',
          taskName: 'Attach Receipt',
          expenseId: '' as Id<'expenses'>, // Will be set when completing
        },
      })
    },
  })
