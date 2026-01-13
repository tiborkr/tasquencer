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
 * launchApproval work item - Formal sign-off to authorize campaign launch
 * Required scope: campaign:launch_approve
 *
 * Part of Phase 6 Launch.
 * Marketing Director or VP/CMO provides formal approval for launch.
 * XOR routing: approved -> internalComms, concerns -> addressConcerns, rejected -> end
 */

const launchApprovalPolicy = authService.policies.requireScope(
  'campaign:launch_approve',
)

const launchApprovalActions = authService.builders.workItemActions
  .start(
    z.never(),
    launchApprovalPolicy,
    async ({ mutationCtx, workItem }) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
      await workItem.start()
    },
  )
  .complete(
    z.object({
      decision: z.enum(['approved', 'concerns', 'rejected']),
      approverNotes: z.string().optional(),
      launchDate: z.number().optional(),
    }),
    launchApprovalPolicy,
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

      // Update campaign status based on decision
      if (payload.decision === 'rejected') {
        await updateCampaign(mutationCtx.db, campaign._id, {
          status: 'cancelled',
        })
      }

      // Update work item metadata with decision
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'launchApproval' as const,
            taskName: 'Launch Approval',
            decision: payload.decision,
            approvalNotes: payload.approverNotes,
          },
        })
      }
    },
  )

export const launchApprovalWorkItem = Builder.workItem(
  'launchApproval',
).withActions(launchApprovalActions.build())

/**
 * launchApproval task - Launch approval with XOR routing based on decision
 * Uses XOR split to route to internalComms (approved), addressConcerns (concerns), or end (rejected)
 */
export const launchApprovalTask = Builder.task(launchApprovalWorkItem)
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
        scope: 'campaign:launch_approve',
        campaignId: campaign._id,
        payload: {
          type: 'launchApproval',
          taskName: 'Launch Approval',
          decision: undefined,
          approvalNotes: undefined,
        },
      })
    },
  })
