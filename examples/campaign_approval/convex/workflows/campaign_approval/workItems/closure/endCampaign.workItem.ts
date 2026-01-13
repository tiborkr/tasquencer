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
 * endCampaign work item - Deactivate all campaign elements
 * Required scope: campaign:ops (also accessible to campaign:media)
 *
 * Part of Phase 8 Closure.
 * Deactivates ads, emails, landing pages, social posts, and closes offers.
 * After completion, proceeds to compileData.
 */

const endCampaignPolicy = authService.policies.requireScope('campaign:ops')

const endCampaignActions = authService.builders.workItemActions
  .start(z.never(), endCampaignPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      endedAt: z.number(),
      deactivatedComponents: z.array(
        z.object({
          component: z.enum([
            'ads',
            'emails',
            'landing_pages',
            'social',
            'offers',
          ]),
          platform: z.string().optional(),
          deactivatedAt: z.number(),
        }),
      ),
      remainingBudget: z.number().optional(),
      endNotes: z.string().optional(),
    }),
    endCampaignPolicy,
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

      // Update work item metadata with end details
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'endCampaign' as const,
            taskName: 'End Campaign',
            endConfirmed: true,
          },
        })
      }

      // Note: Campaign status remains 'active' until archiveMaterials completes
      // when it will be set to 'completed'
    },
  )

export const endCampaignWorkItem = Builder.workItem('endCampaign').withActions(
  endCampaignActions.build(),
)

/**
 * endCampaign task - Deactivate all campaign elements
 * Receives input from ongoingOptimization 'end' decision (Phase 7)
 * After completion, proceeds to compileData
 */
export const endCampaignTask = Builder.task(endCampaignWorkItem).withActivities({
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
        type: 'endCampaign',
        taskName: 'End Campaign',
        endConfirmed: undefined,
      },
    })
  },
})
