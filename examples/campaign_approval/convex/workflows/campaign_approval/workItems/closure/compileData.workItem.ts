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
 * compileData work item - Gather results from all channels
 * Required scope: campaign:ops
 *
 * Part of Phase 8 Closure.
 * Collects metrics from Google Analytics, ad platforms, CRM, email platforms.
 * After completion, proceeds to conductAnalysis.
 */

const compileDataPolicy = authService.policies.requireScope('campaign:ops')

const compileDataActions = authService.builders.workItemActions
  .start(z.never(), compileDataPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      dataSources: z.array(
        z.object({
          source: z.string(),
          metricsCollected: z.array(z.string()),
          dataRange: z.object({
            start: z.number(),
            end: z.number(),
          }),
        }),
      ),
      aggregatedMetrics: z.object({
        totalImpressions: z.number().optional(),
        totalClicks: z.number().optional(),
        totalConversions: z.number().optional(),
        totalSpend: z.number(),
        totalRevenue: z.number().optional(),
      }),
      dataLocation: z.string(),
    }),
    compileDataPolicy,
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

      // Get the campaign
      const campaign = await getCampaignByWorkflowId(
        mutationCtx.db,
        parent.workflow.id,
      )
      invariant(campaign, 'CAMPAIGN_NOT_FOUND')

      // Update work item metadata
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'compileData' as const,
            taskName: 'Compile Data',
            dataCompiled: true,
          },
        })
      }
    },
  )

export const compileDataWorkItem = Builder.workItem('compileData').withActions(
  compileDataActions.build(),
)

/**
 * compileData task - Gather results from all channels
 * Receives input from endCampaign
 * After completion, proceeds to conductAnalysis
 */
export const compileDataTask = Builder.task(compileDataWorkItem).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    const campaign = await getCampaignByWorkflowId(
      mutationCtx.db,
      parent.workflow.id,
    )
    invariant(campaign, 'CAMPAIGN_NOT_FOUND')

    const workItemId = await workItem.initialize()

    await initializeCampaignWorkItemAuth(mutationCtx, workItemId, {
      scope: 'campaign:ops',
      campaignId: campaign._id,
      payload: {
        type: 'compileData',
        taskName: 'Compile Data',
        dataCompiled: undefined,
      },
    })
  },
})
