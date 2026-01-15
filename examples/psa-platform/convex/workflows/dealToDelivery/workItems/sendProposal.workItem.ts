import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getDealByWorkflowId,
  getLatestProposalByDeal,
  updateProposal,
} from '../db'
import { initializeDealToDeliveryWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'

// Policy: requires proposals:send scope
const sendProposalPolicy = authService.policies.requireScope('dealToDelivery:proposals:send')

// Schema for the complete action payload
const sendProposalPayloadSchema = z.object({
  recipientEmail: z.string().email('Valid email required'),
  recipientName: z.string().min(1, 'Recipient name is required'),
  personalMessage: z.string().optional(),
})

const sendProposalActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), sendProposalPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - send proposal to client
  .complete(
    sendProposalPayloadSchema,
    sendProposalPolicy,
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

      // Get proposalId from payload - this work item operates on proposals
      invariant(metadata.payload.type === 'sendProposal', 'INVALID_WORK_ITEM_TYPE')
      const proposalId = metadata.payload.proposalId

      // Update proposal status to Sent
      await updateProposal(mutationCtx.db, proposalId, {
        status: 'Sent',
        sentAt: Date.now(),
      })

      // In a real system, this would trigger an email to be sent
      // For now, we just update the status
    },
  )

export const sendProposalWorkItem = Builder.workItem('sendProposal')
  .withActions(sendProposalActions.build())

export const sendProposalTask = Builder.task(sendProposalWorkItem)
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
        scope: 'dealToDelivery:proposals:send',
        dealId: deal._id,
        payload: {
          type: 'sendProposal',
          taskName: 'Send Proposal',
          proposalId: proposal._id,
        },
      })
    },
  })
