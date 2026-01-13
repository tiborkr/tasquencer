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
 * secureResources work item - Campaign manager secures resources for the campaign
 * Required scope: campaign_manage
 *
 * After budget approval, the campaign manager reserves internal resources
 * and initiates any external procurement. This completes Phase 3 Budget
 * and transitions the campaign to Phase 4 Creative.
 */

const secureResourcesPolicy =
  authService.policies.requireScope('campaign:manage')

const secureResourcesActions = authService.builders.workItemActions
  .start(
    z.never(),
    secureResourcesPolicy,
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
      resourcesConfirmed: z.boolean(),
      internalResources: z
        .array(z.string())
        .optional()
        .describe('List of internal resources reserved'),
      externalVendors: z
        .array(z.string())
        .optional()
        .describe('List of external vendors engaged'),
      procurementNotes: z
        .string()
        .optional()
        .describe('Notes on procurement status'),
    }),
    secureResourcesPolicy,
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

      // Update work item metadata
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'secureResources' as const,
            taskName: 'Secure Campaign Resources',
            resourcesConfirmed: payload.resourcesConfirmed,
          },
        })
      }

      // Update campaign status to creative phase
      await updateCampaign(mutationCtx.db, campaign._id, {
        status: 'creative_development',
      })
    },
  )

export const secureResourcesWorkItem = Builder.workItem(
  'secureResources',
).withActions(secureResourcesActions.build())

/**
 * secureResources task - completes Phase 3 Budget.
 * Uses XOR join to handle incoming flows from both approval paths.
 */
export const secureResourcesTask = Builder.task(secureResourcesWorkItem)
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
          type: 'secureResources',
          taskName: 'Secure Campaign Resources',
          resourcesConfirmed: undefined,
        },
      })
    },
  })
