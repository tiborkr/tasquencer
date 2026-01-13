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
 * finalApproval work item - Manager signs off on final creative assets
 * Required scope: campaign:creative_review
 *
 * Final sign-off on all creative assets before moving to technical setup.
 * Approved -> proceed to Phase 5 (Technical Setup)
 */

const finalApprovalPolicy = authService.policies.requireScope(
  'campaign:creative_review',
)

const finalApprovalActions = authService.builders.workItemActions
  .start(z.never(), finalApprovalPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      approved: z.boolean(),
      signoffNotes: z.string().optional(),
    }),
    finalApprovalPolicy,
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

      // Update campaign status based on approval
      if (payload.approved) {
        await updateCampaign(mutationCtx.db, campaign._id, {
          status: 'technical_setup',
        })
      }

      // Update work item metadata with decision
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'finalApproval' as const,
            taskName: 'Final Creative Approval',
            decision: payload.approved ? 'approved' : 'rejected',
            approvalNotes: payload.signoffNotes,
          },
        })
      }
    },
  )

export const finalApprovalWorkItem = Builder.workItem(
  'finalApproval',
).withActions(finalApprovalActions.build())

/**
 * finalApproval task - Proceeds to Phase 5 (Technical Setup) on approval
 */
export const finalApprovalTask = Builder.task(finalApprovalWorkItem).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    const campaign = await getCampaignByWorkflowId(
      mutationCtx.db,
      parent.workflow.id,
    )
    invariant(campaign, 'CAMPAIGN_NOT_FOUND')

    const workItemId = await workItem.initialize()

    await initializeCampaignWorkItemAuth(mutationCtx, workItemId, {
      scope: 'campaign:creative_review',
      campaignId: campaign._id,
      payload: {
        type: 'finalApproval',
        taskName: 'Final Creative Approval',
        decision: undefined,
        approvalNotes: undefined,
      },
    })
  },
})
