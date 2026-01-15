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
  insertProposal,
  getEstimate,
  updateEstimate,
  listEstimateServicesByEstimate,
  deleteEstimateService,
  insertEstimateService,
} from '../db'
import { initializeDealToDeliveryWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'

// Policy: requires proposals:create scope (creating a revised proposal)
const reviseProposalPolicy = authService.policies.requireScope('dealToDelivery:proposals:create')

// Schema for revised services
const revisedServiceSchema = z.object({
  name: z.string().min(1),
  rate: z.number().int().min(0), // cents per hour
  hours: z.number().min(0.25),
})

// Schema for the complete action payload
const reviseProposalPayloadSchema = z.object({
  revisedServices: z.array(revisedServiceSchema).min(1, 'At least one service is required'),
  revisionNotes: z.string().min(10, 'Revision notes must be at least 10 characters'),
})

const reviseProposalActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), reviseProposalPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - create revised proposal
  .complete(
    reviseProposalPayloadSchema,
    reviseProposalPolicy,
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

      // Verify work item type for type safety
      invariant(metadata.payload.type === 'reviseProposal', 'INVALID_WORK_ITEM_TYPE')

      // Get the deal from metadata
      const dealId = metadata.aggregateTableId
      invariant(dealId, 'DEAL_ID_NOT_FOUND')

      const deal = await getDeal(mutationCtx.db, dealId)
      invariant(deal, 'DEAL_NOT_FOUND')
      invariant(deal.estimateId, 'DEAL_HAS_NO_ESTIMATE')

      // Get the latest proposal to determine version number
      const latestProposal = await getLatestProposalByDeal(mutationCtx.db, dealId)
      invariant(latestProposal, 'PROPOSAL_NOT_FOUND')

      const newVersion = latestProposal.version + 1

      // Calculate new total from revised services
      const newTotal = payload.revisedServices.reduce((sum, service) => {
        return sum + (service.rate * service.hours)
      }, 0)

      // Update estimate with new services
      const estimate = await getEstimate(mutationCtx.db, deal.estimateId)
      invariant(estimate, 'ESTIMATE_NOT_FOUND')

      // Delete existing estimate services
      const existingServices = await listEstimateServicesByEstimate(mutationCtx.db, deal.estimateId)
      for (const service of existingServices) {
        await deleteEstimateService(mutationCtx.db, service._id)
      }

      // Create new estimate services
      for (const service of payload.revisedServices) {
        const serviceTotal = service.rate * service.hours
        await insertEstimateService(mutationCtx.db, {
          estimateId: deal.estimateId,
          name: service.name,
          rate: service.rate,
          hours: service.hours,
          total: serviceTotal,
        })
      }

      // Update estimate total
      await updateEstimate(mutationCtx.db, deal.estimateId, {
        total: newTotal,
      })

      // Generate a new document URL for the revised proposal
      const documentUrl = `https://docs.example.com/proposals/${dealId}/v${newVersion}`

      // Create new proposal version
      await insertProposal(mutationCtx.db, {
        organizationId: deal.organizationId,
        dealId: dealId,
        version: newVersion,
        status: 'Draft',
        documentUrl,
        createdAt: Date.now(),
      })

      // Update deal value
      await updateDeal(mutationCtx.db, dealId, {
        value: newTotal,
      })

      // Workflow loops back to sendProposal for the revised proposal
    },
  )

export const reviseProposalWorkItem = Builder.workItem('reviseProposal')
  .withActions(reviseProposalActions.build())

export const reviseProposalTask = Builder.task(reviseProposalWorkItem)
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
        scope: 'dealToDelivery:proposals:create',
        dealId: deal._id,
        payload: {
          type: 'reviseProposal',
          taskName: 'Revise Proposal',
          proposalId: proposal._id,
        },
      })
    },
  })
