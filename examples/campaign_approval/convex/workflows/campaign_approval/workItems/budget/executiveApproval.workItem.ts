import { Builder } from '../../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../../authorization'
import {
  getCampaignByWorkflowId,
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
 * executiveApproval work item - Marketing executive reviews budget (>= $50k)
 * Required scope: campaign_budget_approve_high
 *
 * Executive can approve, reject, or request revision of budgets $50,000 and above.
 * Decision determines workflow routing:
 * - approved -> secureResources
 * - rejected -> end
 * - revision_needed -> loop back to developBudget
 */

const executiveApprovalPolicy = authService.policies.requireScope(
  'campaign:budget_approve_high',
)

const executiveApprovalActions = authService.builders.workItemActions
  .start(
    z.never(),
    executiveApprovalPolicy,
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
      decision: z.enum(['approved', 'rejected', 'revision_requested']),
      approvalNotes: z.string().optional(),
    }),
    executiveApprovalPolicy,
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

      // Get the campaign and budget
      const campaign = await getCampaignByWorkflowId(
        mutationCtx.db,
        parent.workflow.id,
      )
      invariant(campaign, 'CAMPAIGN_NOT_FOUND')

      const budget = await getCampaignBudgetByCampaignId(
        mutationCtx.db,
        campaign._id,
      )
      invariant(budget, 'BUDGET_NOT_FOUND')

      // Update budget status based on decision
      if (payload.decision === 'approved') {
        await updateCampaignBudget(mutationCtx.db, budget._id, {
          status: 'approved',
        })
      } else if (payload.decision === 'rejected') {
        await updateCampaignBudget(mutationCtx.db, budget._id, {
          status: 'rejected',
        })
        await updateCampaign(mutationCtx.db, campaign._id, {
          status: 'cancelled',
        })
      } else if (payload.decision === 'revision_requested') {
        await updateCampaignBudget(mutationCtx.db, budget._id, {
          status: 'revision_requested',
        })
      }

      // Update work item metadata with decision
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'executiveApproval' as const,
            taskName: 'Executive Budget Approval',
            decision: payload.decision,
            approvalNotes: payload.approvalNotes,
          },
        })
      }
    },
  )

export const executiveApprovalWorkItem = Builder.workItem(
  'executiveApproval',
).withActions(executiveApprovalActions.build())

/**
 * executiveApproval task with XOR split for routing based on decision.
 * Routes to: secureResources (approved), developBudget (revision), or end (rejected)
 */
export const executiveApprovalTask = Builder.task(executiveApprovalWorkItem)
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
        scope: 'campaign:budget_approve_high',
        campaignId: campaign._id,
        payload: {
          type: 'executiveApproval',
          taskName: 'Executive Budget Approval',
          decision: undefined,
          approvalNotes: undefined,
        },
      })
    },
  })
