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
 * createPlan work item - Campaign manager creates the campaign plan
 * Required scope: campaign_manage
 *
 * The campaign manager documents the full plan with timeline, milestones,
 * tactics, segmentation, and resource requirements. This is the final step
 * of the Strategy phase before moving to Budget approval.
 */

const createPlanPolicy = authService.policies.requireScope('campaign:manage')

const milestoneSchema = z.object({
  name: z.string().min(1, 'Milestone name is required'),
  targetDate: z.number().min(0, 'Target date is required'),
})

const createPlanActions = authService.builders.workItemActions
  .start(z.never(), createPlanPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      timeline: z.string().min(1, 'Timeline is required'),
      milestones: z
        .array(milestoneSchema)
        .min(1, 'At least one milestone is required'),
      tactics: z.string().min(1, 'Tactics are required'),
      segmentation: z.string().min(1, 'Segmentation is required'),
      resourceRequirements: z.string().min(1, 'Resource requirements are required'),
    }),
    createPlanPolicy,
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

      // Create plan document summary
      const planDocument = [
        `## Timeline\n${payload.timeline}`,
        `## Milestones\n${payload.milestones
          .map((m) => `- ${m.name}: ${new Date(m.targetDate).toLocaleDateString()}`)
          .join('\n')}`,
        `## Tactics\n${payload.tactics}`,
        `## Segmentation\n${payload.segmentation}`,
        `## Resource Requirements\n${payload.resourceRequirements}`,
      ].join('\n\n')

      // Update work item metadata with plan document
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'createPlan' as const,
            taskName: 'Create Campaign Plan',
            planDocument,
          },
        })
      }

      // Update campaign status to budget_approval phase
      await updateCampaign(mutationCtx.db, campaign._id, {
        status: 'budget_approval',
      })
    },
  )

export const createPlanWorkItem = Builder.workItem('createPlan').withActions(
  createPlanActions.build(),
)

export const createPlanTask = Builder.task(createPlanWorkItem).withActivities({
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
        type: 'createPlan',
        taskName: 'Create Campaign Plan',
        planDocument: undefined,
      },
    })
  },
})
