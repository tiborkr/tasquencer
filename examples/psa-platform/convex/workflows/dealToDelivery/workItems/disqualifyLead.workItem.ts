import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { getDeal, getDealByWorkflowId, updateDeal } from '../db'
import { initializeDealToDeliveryWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'

// Policy: requires deals:qualify scope (same as qualifyLead - disqualification is part of qualification process)
const disqualifyLeadPolicy = authService.policies.requireScope('dealToDelivery:deals:qualify')

// Schema for the complete action payload
const disqualifyLeadPayloadSchema = z.object({
  reason: z.string().min(10, 'Disqualification reason must be at least 10 characters'),
})

const disqualifyLeadActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), disqualifyLeadPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - record disqualification reason
  .complete(
    disqualifyLeadPayloadSchema,
    disqualifyLeadPolicy,
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

      // Update deal with disqualification reason
      // Stage should already be 'Disqualified' from qualifyLead
      await updateDeal(mutationCtx.db, dealId, {
        lostReason: payload.reason,
      })

      // Workflow will proceed to archiveDeal
    },
  )

export const disqualifyLeadWorkItem = Builder.workItem('disqualifyLead')
  .withActions(disqualifyLeadActions.build())

export const disqualifyLeadTask = Builder.task(disqualifyLeadWorkItem)
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
        scope: 'dealToDelivery:deals:qualify',
        dealId: deal._id,
        payload: {
          type: 'disqualifyLead',
          taskName: 'Disqualify Lead',
          dealId: deal._id,
        },
      })
    },
  })
