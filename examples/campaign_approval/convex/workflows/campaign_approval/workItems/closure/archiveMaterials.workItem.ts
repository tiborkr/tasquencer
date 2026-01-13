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
 * archiveMaterials work item - Store all assets and documentation
 * Required scope: campaign:ops
 *
 * Part of Phase 8 Closure.
 * Archives creative assets, analytics data, reports, documentation, contracts.
 * After completion, workflow ends.
 */

const archiveMaterialsPolicy = authService.policies.requireScope('campaign:ops')

const archiveMaterialsActions = authService.builders.workItemActions
  .start(z.never(), archiveMaterialsPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      archivedItems: z.array(
        z.object({
          itemType: z.enum([
            'creative_assets',
            'analytics_data',
            'reports',
            'documentation',
            'contracts',
          ]),
          location: z.string(),
          description: z.string(),
        }),
      ),
      archiveLocation: z.string(),
      retentionPeriod: z.string().optional(),
      archivedAt: z.number(),
    }),
    archiveMaterialsPolicy,
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

      // Campaign is now officially completed
      await updateCampaign(mutationCtx.db, campaign._id, {
        status: 'completed',
      })

      // Update work item metadata
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'archiveMaterials' as const,
            taskName: 'Archive Materials',
            archiveComplete: true,
          },
        })
      }
    },
  )

export const archiveMaterialsWorkItem = Builder.workItem(
  'archiveMaterials',
).withActions(archiveMaterialsActions.build())

/**
 * archiveMaterials task - Store all assets and documentation
 * Receives input from presentResults
 * After completion, workflow ends
 */
export const archiveMaterialsTask = Builder.task(
  archiveMaterialsWorkItem,
).withActivities({
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
        type: 'archiveMaterials',
        taskName: 'Archive Materials',
        archiveComplete: undefined,
      },
    })
  },
})
