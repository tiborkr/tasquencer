import { Builder } from '../../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../../authorization'
import {
  getCampaignByWorkflowId,
  getCampaignWorkItemsByAggregate,
  insertCampaignCreative,
  updateCampaignCreative,
} from '../../db'
import { initializeCampaignWorkItemAuth } from '../authHelpers'
import { CampaignWorkItemHelpers } from '../../helpers'
import { authComponent } from '../../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'

/**
 * developConcepts work item - Creative team produces mockups and drafts
 * Required scope: campaign:creative_write
 *
 * Creates CampaignCreative records for each deliverable from the brief.
 * Creative team uploads assets and adds notes.
 */

const developConceptsPolicy = authService.policies.requireScope(
  'campaign:creative_write',
)

const developConceptsActions = authService.builders.workItemActions
  .start(z.never(), developConceptsPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      assets: z.array(
        z.object({
          creativeId: z.string(), // Will be validated as Id<"campaignCreatives">
          storageId: z.string().optional(), // Id<"_storage"> - file upload
          notes: z.string().optional(),
        }),
      ).min(1, 'At least one asset must be completed'),
    }),
    developConceptsPolicy,
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

      // Update each creative asset with storage ID and notes
      for (const asset of payload.assets) {
        await updateCampaignCreative(
          mutationCtx.db,
          asset.creativeId as any,
          {
            storageId: asset.storageId as any,
            description: asset.notes,
          },
        )
      }

      // Update work item metadata
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'developConcepts' as const,
            taskName: 'Develop Creative Concepts',
          },
        })
      }
    },
  )

export const developConceptsWorkItem = Builder.workItem(
  'developConcepts',
).withActions(developConceptsActions.build())

/**
 * developConcepts task - Creates creative records on enable
 */
export const developConceptsTask = Builder.task(
  developConceptsWorkItem,
).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    const campaign = await getCampaignByWorkflowId(
      mutationCtx.db,
      parent.workflow.id,
    )
    invariant(campaign, 'CAMPAIGN_NOT_FOUND')

    // Get the brief from createBrief work item to extract deliverables
    const workItems = await getCampaignWorkItemsByAggregate(
      mutationCtx.db,
      campaign._id,
    )
    const briefItem = workItems.find((wi) => wi.payload.type === 'createBrief')

    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId ?? (campaign.ownerId as string)

    const now = Date.now()

    // Parse deliverables from brief if available
    let deliverables: Array<{ type: string; description: string }> = []
    if (briefItem && briefItem.payload.type === 'createBrief' && briefItem.payload.briefDocument) {
      try {
        const brief = JSON.parse(briefItem.payload.briefDocument)
        deliverables = brief.deliverables || []
      } catch {
        // If brief parsing fails, create a default placeholder creative
        deliverables = [{ type: 'ad', description: 'Campaign creative asset' }]
      }
    } else {
      // Create a default placeholder creative if no brief
      deliverables = [{ type: 'ad', description: 'Campaign creative asset' }]
    }

    // Create CampaignCreative records for each deliverable
    for (const deliverable of deliverables) {
      await insertCampaignCreative(mutationCtx.db, {
        campaignId: campaign._id,
        workflowId: parent.workflow.id,
        assetType: deliverable.type as any,
        name: deliverable.description,
        description: undefined,
        storageId: undefined,
        version: 1,
        createdBy: userId as any,
        createdAt: now,
        updatedAt: now,
      })
    }

    const workItemId = await workItem.initialize()

    await initializeCampaignWorkItemAuth(mutationCtx, workItemId, {
      scope: 'campaign:creative_write',
      campaignId: campaign._id,
      payload: {
        type: 'developConcepts',
        taskName: 'Develop Creative Concepts',
      },
    })
  },
})
