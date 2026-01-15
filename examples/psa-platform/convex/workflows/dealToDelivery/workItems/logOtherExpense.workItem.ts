import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { insertExpense, getProject } from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires expenses:create scope
const logOtherExpensePolicy = authService.policies.requireScope('dealToDelivery:expenses:create')

// Schema for logging a miscellaneous expense
const logOtherExpensePayloadSchema = z.object({
  projectId: z.string(),
  description: z.string().min(1, 'Description is required'),
  amount: z.number().positive('Amount must be positive'), // Amount in cents
  currency: z.string().default('USD'),
  date: z.number(), // Unix timestamp
  vendorName: z.string().optional(),
})

const logOtherExpenseActions = authService.builders.workItemActions
  .start(z.never(), logOtherExpensePolicy, async ({ mutationCtx, workItem }) => {
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
    logOtherExpensePayloadSchema,
    logOtherExpensePolicy,
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

      // Get the project to retrieve organizationId
      const project = await getProject(mutationCtx.db, payload.projectId as Id<'projects'>)
      invariant(project, 'PROJECT_NOT_FOUND')

      // Create the expense record
      await insertExpense(mutationCtx.db, {
        organizationId: project.organizationId,
        userId: userId as Id<'users'>,
        projectId: payload.projectId as Id<'projects'>,
        type: 'Other',
        amount: payload.amount,
        currency: payload.currency,
        billable: false, // Will be set in markBillable task
        status: 'Draft',
        date: payload.date,
        description: payload.description,
        vendorInfo: payload.vendorName ? { name: payload.vendorName } : undefined,
        createdAt: Date.now(),
      })

      // Update metadata with the created expense
      await mutationCtx.db.patch(metadata!._id, {
        payload: {
          type: 'logOtherExpense' as const,
          taskName: 'Log Other Expense',
          userId: userId as Id<'users'>,
          projectId: payload.projectId as Id<'projects'>,
        },
      })
    },
  )

export const logOtherExpenseWorkItem = Builder.workItem('logOtherExpense')
  .withActions(logOtherExpenseActions.build())

export const logOtherExpenseTask = Builder.task(logOtherExpenseWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:expenses:create',
        payload: {
          type: 'logOtherExpense',
          taskName: 'Log Other Expense',
          userId: userId as Id<'users'>,
          projectId: '' as Id<'projects'>,
        },
      })
    },
  })
