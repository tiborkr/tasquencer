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
  getLatestProposalByDeal,
  updateProposal,
} from '../db'
import { initializeDealToDeliveryWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'

// Policy: requires proposals:sign scope (per spec)
const getProposalSignedPolicy = authService.policies.requireScope('dealToDelivery:proposals:sign')

// Schema for the complete action payload
const getProposalSignedPayloadSchema = z.object({
  signed: z.boolean(),
  signedBy: z.string().min(1).optional(), // Signer name
  signatureDate: z.number().optional(), // Timestamp
  rejectionReason: z.string().optional(),
})

const getProposalSignedActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), getProposalSignedPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - record signature or rejection
  .complete(
    getProposalSignedPayloadSchema,
    getProposalSignedPolicy,
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

      // Get proposalId from payload
      invariant(metadata.payload.type === 'getProposalSigned', 'INVALID_WORK_ITEM_TYPE')
      const proposalId = metadata.payload.proposalId

      // Get the deal from metadata
      const dealId = metadata.aggregateTableId
      invariant(dealId, 'DEAL_ID_NOT_FOUND')

      const deal = await getDeal(mutationCtx.db, dealId)
      invariant(deal, 'DEAL_NOT_FOUND')

      if (payload.signed) {
        // Update proposal status to Signed
        await updateProposal(mutationCtx.db, proposalId, {
          status: 'Signed',
          signedAt: payload.signatureDate ?? Date.now(),
        })

        // Update deal to Won
        await updateDeal(mutationCtx.db, dealId, {
          stage: 'Won',
          probability: 100,
          closedAt: Date.now(),
        })
      } else {
        // Update proposal status to Rejected
        await updateProposal(mutationCtx.db, proposalId, {
          status: 'Rejected',
          rejectedAt: Date.now(),
        })

        // Update deal to Lost
        await updateDeal(mutationCtx.db, dealId, {
          stage: 'Lost',
          probability: 0,
          lostReason: payload.rejectionReason ?? 'Client rejected proposal',
        })
      }

      // XOR routing decision will check deal.stage (Won/Lost) to determine next task
    },
  )

export const getProposalSignedWorkItem = Builder.workItem('getProposalSigned')
  .withActions(getProposalSignedActions.build())

export const getProposalSignedTask = Builder.task(getProposalSignedWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Find the deal linked to this workflow
      const workflowId = parent.workflow.id
      const deal = await getDealByWorkflowId(mutationCtx.db, workflowId)
      invariant(deal, 'DEAL_NOT_FOUND_FOR_WORKFLOW')

      // Get the latest proposal for this deal
      const proposal = await getLatestProposalByDeal(mutationCtx.db, deal._id)
      invariant(proposal, 'PROPOSAL_NOT_FOUND_FOR_DEAL')

      // Initialize work item with the proposalId
      await initializeDealToDeliveryWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:proposals:sign',
        dealId: deal._id,
        payload: {
          type: 'getProposalSigned',
          taskName: 'Get Proposal Signed',
          proposalId: proposal._id,
        },
      })
    },
  })
