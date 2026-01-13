import { Builder } from '../../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../../authorization'
import { getCampaignByWorkflowId, updateCampaignKPI } from '../../db'
import { initializeCampaignWorkItemAuth } from '../authHelpers'
import { CampaignWorkItemHelpers } from '../../helpers'
import { authComponent } from '../../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'

/**
 * conductAnalysis work item - Prepare retrospective report
 * Required scope: campaign:manage
 *
 * Part of Phase 8 Closure.
 * Compares results to KPI targets, identifies what worked and what didn't.
 * Updates CampaignKPI records with actualValue.
 * After completion, proceeds to presentResults.
 */

const conductAnalysisPolicy = authService.policies.requireScope('campaign:manage')

const conductAnalysisActions = authService.builders.workItemActions
  .start(z.never(), conductAnalysisPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      kpiResults: z.array(
        z.object({
          kpiId: z.string(), // Will be cast to Id<"campaignKPIs">
          metric: z.string(),
          target: z.number(),
          actual: z.number(),
          percentAchieved: z.number(),
          analysis: z.string(),
        }),
      ),
      whatWorked: z.array(z.string()),
      whatDidntWork: z.array(z.string()),
      lessonsLearned: z.array(z.string()),
      recommendationsForFuture: z.array(z.string()),
      overallAssessment: z.enum([
        'exceeded_goals',
        'met_goals',
        'partially_met',
        'did_not_meet',
      ]),
    }),
    conductAnalysisPolicy,
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

      // Update KPI records with actual values
      for (const kpiResult of payload.kpiResults) {
        await updateCampaignKPI(
          mutationCtx.db,
          kpiResult.kpiId as any, // Cast to Id<"campaignKPIs">
          { actualValue: kpiResult.actual },
        )
      }

      // Update work item metadata
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'conductAnalysis' as const,
            taskName: 'Conduct Analysis',
            analysisDocument: payload.overallAssessment,
          },
        })
      }
    },
  )

export const conductAnalysisWorkItem = Builder.workItem(
  'conductAnalysis',
).withActions(conductAnalysisActions.build())

/**
 * conductAnalysis task - Prepare retrospective report
 * Receives input from compileData
 * After completion, proceeds to presentResults
 */
export const conductAnalysisTask = Builder.task(
  conductAnalysisWorkItem,
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
        type: 'conductAnalysis',
        taskName: 'Conduct Analysis',
        analysisDocument: undefined,
      },
    })
  },
})
