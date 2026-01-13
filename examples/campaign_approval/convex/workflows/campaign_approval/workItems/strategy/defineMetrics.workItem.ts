import { Builder } from '../../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../../authorization'
import { getCampaignByWorkflowId, insertCampaignKPI } from '../../db'
import { initializeCampaignWorkItemAuth } from '../authHelpers'
import { CampaignWorkItemHelpers } from '../../helpers'
import { authComponent } from '../../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'

/**
 * defineMetrics work item - Campaign manager defines success metrics and KPIs
 * Required scope: campaign_manage
 *
 * The campaign manager establishes measurable KPIs and success criteria
 * that will be tracked throughout the campaign lifecycle.
 */

const defineMetricsPolicy = authService.policies.requireScope('campaign:manage')

const kpiSchema = z.object({
  metric: z.string().min(1, 'Metric name is required'),
  targetValue: z.number().min(0, 'Target value must be non-negative'),
  unit: z.string().min(1, 'Unit is required'),
})

const defineMetricsActions = authService.builders.workItemActions
  .start(z.never(), defineMetricsPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      kpis: z.array(kpiSchema).min(1, 'At least one KPI is required'),
    }),
    defineMetricsPolicy,
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

      // Create KPI records in the database
      const now = Date.now()
      for (const kpi of payload.kpis) {
        await insertCampaignKPI(mutationCtx.db, {
          campaignId: campaign._id,
          metric: kpi.metric,
          targetValue: kpi.targetValue,
          unit: kpi.unit,
          createdAt: now,
        })
      }

      // Update work item metadata
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'defineMetrics' as const,
            taskName: 'Define Success Metrics',
          },
        })
      }
    },
  )

export const defineMetricsWorkItem = Builder.workItem(
  'defineMetrics',
).withActions(defineMetricsActions.build())

export const defineMetricsTask = Builder.task(
  defineMetricsWorkItem,
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
        type: 'defineMetrics',
        taskName: 'Define Success Metrics',
      },
    })
  },
})
