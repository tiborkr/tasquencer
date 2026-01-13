import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { getCampaignByWorkflowId, updateCampaign } from '../db'
import { initializeCampaignWorkItemAuth } from './authHelpers'
import { CampaignWorkItemHelpers } from '../helpers'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'

const storeWritePolicy = authService.policies.requireScope(
  'campaign_approval:write',
)

const storeCampaignActions = authService.builders.workItemActions
  .start(z.never(), storeWritePolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)

    const userId = authUser.userId

    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      userId,
    )
    await workItem.start()
  })
  .complete(
    z.object({
      objective: z.string().min(1, 'Objective update is required'),
    }),
    storeWritePolicy,
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

      // Get the campaign and update the objective
      const campaign = await getCampaignByWorkflowId(
        mutationCtx.db,
        parent.workflow.id,
      )

      invariant(campaign, 'CAMPAIGN_NOT_FOUND')

      await updateCampaign(mutationCtx.db, campaign._id, {
        objective: payload.objective,
        status: 'intake_review',
      })
    },
  )

export const storeCampaignWorkItem = Builder.workItem(
  'storeCampaign',
).withActions(storeCampaignActions.build())

export const storeCampaignTask = Builder.task(
  storeCampaignWorkItem,
).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    // Initialize the work item when the task is enabled
    const campaign = await getCampaignByWorkflowId(
      mutationCtx.db,
      parent.workflow.id,
    )

    invariant(campaign, 'CAMPAIGN_NOT_FOUND')

    const workItemId = await workItem.initialize()

    await initializeCampaignWorkItemAuth(mutationCtx, workItemId, {
      scope: 'campaign_approval:write',
      campaignId: campaign._id,
      payload: {
        type: 'storeCampaign',
        taskName: 'Store Campaign',
      },
    })
  },
})
