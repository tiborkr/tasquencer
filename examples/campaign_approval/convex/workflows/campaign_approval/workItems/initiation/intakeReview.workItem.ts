import { Builder } from '../../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../../authorization'
import { getCampaignByWorkflowId, updateCampaign } from '../../db'
import { initializeCampaignWorkItemAuth } from '../authHelpers'
import { CampaignWorkItemHelpers } from '../../helpers'
import { authComponent } from '../../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'

/**
 * intakeReview work item - Marketing coordinator reviews campaign request
 * Required scope: campaign_intake
 *
 * The coordinator can approve, reject, or request changes to the campaign request.
 * This decision determines the next step in the workflow:
 * - approved -> assignOwner
 * - rejected -> end
 * - needs_changes -> loop back to submitRequest
 */

const intakeReviewPolicy = authService.policies.requireScope('campaign:intake')

// Store the decision for routing
let lastDecision: 'approved' | 'rejected' | 'needs_changes' | null = null

const intakeReviewActions = authService.builders.workItemActions
  .start(z.never(), intakeReviewPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      decision: z.enum(['approved', 'rejected', 'needs_changes']),
      reviewNotes: z.string().optional(),
    }),
    intakeReviewPolicy,
    async ({ mutationCtx, workItem, parent }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      // Verify the user has claimed this work item
      const metadata = await CampaignWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id,
      )
      const claimedBy = isHumanClaim(metadata?.claim)
        ? metadata.claim.userId
        : null
      if (!claimedBy || claimedBy !== userId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }

      // Get the campaign and update based on decision
      const campaign = await getCampaignByWorkflowId(
        mutationCtx.db,
        parent.workflow.id,
      )
      invariant(campaign, 'CAMPAIGN_NOT_FOUND')

      // Store decision for routing
      lastDecision = payload.decision

      // Update campaign status based on decision
      if (payload.decision === 'approved') {
        // Status will be updated when owner is assigned
      } else if (payload.decision === 'rejected') {
        await updateCampaign(mutationCtx.db, campaign._id, {
          status: 'cancelled',
        })
      } else if (payload.decision === 'needs_changes') {
        await updateCampaign(mutationCtx.db, campaign._id, {
          status: 'draft',
        })
      }

      // Update work item metadata with decision
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'intakeReview' as const,
            taskName: 'Intake Review',
            decision: payload.decision,
            reviewNotes: payload.reviewNotes,
          },
        })
      }
    },
  )

export const intakeReviewWorkItem = Builder.workItem(
  'intakeReview',
).withActions(intakeReviewActions.build())

/**
 * intakeReview task with XOR split type for routing based on decision.
 * Routes to: assignOwner (approved), submitRequest (needs_changes), or end (rejected)
 */
export const intakeReviewTask = Builder.task(intakeReviewWorkItem)
  .withSplitType('xor')
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      const campaign = await getCampaignByWorkflowId(
        mutationCtx.db,
        parent.workflow.id,
      )
      invariant(campaign, 'CAMPAIGN_NOT_FOUND')

      const workItemId = await workItem.initialize()

      await initializeCampaignWorkItemAuth(mutationCtx, workItemId, {
        scope: 'campaign:intake',
        campaignId: campaign._id,
        payload: {
          type: 'intakeReview',
          taskName: 'Intake Review',
          decision: undefined,
          reviewNotes: undefined,
        },
      })
    },
  })

/**
 * Routing helper - checks the intake review decision
 * Used by workflow conditions to determine the next task
 */
export function getIntakeDecision(): 'approved' | 'rejected' | 'needs_changes' | null {
  return lastDecision
}
