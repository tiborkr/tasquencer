import { Builder } from '../../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../../authorization'
import { getCampaignByWorkflowId } from '../../db'
import { initializeCampaignWorkItemAuth } from '../authHelpers'
import { CampaignWorkItemHelpers } from '../../helpers'
import { authComponent } from '../../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'

/**
 * internalReview work item - Manager/creative lead reviews creative assets
 * Required scope: campaign:creative_review
 *
 * Reviews for strategy alignment and brand consistency.
 * Decision determines routing:
 * - approved -> legalReview
 * - needs_revision -> reviseAssets (loop)
 */

const internalReviewPolicy = authService.policies.requireScope(
  'campaign:creative_review',
)

const internalReviewActions = authService.builders.workItemActions
  .start(z.never(), internalReviewPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      decision: z.enum(['approved', 'needs_revision']),
      feedback: z.array(
        z.object({
          creativeId: z.string(), // Id<"campaignCreatives">
          notes: z.string(),
          approved: z.boolean(),
        }),
      ).optional(),
      reviewNotes: z.string().optional(),
    }),
    internalReviewPolicy,
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

      // Get the campaign
      const campaign = await getCampaignByWorkflowId(
        mutationCtx.db,
        parent.workflow.id,
      )
      invariant(campaign, 'CAMPAIGN_NOT_FOUND')

      // Update work item metadata with decision
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'internalReview' as const,
            taskName: 'Internal Creative Review',
            decision: payload.decision,
            reviewNotes: payload.reviewNotes,
          },
        })
      }
    },
  )

export const internalReviewWorkItem = Builder.workItem(
  'internalReview',
).withActions(internalReviewActions.build())

/**
 * internalReview task with XOR split for routing based on decision
 * Routes to: legalReview (approved) or reviseAssets (needs_revision)
 *
 * Uses XOR join to handle both initial entry and revision loops.
 */
export const internalReviewTask = Builder.task(internalReviewWorkItem)
  .withSplitType('xor')
  .withJoinType('xor')
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      const campaign = await getCampaignByWorkflowId(
        mutationCtx.db,
        parent.workflow.id,
      )
      invariant(campaign, 'CAMPAIGN_NOT_FOUND')

      const workItemId = await workItem.initialize()

      await initializeCampaignWorkItemAuth(mutationCtx, workItemId, {
        scope: 'campaign:creative_review',
        campaignId: campaign._id,
        payload: {
          type: 'internalReview',
          taskName: 'Internal Creative Review',
          decision: undefined,
          reviewNotes: undefined,
        },
      })
    },
  })
