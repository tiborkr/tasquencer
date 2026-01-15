import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { getDeal, getDealByWorkflowId, updateDeal } from '../db'
import { initializeDealToDeliveryWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires deals:qualify scope
const qualifyLeadPolicy = authService.policies.requireScope('dealToDelivery:deals:qualify')

// Schema for the complete action payload (BANT criteria + decision)
const qualifyLeadPayloadSchema = z.object({
  qualified: z.boolean(),
  qualificationNotes: z.string().min(10, 'Qualification notes must be at least 10 characters'),
  budgetConfirmed: z.boolean().optional(),
  authorityConfirmed: z.boolean().optional(),
  needConfirmed: z.boolean().optional(),
  timelineConfirmed: z.boolean().optional(),
})

const qualifyLeadActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), qualifyLeadPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - update deal qualification status
  .complete(
    qualifyLeadPayloadSchema,
    qualifyLeadPolicy,
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

      // Build qualification notes with BANT details
      const bantDetails = []
      if (payload.budgetConfirmed !== undefined) {
        bantDetails.push(`Budget: ${payload.budgetConfirmed ? 'Confirmed' : 'Not confirmed'}`)
      }
      if (payload.authorityConfirmed !== undefined) {
        bantDetails.push(`Authority: ${payload.authorityConfirmed ? 'Confirmed' : 'Not confirmed'}`)
      }
      if (payload.needConfirmed !== undefined) {
        bantDetails.push(`Need: ${payload.needConfirmed ? 'Confirmed' : 'Not confirmed'}`)
      }
      if (payload.timelineConfirmed !== undefined) {
        bantDetails.push(`Timeline: ${payload.timelineConfirmed ? 'Confirmed' : 'Not confirmed'}`)
      }

      const fullNotes = bantDetails.length > 0
        ? `${payload.qualificationNotes}\n\nBANT Assessment:\n${bantDetails.join('\n')}`
        : payload.qualificationNotes

      // Update deal based on qualification decision
      if (payload.qualified) {
        await updateDeal(mutationCtx.db, dealId, {
          stage: 'Qualified',
          probability: 25, // Per spec: 25% if qualified
          qualificationNotes: fullNotes,
        })
      } else {
        await updateDeal(mutationCtx.db, dealId, {
          stage: 'Disqualified',
          probability: 0, // Per spec: 0% if not qualified
          qualificationNotes: fullNotes,
        })
      }

      // XOR routing decision will check deal.stage to determine next task
    },
  )

export const qualifyLeadWorkItem = Builder.workItem('qualifyLead')
  .withActions(qualifyLeadActions.build())

export const qualifyLeadTask = Builder.task(qualifyLeadWorkItem)
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
          type: 'qualifyLead',
          taskName: 'Qualify Lead',
          dealId: deal._id,
        },
      })
    },
  })
