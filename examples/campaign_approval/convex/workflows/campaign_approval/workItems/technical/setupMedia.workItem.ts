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
 * setupMedia work item - Create campaigns in ad platforms, configure targeting
 * Required scope: campaign:media
 *
 * Part of Phase 5 Technical Setup (parallel task).
 * Runs in parallel with buildInfra and configAnalytics.
 */

const setupMediaPolicy = authService.policies.requireScope('campaign:media')

const setupMediaActions = authService.builders.workItemActions
  .start(z.never(), setupMediaPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      mediaReady: z.boolean(),
      notes: z.string().optional(),
    }),
    setupMediaPolicy,
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

      // Update work item metadata with completion status
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'setupMedia' as const,
            taskName: 'Setup Media',
            mediaReady: payload.mediaReady,
          },
        })
      }
    },
  )

export const setupMediaWorkItem = Builder.workItem('setupMedia').withActions(
  setupMediaActions.build(),
)

/**
 * setupMedia task - Parallel task in Phase 5 Technical Setup
 */
export const setupMediaTask = Builder.task(setupMediaWorkItem).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    const campaign = await getCampaignByWorkflowId(
      mutationCtx.db,
      parent.workflow.id,
    )
    invariant(campaign, 'CAMPAIGN_NOT_FOUND')

    const workItemId = await workItem.initialize()

    await initializeCampaignWorkItemAuth(mutationCtx, workItemId, {
      scope: 'campaign:media',
      campaignId: campaign._id,
      payload: {
        type: 'setupMedia',
        taskName: 'Setup Media',
        mediaReady: undefined,
      },
    })
  },
})
