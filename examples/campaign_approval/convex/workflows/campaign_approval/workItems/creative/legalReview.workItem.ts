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
 * legalReview work item - Legal reviewer checks regulatory compliance
 * Required scope: campaign:legal_review
 *
 * Checks for compliance, disclaimers, trademark usage.
 * Decision determines routing:
 * - approved -> finalApproval
 * - needs_changes -> legalRevise (loop)
 * - rejected (rare) -> end
 */

const legalReviewPolicy = authService.policies.requireScope(
  'campaign:legal_review',
)

const legalReviewActions = authService.builders.workItemActions
  .start(z.never(), legalReviewPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      decision: z.enum(['approved', 'needs_changes']),
      complianceNotes: z.string().min(1, 'Compliance notes are required'),
      requiredChanges: z.array(
        z.object({
          creativeId: z.string(), // Id<"campaignCreatives">
          issue: z.string(),
          requiredFix: z.string(),
        }),
      ).optional(),
    }),
    legalReviewPolicy,
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
            type: 'legalReview' as const,
            taskName: 'Legal Compliance Review',
            decision: payload.decision,
            legalNotes: payload.complianceNotes,
          },
        })
      }
    },
  )

export const legalReviewWorkItem = Builder.workItem('legalReview').withActions(
  legalReviewActions.build(),
)

/**
 * legalReview task with XOR split for routing based on decision
 * Routes to: finalApproval (approved) or legalRevise (needs_changes)
 *
 * Uses XOR join to handle both initial entry and revision loops.
 */
export const legalReviewTask = Builder.task(legalReviewWorkItem)
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
        scope: 'campaign:legal_review',
        campaignId: campaign._id,
        payload: {
          type: 'legalReview',
          taskName: 'Legal Compliance Review',
          decision: undefined,
          legalNotes: undefined,
        },
      })
    },
  })
