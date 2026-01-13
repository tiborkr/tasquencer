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
 * ongoingOptimization work item - Adjust campaign based on performance data
 * Required scope: campaign:manage
 *
 * Part of Phase 7 Execution.
 * Makes adjustments like targeting changes, budget reallocation, creative refresh.
 * XOR routing: continue -> monitorPerformance (loop), end -> Phase 8 Closure
 */

const ongoingOptimizationPolicy = authService.policies.requireScope('campaign:manage')

const ongoingOptimizationActions = authService.builders.workItemActions
  .start(z.never(), ongoingOptimizationPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      optimizations: z
        .array(
          z.object({
            type: z.enum([
              'targeting',
              'budget_reallocation',
              'creative_refresh',
              'bid_adjustment',
              'channel_shift',
            ]),
            description: z.string(),
            expectedImpact: z.string(),
            implementedAt: z.number(),
          }),
        )
        .optional(),
      budgetChanges: z
        .object({
          from: z.record(z.string(), z.number()),
          to: z.record(z.string(), z.number()),
          reason: z.string(),
        })
        .optional(),
      nextReviewDate: z.number().optional(),
      decision: z.enum(['continue', 'end']),
    }),
    ongoingOptimizationPolicy,
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

      // Update work item metadata with optimization results and decision
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'ongoingOptimization' as const,
            taskName: 'Ongoing Optimization',
            optimizationNotes: payload.optimizations
              ? `${payload.optimizations.length} optimizations made`
              : undefined,
            decision: payload.decision,
          },
        })
      }
    },
  )

export const ongoingOptimizationWorkItem = Builder.workItem(
  'ongoingOptimization',
).withActions(ongoingOptimizationActions.build())

/**
 * ongoingOptimization task - Campaign optimization with XOR routing
 * XOR split: decision='continue' -> monitorPerformance (loop), decision='end' -> Phase 8
 */
export const ongoingOptimizationTask = Builder.task(ongoingOptimizationWorkItem)
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
          type: 'ongoingOptimization',
          taskName: 'Ongoing Optimization',
          optimizationNotes: undefined,
          decision: undefined,
        },
      })
    },
  })
