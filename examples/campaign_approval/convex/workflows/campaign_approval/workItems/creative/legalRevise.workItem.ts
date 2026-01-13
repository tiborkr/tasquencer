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
 * legalRevise work item - Creative team addresses legal compliance issues
 * Required scope: campaign:creative_write
 *
 * Updates assets based on legal feedback.
 * Loops back to legalReview after completion.
 */

const legalRevisePolicy = authService.policies.requireScope(
  'campaign:creative_write',
)

const legalReviseActions = authService.builders.workItemActions
  .start(z.never(), legalRevisePolicy, async ({ mutationCtx, workItem }) => {
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
          addressedIssue: z.string(),
        }),
      ).min(1, 'At least one revised asset is required'),
    }),
    legalRevisePolicy,
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

        // Update with new storage ID and addressed issue notes
        await updateCampaignCreative(mutationCtx.db, asset.creativeId as any, {
          storageId: asset.storageId as any,
          description: `Legal fix: ${asset.addressedIssue}`,
        })
      }

      // Update work item metadata
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'legalRevise' as const,
            taskName: 'Legal Revisions',
            revisionNotes: payload.revisedAssets
              .map((a) => a.addressedIssue)
              .join('; '),
          },
        })
      }
    },
  )

export const legalReviseWorkItem = Builder.workItem('legalRevise').withActions(
  legalReviseActions.build(),
)

/**
 * legalRevise task - Loops back to legalReview after completion
 */
export const legalReviseTask = Builder.task(legalReviseWorkItem).withActivities({
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
        type: 'legalRevise',
        taskName: 'Legal Revisions',
        revisionNotes: undefined,
      },
    })
  },
})
