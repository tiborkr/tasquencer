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
 * internalComms work item - Notify internal teams about upcoming launch
 * Required scope: campaign:manage
 *
 * Part of Phase 6 Launch.
 * Notifies sales, customer service, PR, and other teams about the campaign launch.
 * After completion, proceeds to Phase 7 Execution.
 */

const internalCommsPolicy = authService.policies.requireScope('campaign:manage')

const internalCommsActions = authService.builders.workItemActions
  .start(z.never(), internalCommsPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      notifiedTeams: z
        .array(
          z.object({
            team: z.string(),
            notified: z.boolean(),
          }),
        )
        .optional(),
      communicationsSent: z.boolean().optional(),
    }),
    internalCommsPolicy,
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

      // Update campaign status to active (ready for execution)
      await updateCampaign(mutationCtx.db, campaign._id, {
        status: 'active',
      })

      // Update work item metadata with communication status
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'internalComms' as const,
            taskName: 'Internal Communications',
            communicationsSent: payload.communicationsSent ?? true,
          },
        })
      }
    },
  )

export const internalCommsWorkItem = Builder.workItem(
  'internalComms',
).withActions(internalCommsActions.build())

/**
 * internalComms task - Internal communications before launch
 * After completion, proceeds to Phase 7 Execution (or end if Phase 7 not implemented)
 */
export const internalCommsTask = Builder.task(internalCommsWorkItem).withActivities({
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
        type: 'internalComms',
        taskName: 'Internal Communications',
        communicationsSent: undefined,
      },
    })
  },
})
