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
const setBillableRatePolicy = authService.policies.requireScope('dealToDelivery:expenses:create')

// Schema for setting the billable rate (markup) on an expense
const setBillableRatePayloadSchema = z.object({
  expenseId: z.string(),
  markupRate: z.number().min(0, 'Markup rate cannot be negative'), // 1.0 = no markup, 1.15 = 15% markup
})

const setBillableRateActions = authService.builders.workItemActions
  .start(z.never(), setBillableRatePolicy, async ({ mutationCtx, workItem }) => {
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
    setBillableRatePayloadSchema,
    setBillableRatePolicy,
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
        throw new Error('EXPENSE_MUST_BE_DRAFT_TO_SET_RATE')
      }

      if (!expense.billable) {
        throw new Error('EXPENSE_MUST_BE_BILLABLE_TO_SET_RATE')
      }

      // Update the expense with the markup rate
      await updateExpense(mutationCtx.db, payload.expenseId as Id<'expenses'>, {
        markupRate: payload.markupRate,
      })

      // Update metadata
      await mutationCtx.db.patch(metadata!._id, {
        payload: {
          type: 'setBillableRate' as const,
          taskName: 'Set Billable Rate',
          expenseId: payload.expenseId as Id<'expenses'>,
        },
      })
    },
  )

export const setBillableRateWorkItem = Builder.workItem('setBillableRate')
  .withActions(setBillableRateActions.build())

export const setBillableRateTask = Builder.task(setBillableRateWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:expenses:create',
        payload: {
          type: 'setBillableRate',
          taskName: 'Set Billable Rate',
          expenseId: '' as Id<'expenses'>, // Will be set when completing
        },
      })
    },
  })
