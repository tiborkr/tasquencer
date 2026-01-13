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
 * fixIssues work item - Address QA failures
 * Required scope: campaign:ops
 *
 * Part of Phase 5 Technical Setup.
 * Runs when qaTest fails, then loops back to qaTest.
 */

const fixIssuesPolicy = authService.policies.requireScope('campaign:ops')

const fixIssuesActions = authService.builders.workItemActions
  .start(z.never(), fixIssuesPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      issuesFixed: z.boolean(),
      notes: z.string().optional(),
    }),
    fixIssuesPolicy,
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

      // Update work item metadata with fix status
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'fixIssues' as const,
            taskName: 'Fix Issues',
            issuesFixed: payload.issuesFixed,
          },
        })
      }
    },
  )

export const fixIssuesWorkItem = Builder.workItem('fixIssues').withActions(
  fixIssuesActions.build(),
)

/**
 * fixIssues task - Fix issues identified during QA testing
 * Loops back to qaTest after completion
 */
export const fixIssuesTask = Builder.task(fixIssuesWorkItem).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    const campaign = await getCampaignByWorkflowId(
      mutationCtx.db,
      parent.workflow.id,
    )
    invariant(campaign, 'CAMPAIGN_NOT_FOUND')

    const workItemId = await workItem.initialize()

    await initializeCampaignWorkItemAuth(mutationCtx, workItemId, {
      scope: 'campaign:ops',
      campaignId: campaign._id,
      payload: {
        type: 'fixIssues',
        taskName: 'Fix Issues',
        issuesFixed: undefined,
      },
    })
  },
})
