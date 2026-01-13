import { Builder } from '../../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../../authorization'
import {
  getCampaignByWorkflowId,
  insertCampaignBudget,
  getCampaignBudgetByCampaignId,
  updateCampaignBudget,
  updateCampaign,
} from '../../db'
import { initializeCampaignWorkItemAuth } from '../authHelpers'
import { CampaignWorkItemHelpers } from '../../helpers'
import { authComponent } from '../../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'

/**
 * developBudget work item - Campaign manager develops detailed budget breakdown
 * Required scope: campaign_manage
 *
 * Creates or updates the campaign budget with detailed line items.
 * After completion, workflow routes to appropriate approver based on total amount:
 * - If totalAmount < $50,000 -> directorApproval
 * - If totalAmount >= $50,000 -> executiveApproval
 */

const developBudgetPolicy = authService.policies.requireScope('campaign:manage')

const developBudgetActions = authService.builders.workItemActions
  .start(z.never(), developBudgetPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      totalAmount: z.number().min(0, 'Total amount must be non-negative'),
      mediaSpend: z.number().min(0, 'Media spend must be non-negative'),
      creativeProduction: z
        .number()
        .min(0, 'Creative production must be non-negative'),
      technologyTools: z
        .number()
        .min(0, 'Technology tools must be non-negative'),
      agencyFees: z.number().min(0, 'Agency fees must be non-negative'),
      eventCosts: z.number().min(0, 'Event costs must be non-negative'),
      contingency: z.number().min(0, 'Contingency must be non-negative'),
      justification: z.string().min(1, 'Budget justification is required'),
      roiProjection: z.string().optional(),
    }),
    developBudgetPolicy,
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

      const now = Date.now()

      // Check if budget already exists (revision scenario)
      const existingBudget = await getCampaignBudgetByCampaignId(
        mutationCtx.db,
        campaign._id,
      )

      if (existingBudget) {
        // Update existing budget
        await updateCampaignBudget(mutationCtx.db, existingBudget._id, {
          totalAmount: payload.totalAmount,
          mediaSpend: payload.mediaSpend,
          creativeProduction: payload.creativeProduction,
          technologyTools: payload.technologyTools,
          agencyFees: payload.agencyFees,
          eventCosts: payload.eventCosts,
          contingency: payload.contingency,
          justification: payload.justification,
          roiProjection: payload.roiProjection,
          status: 'pending_approval',
        })
      } else {
        // Create new budget
        await insertCampaignBudget(mutationCtx.db, {
          campaignId: campaign._id,
          workflowId: parent.workflow.id,
          totalAmount: payload.totalAmount,
          mediaSpend: payload.mediaSpend,
          creativeProduction: payload.creativeProduction,
          technologyTools: payload.technologyTools,
          agencyFees: payload.agencyFees,
          eventCosts: payload.eventCosts,
          contingency: payload.contingency,
          justification: payload.justification,
          roiProjection: payload.roiProjection,
          status: 'pending_approval',
          createdAt: now,
          updatedAt: now,
        })
      }

      // Update work item metadata
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'developBudget' as const,
            taskName: 'Develop Campaign Budget',
          },
        })
      }

      // Update campaign timestamp
      await updateCampaign(mutationCtx.db, campaign._id, {})
    },
  )

export const developBudgetWorkItem = Builder.workItem(
  'developBudget',
).withActions(developBudgetActions.build())

/**
 * developBudget task with XOR split for routing based on budget amount.
 * Routes to: directorApproval (< $50k) or executiveApproval (>= $50k)
 *
 * Uses XOR join to handle both initial entry and revision loops.
 */
export const developBudgetTask = Builder.task(developBudgetWorkItem)
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
        scope: 'campaign:manage',
        campaignId: campaign._id,
        payload: {
          type: 'developBudget',
          taskName: 'Develop Campaign Budget',
        },
      })
    },
  })
