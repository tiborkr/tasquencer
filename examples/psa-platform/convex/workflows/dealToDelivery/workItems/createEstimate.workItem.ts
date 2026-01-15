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
  insertEstimate,
  insertEstimateService,
} from '../db'
import { initializeDealToDeliveryWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'

// Policy: requires estimates:create scope
const createEstimatePolicy = authService.policies.requireScope('dealToDelivery:estimates:create')

// Schema for individual service line item
const serviceSchema = z.object({
  name: z.string().min(1, 'Service name is required'),
  rate: z.number().int().min(0, 'Rate must be non-negative'), // cents per hour
  hours: z.number().min(0.25, 'Hours must be at least 0.25'),
})

// Schema for the complete action payload
const createEstimatePayloadSchema = z.object({
  services: z.array(serviceSchema).min(1, 'At least one service is required'),
  notes: z.string().optional(),
})

const createEstimateActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), createEstimatePolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - create estimate and services
  .complete(
    createEstimatePayloadSchema,
    createEstimatePolicy,
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

      // Calculate total from services
      const total = payload.services.reduce((sum, service) => {
        return sum + (service.rate * service.hours)
      }, 0)

      // Create the estimate
      const estimateId = await insertEstimate(mutationCtx.db, {
        organizationId: deal.organizationId,
        dealId: dealId,
        total,
        createdAt: Date.now(),
      })

      // Create estimate services
      for (const service of payload.services) {
        const serviceTotal = service.rate * service.hours
        await insertEstimateService(mutationCtx.db, {
          estimateId,
          name: service.name,
          rate: service.rate,
          hours: service.hours,
          total: serviceTotal,
        })
      }

      // Update deal with estimate reference and new value
      await updateDeal(mutationCtx.db, dealId, {
        estimateId,
        value: total, // Update deal value to match estimate total
      })
    },
  )

export const createEstimateWorkItem = Builder.workItem('createEstimate')
  .withActions(createEstimateActions.build())

export const createEstimateTask = Builder.task(createEstimateWorkItem)
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
        scope: 'dealToDelivery:estimates:create',
        dealId: deal._id,
        payload: {
          type: 'createEstimate',
          taskName: 'Create Estimate',
          dealId: deal._id,
        },
      })
    },
  })
