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
 * submitRequest work item - Campaign requester submits initial campaign request
 * Required scope: campaign_request
 *
 * This is the first task in the workflow. The requester can review and confirm
 * their campaign request details before submitting for intake review.
 */

const submitRequestPolicy = authService.policies.requireScope('campaign:request')

const submitRequestActions = authService.builders.workItemActions
  .start(z.never(), submitRequestPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      confirmed: z.boolean(),
    }),
    submitRequestPolicy,
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

      // Get the campaign and update status to intake_review
      const campaign = await getCampaignByWorkflowId(
        mutationCtx.db,
        parent.workflow.id,
      )
      invariant(campaign, 'CAMPAIGN_NOT_FOUND')

      if (payload.confirmed) {
        await updateCampaign(mutationCtx.db, campaign._id, {
          status: 'intake_review',
        })
      }
    },
  )

export const submitRequestWorkItem = Builder.workItem(
  'submitRequest',
).withActions(submitRequestActions.build())

/**
 * submitRequest task with XOR join type.
 * XOR join is required because this task has two incoming paths:
 * 1. From start condition (initial activation)
 * 2. From intakeReview via loop-back (when needs_changes)
 * XOR join means only ONE of these needs a token to activate.
 */
export const submitRequestTask = Builder.task(submitRequestWorkItem)
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
      scope: 'campaign:request',
      campaignId: campaign._id,
      payload: {
        type: 'submitRequest',
        taskName: 'Submit Campaign Request',
      },
    })
  },
})
