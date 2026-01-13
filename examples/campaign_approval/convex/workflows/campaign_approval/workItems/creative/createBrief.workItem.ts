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
 * createBrief work item - Campaign manager documents creative requirements
 * Required scope: campaign:manage
 *
 * Documents the creative brief including objectives, target audience,
 * key messages, tone/style, and deliverables needed.
 */

const createBriefPolicy = authService.policies.requireScope('campaign:manage')

const createBriefActions = authService.builders.workItemActions
  .start(z.never(), createBriefPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      objectives: z.string().min(1, 'Objectives are required'),
      targetAudience: z.string().min(1, 'Target audience is required'),
      keyMessages: z.array(z.string()).min(1, 'At least one key message is required'),
      toneAndStyle: z.string().min(1, 'Tone and style is required'),
      deliverables: z.array(
        z.object({
          type: z.enum(['ad', 'email', 'landing_page', 'social_post', 'video']),
          description: z.string().min(1, 'Description is required'),
        }),
      ).min(1, 'At least one deliverable is required'),
      deadline: z.number().positive('Deadline must be a positive timestamp'),
      references: z.array(z.string()).optional(),
    }),
    createBriefPolicy,
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

      // Update campaign status to creative_development
      await updateCampaign(mutationCtx.db, campaign._id, {
        status: 'creative_development',
      })

      // Store brief document as JSON string in metadata
      const briefDocument = JSON.stringify({
        objectives: payload.objectives,
        targetAudience: payload.targetAudience,
        keyMessages: payload.keyMessages,
        toneAndStyle: payload.toneAndStyle,
        deliverables: payload.deliverables,
        deadline: payload.deadline,
        references: payload.references,
      })

      // Update work item metadata with brief
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'createBrief' as const,
            taskName: 'Create Creative Brief',
            briefDocument,
          },
        })
      }
    },
  )

export const createBriefWorkItem = Builder.workItem('createBrief').withActions(
  createBriefActions.build(),
)

/**
 * createBrief task - Sequential flow from budget phase
 */
export const createBriefTask = Builder.task(createBriefWorkItem).withActivities({
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
        type: 'createBrief',
        taskName: 'Create Creative Brief',
        briefDocument: undefined,
      },
    })
  },
})
