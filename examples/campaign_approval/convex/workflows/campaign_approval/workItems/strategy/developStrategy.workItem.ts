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
 * developStrategy work item - Campaign manager develops the campaign strategy
 * Required scope: campaign_manage
 *
 * The campaign manager selects channels, defines creative approach,
 * and maps out the customer journey and key touchpoints.
 */

const developStrategyPolicy =
  authService.policies.requireScope('campaign:manage')

const developStrategyActions = authService.builders.workItemActions
  .start(
    z.never(),
    developStrategyPolicy,
    async ({ mutationCtx, workItem }) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      await CampaignWorkItemHelpers.claimWorkItem(
        mutationCtx,
        workItem.id,
        userId,
      )
      await workItem.start()
    },
  )
  .complete(
    z.object({
      channelStrategy: z.string().min(1, 'Channel strategy is required'),
      creativeApproach: z.string().min(1, 'Creative approach is required'),
      customerJourney: z.string().min(1, 'Customer journey is required'),
      keyTouchpoints: z
        .array(z.string())
        .min(1, 'At least one touchpoint is required'),
    }),
    developStrategyPolicy,
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

      // Create strategy document summary
      const strategyDocument = [
        `## Channel Strategy\n${payload.channelStrategy}`,
        `## Creative Approach\n${payload.creativeApproach}`,
        `## Customer Journey\n${payload.customerJourney}`,
        `## Key Touchpoints\n${payload.keyTouchpoints.map((t) => `- ${t}`).join('\n')}`,
      ].join('\n\n')

      // Update work item metadata with strategy document
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'developStrategy' as const,
            taskName: 'Develop Campaign Strategy',
            strategyDocument,
          },
        })
      }

      // Update campaign timestamp
      await updateCampaign(mutationCtx.db, campaign._id, {})
    },
  )

export const developStrategyWorkItem = Builder.workItem(
  'developStrategy',
).withActions(developStrategyActions.build())

export const developStrategyTask = Builder.task(
  developStrategyWorkItem,
).withActivities({
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
        type: 'developStrategy',
        taskName: 'Develop Campaign Strategy',
        strategyDocument: undefined,
      },
    })
  },
})
