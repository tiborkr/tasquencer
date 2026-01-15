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
  getEstimate,
  insertProposal,
} from '../db'
import { initializeDealToDeliveryWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'

// Policy: requires proposals:create scope
const createProposalPolicy = authService.policies.requireScope('dealToDelivery:proposals:create')

// Schema for the complete action payload
const createProposalPayloadSchema = z.object({
  includeTerms: z.boolean(),
  customIntro: z.string().optional(),
  validUntil: z.number().optional(), // Timestamp
})

const createProposalActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), createProposalPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - create proposal from estimate
  .complete(
    createProposalPayloadSchema,
    createProposalPolicy,
    async ({ mutationCtx, workItem }, _payload) => {
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
      invariant(deal.estimateId, 'DEAL_HAS_NO_ESTIMATE')

      // Get estimate to verify it exists
      const estimate = await getEstimate(mutationCtx.db, deal.estimateId)
      invariant(estimate, 'ESTIMATE_NOT_FOUND')

      // Generate a placeholder document URL (in real system, would generate PDF)
      const documentUrl = `https://docs.example.com/proposals/${dealId}/v1`

      // Create the proposal with Draft status
      await insertProposal(mutationCtx.db, {
        organizationId: deal.organizationId,
        dealId: dealId,
        version: 1,
        status: 'Draft',
        documentUrl,
        createdAt: Date.now(),
      })

      // Update deal stage and probability
      await updateDeal(mutationCtx.db, dealId, {
        stage: 'Proposal',
        probability: 50, // Per spec: 50% at Proposal stage
      })
    },
  )

export const createProposalWorkItem = Builder.workItem('createProposal')
  .withActions(createProposalActions.build())

export const createProposalTask = Builder.task(createProposalWorkItem)
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
        scope: 'dealToDelivery:proposals:create',
        dealId: deal._id,
        payload: {
          type: 'createProposal',
          taskName: 'Create Proposal',
          dealId: deal._id,
        },
      })
    },
  })
