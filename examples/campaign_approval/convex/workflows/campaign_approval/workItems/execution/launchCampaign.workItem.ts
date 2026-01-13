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
 * launchCampaign work item - Activate all campaign elements
 * Required scope: campaign:ops
 *
 * Part of Phase 7 Execution.
 * Activates ads, emails, landing pages, social posts across all platforms.
 * After completion, proceeds to monitorPerformance.
 */

const launchCampaignPolicy = authService.policies.requireScope('campaign:ops')

const launchCampaignActions = authService.builders.workItemActions
  .start(z.never(), launchCampaignPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      launchedAt: z.number().optional(),
      activatedComponents: z
        .array(
          z.object({
            component: z.enum(['ads', 'emails', 'landing_pages', 'social']),
            platform: z.string().optional(),
            status: z.enum(['live', 'scheduled']),
            scheduledTime: z.number().optional(),
          }),
        )
        .optional(),
      launchNotes: z.string().optional(),
    }),
    launchCampaignPolicy,
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

      // Campaign is now officially launched
      await updateCampaign(mutationCtx.db, campaign._id, {
        status: 'active',
      })

      // Update work item metadata
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'launchCampaign' as const,
            taskName: 'Launch Campaign',
            launchConfirmed: true,
          },
        })
      }
    },
  )

export const launchCampaignWorkItem = Builder.workItem(
  'launchCampaign',
).withActions(launchCampaignActions.build())

/**
 * launchCampaign task - Activate all campaign elements
 * Receives input from internalComms (Phase 6)
 * After completion, proceeds to monitorPerformance
 */
export const launchCampaignTask = Builder.task(launchCampaignWorkItem).withActivities({
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
        type: 'launchCampaign',
        taskName: 'Launch Campaign',
        launchConfirmed: undefined,
      },
    })
  },
})
