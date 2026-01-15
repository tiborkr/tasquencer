import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getDeal,
  getDealByWorkflowId,
  updateDeal,
} from '../db'
import { initializeDealToDeliveryWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'

// Policy: requires deals:close scope (archiving is part of closing deals)
const archiveDealPolicy = authService.policies.requireScope('dealToDelivery:deals:close')

// Schema for the complete action payload
const archiveDealPayloadSchema = z.object({
  archiveReason: z.string().min(10, 'Archive reason must be at least 10 characters'),
  lessonsLearned: z.string().optional(),
})

const archiveDealActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), archiveDealPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    // Claim the work item for this user
    await DealToDeliveryWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      userId,
    )
    await workItem.start()
  })
  // Complete action - archive the deal
  .complete(
    archiveDealPayloadSchema,
    archiveDealPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      // Verify the user has claimed this work item
      const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id,
      )
      invariant(metadata, 'WORK_ITEM_METADATA_NOT_FOUND')

      const claimedBy = isHumanClaim(metadata.claim)
        ? metadata.claim.userId
        : null
      if (!claimedBy || claimedBy !== userId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }

      // Get the deal from metadata
      const dealId = metadata.aggregateTableId
      invariant(dealId, 'DEAL_ID_NOT_FOUND')

      const deal = await getDeal(mutationCtx.db, dealId)
      invariant(deal, 'DEAL_NOT_FOUND')

      // Build archive notes including lessons learned if provided
      const archiveNotes = payload.lessonsLearned
        ? `${payload.archiveReason}\n\nLessons Learned:\n${payload.lessonsLearned}`
        : payload.archiveReason

      // Update deal to archived state
      // If not already Lost, set to Lost
      const updates: Parameters<typeof updateDeal>[2] = {
        closedAt: Date.now(),
        lostReason: deal.lostReason
          ? `${deal.lostReason}\n\nArchive Notes:\n${archiveNotes}`
          : archiveNotes,
      }

      if (deal.stage !== 'Lost') {
        updates.stage = 'Lost'
        updates.probability = 0
      }

      await updateDeal(mutationCtx.db, dealId, updates)
    },
  )

export const archiveDealWorkItem = Builder.workItem('archiveDeal')
  .withActions(archiveDealActions.build())

export const archiveDealTask = Builder.task(archiveDealWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Find the deal linked to this workflow
      const workflowId = parent.workflow.id
      const deal = await getDealByWorkflowId(mutationCtx.db, workflowId)
      invariant(deal, 'DEAL_NOT_FOUND_FOR_WORKFLOW')

      // Initialize work item with the dealId
      await initializeDealToDeliveryWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:deals:close',
        dealId: deal._id,
        payload: {
          type: 'archiveDeal',
          taskName: 'Archive Deal',
          dealId: deal._id,
        },
      })
    },
  })
