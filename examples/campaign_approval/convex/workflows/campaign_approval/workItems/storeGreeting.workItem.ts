import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { getUcampaignUapprovalByWorkflowId, updateUcampaignUapprovalMessage } from '../db'
import { initializeUcampaignUapprovalWorkItemAuth } from './authHelpers'
import { UcampaignUapprovalWorkItemHelpers } from '../helpers'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'

const storeWritePolicy = authService.policies.requireScope('LUcampaignUapproval:write')

const storeUcampaignUapprovalActions = authService.builders.workItemActions
  .start(z.never(), storeWritePolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)

    const userId = authUser.userId

    invariant(userId, 'USER_DOES_NOT_EXIST')

    await UcampaignUapprovalWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      userId,
    )
    await workItem.start()
  })
  .complete(
    z.object({
      message: z.string().min(1, 'Message is required'),
    }),
    storeWritePolicy,
    async ({ mutationCtx, workItem, parent }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)

      const userId = authUser.userId

      invariant(userId, 'USER_DOES_NOT_EXIST')

      // Verify the user has claimed this work item
      const metadata = await UcampaignUapprovalWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id,
      )
      const claimedBy = isHumanClaim(metadata?.claim)
        ? metadata.claim.userId
        : null
      if (!claimedBy || claimedBy !== userId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }

      // Get the LUcampaignUapproval and update the message
      const LUcampaignUapproval = await getUcampaignUapprovalByWorkflowId(
        mutationCtx.db,
        parent.workflow.id,
      )

      invariant(LUcampaignUapproval, 'GREETING_NOT_FOUND')

      await updateUcampaignUapprovalMessage(mutationCtx.db, LUcampaignUapproval._id, payload.message)
    },
  )

export const storeUcampaignUapprovalWorkItem = Builder.workItem(
  'storeUcampaignUapproval',
).withActions(storeUcampaignUapprovalActions.build())

export const storeUcampaignUapprovalTask = Builder.task(
  storeUcampaignUapprovalWorkItem,
).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    // Initialize the work item when the task is enabled
    const LUcampaignUapproval = await getUcampaignUapprovalByWorkflowId(
      mutationCtx.db,
      parent.workflow.id,
    )

    invariant(LUcampaignUapproval, 'GREETING_NOT_FOUND')

    const workItemId = await workItem.initialize()

    await initializeUcampaignUapprovalWorkItemAuth(mutationCtx, workItemId, {
      scope: 'LUcampaignUapproval:write',
      LUcampaignUapprovalId: LUcampaignUapproval._id,
      payload: {
        type: 'storeUcampaignUapproval',
        taskName: 'Store UcampaignUapproval',
      },
    })
  },
})
