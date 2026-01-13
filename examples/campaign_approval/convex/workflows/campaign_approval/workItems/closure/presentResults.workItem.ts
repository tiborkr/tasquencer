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
 * presentResults work item - Share findings with stakeholders
 * Required scope: campaign:manage
 *
 * Part of Phase 8 Closure.
 * Records stakeholder presentation, feedback, and follow-up actions.
 * After completion, proceeds to archiveMaterials.
 */

const presentResultsPolicy = authService.policies.requireScope('campaign:manage')

const presentResultsActions = authService.builders.workItemActions
  .start(z.never(), presentResultsPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      presentationDate: z.number(),
      attendees: z.array(z.string()),
      presentationUrl: z.string().optional(),
      feedbackReceived: z.string(),
      followUpActions: z
        .array(
          z.object({
            action: z.string(),
            owner: z.string(),
            dueDate: z.number().optional(),
          }),
        )
        .optional(),
    }),
    presentResultsPolicy,
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

      // Update work item metadata
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'presentResults' as const,
            taskName: 'Present Results',
            presentationComplete: true,
          },
        })
      }
    },
  )

export const presentResultsWorkItem = Builder.workItem(
  'presentResults',
).withActions(presentResultsActions.build())

/**
 * presentResults task - Share findings with stakeholders
 * Receives input from conductAnalysis
 * After completion, proceeds to archiveMaterials
 */
export const presentResultsTask = Builder.task(
  presentResultsWorkItem,
).withActivities({
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
        type: 'presentResults',
        taskName: 'Present Results',
        presentationComplete: undefined,
      },
    })
  },
})
