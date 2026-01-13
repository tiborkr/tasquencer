import { Builder } from '../../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../../authorization'
import {
  getCampaignByWorkflowId,
  updateCampaignCreative,
  incrementCreativeVersion,
} from '../../db'
import { initializeCampaignWorkItemAuth } from '../authHelpers'
import { CampaignWorkItemHelpers } from '../../helpers'
import { authComponent } from '../../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'

/**
 * reviseAssets work item - Creative team iterates based on review feedback
 * Required scope: campaign:creative_write
 *
 * Increments version numbers on assets and updates with new files.
 * Loops back to internalReview after completion.
 */

const reviseAssetsPolicy = authService.policies.requireScope(
  'campaign:creative_write',
)

const reviseAssetsActions = authService.builders.workItemActions
  .start(z.never(), reviseAssetsPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      revisedAssets: z.array(
        z.object({
          creativeId: z.string(), // Id<"campaignCreatives">
          storageId: z.string().optional(), // Id<"_storage">
          revisionNotes: z.string(),
        }),
      ).min(1, 'At least one revised asset is required'),
    }),
    reviseAssetsPolicy,
    async ({ mutationCtx, workItem }, payload) => {
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

      // Update each revised asset
      for (const asset of payload.revisedAssets) {
        // Increment version
        await incrementCreativeVersion(mutationCtx.db, asset.creativeId as any)

        // Update with new storage ID and revision notes
        await updateCampaignCreative(mutationCtx.db, asset.creativeId as any, {
          storageId: asset.storageId as any,
          description: asset.revisionNotes,
        })
      }

      // Update work item metadata
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'reviseAssets' as const,
            taskName: 'Revise Creative Assets',
            revisionNotes: payload.revisedAssets
              .map((a) => a.revisionNotes)
              .join('; '),
          },
        })
      }
    },
  )

export const reviseAssetsWorkItem = Builder.workItem('reviseAssets').withActions(
  reviseAssetsActions.build(),
)

/**
 * reviseAssets task - Loops back to internalReview after completion
 */
export const reviseAssetsTask = Builder.task(reviseAssetsWorkItem).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    const campaign = await getCampaignByWorkflowId(
      mutationCtx.db,
      parent.workflow.id,
    )
    invariant(campaign, 'CAMPAIGN_NOT_FOUND')

    const workItemId = await workItem.initialize()

    await initializeCampaignWorkItemAuth(mutationCtx, workItemId, {
      scope: 'campaign:creative_write',
      campaignId: campaign._id,
      payload: {
        type: 'reviseAssets',
        taskName: 'Revise Creative Assets',
        revisionNotes: undefined,
      },
    })
  },
})
