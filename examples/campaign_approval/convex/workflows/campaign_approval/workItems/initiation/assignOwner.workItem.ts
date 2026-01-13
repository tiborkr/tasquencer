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
 * assignOwner work item - Marketing coordinator assigns campaign owner
 * Required scope: campaign_intake
 *
 * After intake approval, the coordinator assigns a campaign manager
 * who will own the campaign through the remaining phases.
 */

const assignOwnerPolicy = authService.policies.requireScope('campaign:intake')

const assignOwnerActions = authService.builders.workItemActions
  .start(z.never(), assignOwnerPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      ownerId: z.string().min(1, 'Owner ID is required'),
    }),
    assignOwnerPolicy,
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

      // Get the campaign and assign the owner
      const campaign = await getCampaignByWorkflowId(
        mutationCtx.db,
        parent.workflow.id,
      )
      invariant(campaign, 'CAMPAIGN_NOT_FOUND')

      // Update campaign with owner and advance to strategy phase
      await updateCampaign(mutationCtx.db, campaign._id, {
        ownerId: payload.ownerId as any, // Cast to Id<'users'>
        status: 'strategy',
      })

      // Update work item metadata with assigned owner
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'assignOwner' as const,
            taskName: 'Assign Campaign Owner',
            ownerId: payload.ownerId as any,
          },
        })
      }
    },
  )

export const assignOwnerWorkItem = Builder.workItem('assignOwner').withActions(
  assignOwnerActions.build(),
)

export const assignOwnerTask = Builder.task(assignOwnerWorkItem).withActivities(
  {
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      const campaign = await getCampaignByWorkflowId(
        mutationCtx.db,
        parent.workflow.id,
      )
      invariant(campaign, 'CAMPAIGN_NOT_FOUND')

      const workItemId = await workItem.initialize()

      await initializeCampaignWorkItemAuth(mutationCtx, workItemId, {
        scope: 'campaign:intake',
        campaignId: campaign._id,
        payload: {
          type: 'assignOwner',
          taskName: 'Assign Campaign Owner',
          ownerId: undefined,
        },
      })
    },
  },
)
