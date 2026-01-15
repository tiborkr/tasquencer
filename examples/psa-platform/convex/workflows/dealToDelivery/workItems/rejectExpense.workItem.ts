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

// Policy: requires expenses:approve scope for rejection
const rejectExpensePolicy = authService.policies.requireScope(
  'dealToDelivery:expenses:approve'
)

// Issue types for rejection
const issueTypeSchema = z.enum([
  'missing_receipt',
  'wrong_category',
  'invalid_amount',
  'missing_vendor_info',
  'not_project_related',
  'duplicate',
  'other',
])

// Schema for the complete action payload
// Reject expense with specific issues
const rejectExpensePayloadSchema = z.object({
  rejectionReason: z.string().min(1, 'Rejection reason is required'),
  issues: z.array(
    z.object({
      type: issueTypeSchema,
      details: z.string(),
    })
  ).min(1, 'At least one issue must be specified'),
})

const rejectExpenseActions = authService.builders.workItemActions
  // Start action - automatic continuation from reviewExpense
  .start(z.never(), rejectExpensePolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    // Claim the work item for this rejecter
    await DealToDeliveryWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      userId
    )
    await workItem.start()
  })
  // Complete action - reject the expense with issues
  .complete(
    rejectExpensePayloadSchema,
    rejectExpensePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const rejecterId = authUser.userId
      invariant(rejecterId, 'USER_DOES_NOT_EXIST')

      // Verify the rejecter has claimed this work item
      const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id
      )
      invariant(metadata, 'WORK_ITEM_METADATA_NOT_FOUND')

      const claimedBy = isHumanClaim(metadata?.claim)
        ? metadata.claim.userId
        : null
      if (!claimedBy || claimedBy !== rejecterId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }

      // Get the expense metadata
      const expensePayload = metadata.payload as {
        type: 'rejectExpense'
        taskName: string
        expenseId: Id<'expenses'>
      }
      invariant(
        expensePayload.type === 'rejectExpense',
        'INVALID_WORK_ITEM_TYPE'
      )

      // Get the expense
      const expense = await getExpense(mutationCtx.db, expensePayload.expenseId)
      invariant(expense, 'EXPENSE_NOT_FOUND')

      // Verify expense is in Submitted status
      if (expense.status !== 'Submitted') {
        throw new Error('EXPENSE_MUST_BE_SUBMITTED_TO_REJECT')
      }

      const rejecterUserId = rejecterId as Id<'users'>

      // Build rejection comments with issue details
      const issueDetails = payload.issues
        .map((issue) => `[${issue.type}] ${issue.details}`)
        .join('\n')
      const rejectionComments = `${payload.rejectionReason}\n\nIssues:\n${issueDetails}`

      // Reject the expense
      await updateExpense(mutationCtx.db, expensePayload.expenseId, {
        status: 'Rejected',
        rejectionComments,
      })

      // Update metadata to record completion
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...expensePayload,
          rejectedBy: rejecterUserId,
          rejectedAt: Date.now(),
          rejectionReason: payload.rejectionReason,
          issues: payload.issues,
        },
      })

      // Note: Team member notification would be handled by a separate notification service
      // that watches for status changes on expenses
    }
  )

export const rejectExpenseWorkItem = Builder.workItem('rejectExpense')
  .withActions(rejectExpenseActions.build())

export const rejectExpenseTask = Builder.task(rejectExpenseWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:expenses:approve',
        payload: {
          type: 'rejectExpense',
          taskName: 'Reject Expense',
          expenseId: '' as Id<'expenses'>,
        },
      })
    },
  })
