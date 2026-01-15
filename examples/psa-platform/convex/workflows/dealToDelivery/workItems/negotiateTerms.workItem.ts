import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getDeal,
  getDealByWorkflowId,
  updateDeal,
} from '../db'
import { initializeDealToDeliveryWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'

// Policy: requires deals:edit:own scope (per spec)
const negotiateTermsPolicy = authService.policies.requireScope('dealToDelivery:deals:edit:own')

// Schema for requested changes
const requestedChangeSchema = z.object({
  serviceName: z.string().min(1),
  changeType: z.enum(['rate', 'hours', 'scope']),
  details: z.string().min(1),
})

// Schema for the complete action payload
const negotiateTermsPayloadSchema = z.object({
  outcome: z.enum(['accepted', 'revision', 'lost']),
  feedback: z.string().min(10, 'Feedback must be at least 10 characters'),
  requestedChanges: z.array(requestedChangeSchema).optional(),
})

const negotiateTermsActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), negotiateTermsPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - record negotiation outcome
  .complete(
    negotiateTermsPayloadSchema,
    negotiateTermsPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      // Verify the user has claimed this work item
      const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id,
      )
      invariant(metadata, 'WORK_ITEM_METADATA_NOT_FOUND')

      const claimedBy = isHumanClaim(metadata.claim)
        ? metadata.claim.userId
        : null
      if (!claimedBy || claimedBy !== userId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }

      // Get the deal from metadata
      const dealId = metadata.aggregateTableId
      invariant(dealId, 'DEAL_ID_NOT_FOUND')

      const deal = await getDeal(mutationCtx.db, dealId)
      invariant(deal, 'DEAL_NOT_FOUND')

      // Update deal based on outcome
      const updates: Parameters<typeof updateDeal>[2] = {
        stage: 'Negotiation',
      }

      if (payload.outcome === 'lost') {
        updates.lostReason = payload.feedback
        updates.probability = 0
      } else if (payload.outcome === 'accepted') {
        updates.probability = 75 // Increase probability on acceptance
      }
      // For revision, keep current probability

      await updateDeal(mutationCtx.db, dealId, updates)

      // XOR routing decision will check deal state to determine next task
    },
  )

export const negotiateTermsWorkItem = Builder.workItem('negotiateTerms')
  .withActions(negotiateTermsActions.build())

export const negotiateTermsTask = Builder.task(negotiateTermsWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Find the deal linked to this workflow
      const workflowId = parent.workflow.id
      const deal = await getDealByWorkflowId(mutationCtx.db, workflowId)
      invariant(deal, 'DEAL_NOT_FOUND_FOR_WORKFLOW')

      // Initialize work item with the dealId
      await initializeDealToDeliveryWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:deals:edit:own',
        dealId: deal._id,
        payload: {
          type: 'negotiateTerms',
          taskName: 'Negotiate Terms',
          dealId: deal._id,
        },
      })
    },
  })
