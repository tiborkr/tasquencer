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
 * addressConcerns work item - Resolve open concerns from pre-launch review
 * Required scope: campaign:manage
 *
 * Part of Phase 6 Launch.
 * Address and resolve any concerns identified during pre-launch review.
 * After completion, loops back to preLaunchReview.
 */

const addressConcernsPolicy = authService.policies.requireScope('campaign:manage')

const addressConcernsActions = authService.builders.workItemActions
  .start(
    z.never(),
    addressConcernsPolicy,
    async ({ mutationCtx, workItem }) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
      await workItem.start()
    },
  )
  .complete(
    z.object({
      resolutions: z
        .array(
          z.object({
            concern: z.string(),
            resolution: z.string(),
          }),
        )
        .optional(),
    }),
    addressConcernsPolicy,
    async ({ mutationCtx, workItem, parent }, _payload) => {
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

      // Update work item metadata with resolutions
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'addressConcerns' as const,
            taskName: 'Address Concerns',
            concernsAddressed: true,
          },
        })
      }
    },
  )

export const addressConcernsWorkItem = Builder.workItem(
  'addressConcerns',
).withActions(addressConcernsActions.build())

/**
 * addressConcerns task - Address concerns from pre-launch review
 * Uses XOR join to accept input from either preLaunchReview or launchApproval (concerns)
 * Always loops back to preLaunchReview after completion
 */
export const addressConcernsTask = Builder.task(addressConcernsWorkItem)
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
        scope: 'campaign:manage',
        campaignId: campaign._id,
        payload: {
          type: 'addressConcerns',
          taskName: 'Address Concerns',
          concernsAddressed: undefined,
        },
      })
    },
  })
