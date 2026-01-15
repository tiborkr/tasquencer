import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { getDeal, insertDeal, getUser, updateDeal } from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires deals:create scope
const createDealPolicy = authService.policies.requireScope('dealToDelivery:deals:create')

// Schema for the complete action payload
const createDealPayloadSchema = z.object({
  companyId: z.string(), // Will be cast to Id<"companies">
  contactId: z.string(), // Will be cast to Id<"contacts">
  name: z.string().min(1, 'Deal name is required'),
  value: z.number().min(0, 'Deal value must be non-negative'),
  ownerId: z.string(), // Will be cast to Id<"users">
})

const createDealActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), createDealPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    // Claim the work item for this user
    await DealToDeliveryWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      userId,
    )
    await workItem.start()
  })
  // Complete action - create the deal
  .complete(
    createDealPayloadSchema,
    createDealPolicy,
    async ({ mutationCtx, workItem, parent }, payload) => {
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

      // Get organization from the user's context
      const user = await getUser(mutationCtx.db, userId as Id<'users'>)
      invariant(user, 'USER_NOT_FOUND')
      invariant(user.organizationId, 'USER_NOT_IN_ORGANIZATION')

      // Get the workflow ID to link the deal to the workflow
      const workflowId = parent.workflow.id

      // Create the deal with initial stage and probability
      const dealId = await insertDeal(mutationCtx.db, {
        organizationId: user.organizationId,
        companyId: payload.companyId as Id<'companies'>,
        contactId: payload.contactId as Id<'contacts'>,
        name: payload.name,
        value: payload.value,
        probability: 10, // Initial probability for Lead stage
        stage: 'Lead',
        ownerId: payload.ownerId as Id<'users'>,
        createdAt: Date.now(),
        workflowId, // Link deal to workflow for downstream tasks
      })

      // Get the created deal to verify success
      const deal = await getDeal(mutationCtx.db, dealId)
      invariant(deal, 'DEAL_CREATION_FAILED')

      // Update work item metadata with the dealId now that it exists
      await mutationCtx.db.patch(metadata!._id, {
        aggregateTableId: dealId,
        payload: {
          type: 'createDeal' as const,
          taskName: 'Create Deal',
          dealId,
        },
      })
    },
  )

export const createDealWorkItem = Builder.workItem('createDeal')
  .withActions(createDealActions.build())

export const createDealTask = Builder.task(createDealWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // We don't have a dealId yet - this is the first task that creates it
      // So we initialize with minimal metadata
      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:deals:create',
        payload: {
          type: 'createDeal',
          taskName: 'Create Deal',
        },
      })
    },
  })
