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

// Policy: requires expenses:create scope
const markBillablePolicy = authService.policies.requireScope('dealToDelivery:expenses:create')

// Schema for marking an expense as billable or non-billable
const markBillablePayloadSchema = z.object({
  expenseId: z.string(),
  billable: z.boolean(),
})

const markBillableActions = authService.builders.workItemActions
  .start(z.never(), markBillablePolicy, async ({ mutationCtx, workItem }) => {
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
    markBillablePayloadSchema,
    markBillablePolicy,
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
        throw new Error('EXPENSE_MUST_BE_DRAFT_TO_MARK_BILLABLE')
      }

      // Update the expense billable flag
      await updateExpense(mutationCtx.db, payload.expenseId as Id<'expenses'>, {
        billable: payload.billable,
      })

      // Update metadata with the billable decision for routing
      await mutationCtx.db.patch(metadata!._id, {
        payload: {
          type: 'markBillable' as const,
          taskName: 'Mark Billable',
          expenseId: payload.expenseId as Id<'expenses'>,
          billable: payload.billable, // Store the billable flag for routing
        },
      })
    },
  )

export const markBillableWorkItem = Builder.workItem('markBillable')
  .withActions(markBillableActions.build())

export const markBillableTask = Builder.task(markBillableWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:expenses:create',
        payload: {
          type: 'markBillable',
          taskName: 'Mark Billable',
          expenseId: '' as Id<'expenses'>, // Will be set when completing
        },
      })
    },
  })
