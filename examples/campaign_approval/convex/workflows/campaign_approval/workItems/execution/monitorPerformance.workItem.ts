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
 * monitorPerformance work item - Monitor campaign performance metrics
 * Required scope: campaign:manage
 *
 * Part of Phase 7 Execution.
 * Watches for issues and anomalies, especially in early campaign period.
 * After completion, proceeds to ongoingOptimization.
 */

const monitorPerformancePolicy = authService.policies.requireScope('campaign:manage')

const monitorPerformanceActions = authService.builders.workItemActions
  .start(z.never(), monitorPerformancePolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      monitoringPeriod: z
        .object({
          start: z.number(),
          end: z.number(),
        })
        .optional(),
      metrics: z
        .array(
          z.object({
            metric: z.string(),
            value: z.number(),
            benchmark: z.number().optional(),
            status: z.enum(['on_track', 'above_target', 'below_target', 'critical']),
          }),
        )
        .optional(),
      issues: z
        .array(
          z.object({
            issue: z.string(),
            severity: z.enum(['low', 'medium', 'high', 'critical']),
            action: z.string(),
          }),
        )
        .optional(),
      overallStatus: z.enum(['healthy', 'needs_attention', 'critical']).optional(),
    }),
    monitorPerformancePolicy,
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

      // Update work item metadata with monitoring results
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'monitorPerformance' as const,
            taskName: 'Monitor Performance',
            performanceNotes: payload.overallStatus ?? 'healthy',
          },
        })
      }
    },
  )

export const monitorPerformanceWorkItem = Builder.workItem(
  'monitorPerformance',
).withActions(monitorPerformanceActions.build())

/**
 * monitorPerformance task - Monitor campaign performance
 * Uses XOR join to accept input from launchCampaign OR ongoingOptimization loop
 * After completion, proceeds to ongoingOptimization
 */
export const monitorPerformanceTask = Builder.task(monitorPerformanceWorkItem)
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
          type: 'monitorPerformance',
          taskName: 'Monitor Performance',
          performanceNotes: undefined,
        },
      })
    },
  })
