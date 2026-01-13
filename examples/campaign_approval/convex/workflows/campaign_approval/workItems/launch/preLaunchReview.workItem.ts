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
 * preLaunchReview work item - Final stakeholder review before launch
 * Required scope: campaign:manage
 *
 * Part of Phase 6 Launch.
 * Reviews all campaign components and identifies any open concerns.
 * XOR routing: readyForApproval -> launchApproval, not ready -> addressConcerns
 */

const preLaunchReviewPolicy = authService.policies.requireScope('campaign:manage')

const preLaunchReviewActions = authService.builders.workItemActions
  .start(z.never(), preLaunchReviewPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      readyForApproval: z.boolean(),
      meetingNotes: z.string().optional(),
      concerns: z
        .array(
          z.object({
            concern: z.string(),
            owner: z.string().optional(),
          }),
        )
        .optional(),
    }),
    preLaunchReviewPolicy,
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

      // Get the campaign to verify it exists
      const campaign = await getCampaignByWorkflowId(
        mutationCtx.db,
        parent.workflow.id,
      )
      invariant(campaign, 'CAMPAIGN_NOT_FOUND')

      // Update work item metadata with review results
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'preLaunchReview' as const,
            taskName: 'Pre-Launch Review',
            checklistComplete: payload.readyForApproval,
          },
        })
      }
    },
  )

export const preLaunchReviewWorkItem = Builder.workItem(
  'preLaunchReview',
).withActions(preLaunchReviewActions.build())

/**
 * preLaunchReview task - Pre-launch stakeholder review with XOR routing
 * Uses XOR join to accept input from either qaTest (passed) or addressConcerns loop
 * Uses XOR split to route to launchApproval (ready) or addressConcerns (not ready)
 */
export const preLaunchReviewTask = Builder.task(preLaunchReviewWorkItem)
  .withJoinType('xor')
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
        scope: 'campaign:manage',
        campaignId: campaign._id,
        payload: {
          type: 'preLaunchReview',
          taskName: 'Pre-Launch Review',
          checklistComplete: undefined,
        },
      })
    },
  })
