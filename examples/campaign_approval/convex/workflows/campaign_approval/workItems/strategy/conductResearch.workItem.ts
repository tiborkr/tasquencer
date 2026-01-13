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
 * conductResearch work item - Campaign manager conducts market research
 * Required scope: campaign_manage
 *
 * The campaign manager analyzes audience, past campaigns, and competitive landscape
 * to inform the campaign strategy.
 */

const conductResearchPolicy =
  authService.policies.requireScope('campaign:manage')

const conductResearchActions = authService.builders.workItemActions
  .start(z.never(), conductResearchPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      audienceAnalysis: z.string().min(1, 'Audience analysis is required'),
      competitiveInsights: z.string().min(1, 'Competitive insights are required'),
      historicalLearnings: z.string().min(1, 'Historical learnings are required'),
      marketTimingNotes: z.string().optional(),
    }),
    conductResearchPolicy,
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

      // Store research findings summary in work item metadata
      const findingsSummary = [
        `Audience: ${payload.audienceAnalysis.substring(0, 200)}...`,
        `Competitive: ${payload.competitiveInsights.substring(0, 200)}...`,
        `Learnings: ${payload.historicalLearnings.substring(0, 200)}...`,
        payload.marketTimingNotes ? `Timing: ${payload.marketTimingNotes.substring(0, 100)}...` : '',
      ].filter(Boolean).join('\n')

      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'conductResearch' as const,
            taskName: 'Conduct Market Research',
            findings: findingsSummary,
          },
        })
      }

      // Update campaign timestamp
      await updateCampaign(mutationCtx.db, campaign._id, {})
    },
  )

export const conductResearchWorkItem = Builder.workItem(
  'conductResearch',
).withActions(conductResearchActions.build())

export const conductResearchTask = Builder.task(
  conductResearchWorkItem,
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
        type: 'conductResearch',
        taskName: 'Conduct Market Research',
        findings: undefined,
      },
    })
  },
})
