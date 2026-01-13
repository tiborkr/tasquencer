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
 * qaTest work item - Test all components end-to-end
 * Required scope: campaign:ops
 *
 * Part of Phase 5 Technical Setup.
 * Runs after all parallel tasks (buildInfra, configAnalytics, setupMedia) complete.
 * XOR routing: passed -> Phase 6 Launch, failed -> fixIssues
 */

const qaTestPolicy = authService.policies.requireScope('campaign:ops')

const qaTestActions = authService.builders.workItemActions
  .start(z.never(), qaTestPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await CampaignWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      result: z.enum(['passed', 'failed']),
      testResults: z.string().optional(),
    }),
    qaTestPolicy,
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

      // Update campaign status if tests passed
      if (payload.result === 'passed') {
        await updateCampaign(mutationCtx.db, campaign._id, {
          status: 'pre_launch',
        })
      }

      // Update work item metadata with test results
      if (metadata) {
        await mutationCtx.db.patch(metadata._id, {
          payload: {
            type: 'qaTest' as const,
            taskName: 'QA Testing',
            decision: payload.result,
            testResults: payload.testResults,
          },
        })
      }
    },
  )

export const qaTestWorkItem = Builder.workItem('qaTest').withActions(
  qaTestActions.build(),
)

/**
 * qaTest task - QA testing with XOR routing based on pass/fail
 * Uses XOR join to accept input from either setupJoin or fixIssues loop
 * Uses XOR split to route to Phase 6 (passed) or fixIssues (failed)
 */
export const qaTestTask = Builder.task(qaTestWorkItem)
  .withJoinType('xor')
  .withSplitType('xor')
  .withActivities({
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
          type: 'qaTest',
          taskName: 'QA Testing',
          decision: undefined,
          testResults: undefined,
        },
      })
    },
  })
