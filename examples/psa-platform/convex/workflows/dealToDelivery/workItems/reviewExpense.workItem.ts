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
const reviewExpensePolicy = authService.policies.requireScope(
  'dealToDelivery:expenses:approve'
)

// Receipt threshold - amounts above this require receipt
const RECEIPT_THRESHOLD_CENTS = 2500 // $25.00

// Schema for the complete action payload
// Manager reviews submitted expense and decides to approve or reject
const reviewExpensePayloadSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  comments: z.string().optional(),
  // Optional adjustments the manager can make
  adjustments: z.object({
    billable: z.boolean().optional(),
    markupRate: z.number().min(0).max(0.5).optional(), // 0-50% markup
    category: z.string().optional(),
  }).optional(),
})

const reviewExpenseActions = authService.builders.workItemActions
  // Start action - manager claims the work item to review
  .start(z.never(), reviewExpensePolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    // Claim the work item for this reviewer
    await DealToDeliveryWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      userId
    )
    await workItem.start()
  })
  // Complete action - manager submits their review decision
  .complete(
    reviewExpensePayloadSchema,
    reviewExpensePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const reviewerId = authUser.userId
      invariant(reviewerId, 'USER_DOES_NOT_EXIST')

      // Verify the reviewer has claimed this work item
      const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id
      )
      invariant(metadata, 'WORK_ITEM_METADATA_NOT_FOUND')

      const claimedBy = isHumanClaim(metadata?.claim)
        ? metadata.claim.userId
        : null
      if (!claimedBy || claimedBy !== reviewerId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }

      // Get the expense metadata
      const expensePayload = metadata.payload as {
        type: 'reviewExpense'
        taskName: string
        expenseId: Id<'expenses'>
      }
      invariant(
        expensePayload.type === 'reviewExpense',
        'INVALID_WORK_ITEM_TYPE'
      )

      // Get the expense
      const expense = await getExpense(mutationCtx.db, expensePayload.expenseId)
      invariant(expense, 'EXPENSE_NOT_FOUND')

      // Verify expense is in Submitted status
      if (expense.status !== 'Submitted') {
        throw new Error('EXPENSE_MUST_BE_SUBMITTED_TO_REVIEW')
      }

      // Cannot approve own expense (except system can bypass via internal mutation)
      if (expense.userId === reviewerId) {
        throw new Error('CANNOT_APPROVE_OWN_EXPENSE')
      }

      // Verify receipt if required (amount > $25)
      if (expense.amount > RECEIPT_THRESHOLD_CENTS && !expense.receiptUrl) {
        if (payload.decision === 'approve') {
          throw new Error('RECEIPT_REQUIRED_FOR_EXPENSES_OVER_25')
        }
      }

      // Apply any adjustments the manager made
      if (payload.adjustments) {
        const updates: Parameters<typeof updateExpense>[2] = {}

        if (payload.adjustments.billable !== undefined) {
          updates.billable = payload.adjustments.billable
        }
        if (payload.adjustments.markupRate !== undefined) {
          updates.markupRate = payload.adjustments.markupRate
        }
        if (payload.adjustments.category !== undefined) {
          // Validate category is valid expense type
          const validTypes = ['Software', 'Travel', 'Materials', 'Subcontractor', 'Other']
          if (validTypes.includes(payload.adjustments.category)) {
            updates.type = payload.adjustments.category as typeof expense.type
          }
        }

        if (Object.keys(updates).length > 0) {
          await updateExpense(mutationCtx.db, expensePayload.expenseId, updates)
        }
      }

      const reviewerUserId = reviewerId as Id<'users'>

      // Store the decision in metadata for routing
      // The XOR routing will use this to determine next task
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...expensePayload,
          decision: payload.decision,
          reviewComments: payload.comments,
          reviewedBy: reviewerUserId,
          reviewedAt: Date.now(),
        },
      })

      // Note: Actual approval/rejection happens in approveExpense or rejectExpense tasks
      // This task just records the decision for workflow routing
    }
  )

export const reviewExpenseWorkItem = Builder.workItem('reviewExpense')
  .withActions(reviewExpenseActions.build())

export const reviewExpenseTask = Builder.task(reviewExpenseWorkItem)
  .withJoinType('xor') // XOR join for revision loop
  .withSplitType('xor') // XOR split for approve/reject paths
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:expenses:approve',
        payload: {
          type: 'reviewExpense',
          taskName: 'Review Expense',
          // This will be set by the triggering workflow
          expenseId: '' as Id<'expenses'>,
        },
      })
    },
  })
