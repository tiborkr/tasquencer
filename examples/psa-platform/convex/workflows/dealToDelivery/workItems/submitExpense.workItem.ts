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

// Policy: requires expenses:submit scope
const submitExpensePolicy = authService.policies.requireScope('dealToDelivery:expenses:submit')

// Schema for submitting an expense for approval
const submitExpensePayloadSchema = z.object({
  expenseId: z.string(),
})

const submitExpenseActions = authService.builders.workItemActions
  .start(z.never(), submitExpensePolicy, async ({ mutationCtx, workItem }) => {
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
    submitExpensePayloadSchema,
    submitExpensePolicy,
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
        throw new Error('EXPENSE_MUST_BE_DRAFT_TO_SUBMIT')
      }

      // Update the expense status to Submitted
      await updateExpense(mutationCtx.db, payload.expenseId as Id<'expenses'>, {
        status: 'Submitted',
      })

      // Update metadata
      await mutationCtx.db.patch(metadata!._id, {
        payload: {
          type: 'submitExpense' as const,
          taskName: 'Submit Expense',
          expenseId: payload.expenseId as Id<'expenses'>,
        },
      })

      // Note: Manager notification would be handled by a separate notification service
      // that watches for status changes on expenses
    },
  )

export const submitExpenseWorkItem = Builder.workItem('submitExpense')
  .withActions(submitExpenseActions.build())

export const submitExpenseTask = Builder.task(submitExpenseWorkItem)
  .withJoinType('xor') // XOR join for paths from setBillableRate or markBillable
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:expenses:submit',
        payload: {
          type: 'submitExpense',
          taskName: 'Submit Expense',
          expenseId: '' as Id<'expenses'>, // Will be set when completing
        },
      })
    },
  })
