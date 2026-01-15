import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getDeal,
  getDealByWorkflowId,
  getEstimate,
  listEstimateServicesByEstimate,
  insertProject,
  insertBudget,
  insertService,
  updateProject,
} from '../db'
import { initializeDealToDeliveryWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires projects:create scope
const createProjectPolicy = authService.policies.requireScope('dealToDelivery:projects:create')

// Schema for the complete action payload
const createProjectPayloadSchema = z.object({
  budgetType: z.enum(['TimeAndMaterials', 'FixedFee', 'Retainer']).optional(),
})

const createProjectActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), createProjectPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - create project from won deal
  .complete(
    createProjectPayloadSchema,
    createProjectPolicy,
    async ({ mutationCtx, workItem, parent }, payload) => {
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
      invariant(deal.stage === 'Won', 'DEAL_MUST_BE_WON')
      invariant(deal.estimateId, 'DEAL_HAS_NO_ESTIMATE')

      // Get estimate and services
      const estimate = await getEstimate(mutationCtx.db, deal.estimateId)
      invariant(estimate, 'ESTIMATE_NOT_FOUND')

      const estimateServices = await listEstimateServicesByEstimate(mutationCtx.db, deal.estimateId)
      invariant(estimateServices.length > 0, 'ESTIMATE_HAS_NO_SERVICES')

      // Get the workflow ID to link the project to the workflow
      const workflowId = parent.workflow.id

      // Create the project with Planning status
      const projectId = await insertProject(mutationCtx.db, {
        organizationId: deal.organizationId,
        companyId: deal.companyId,
        dealId: dealId,
        name: deal.name,
        status: 'Planning',
        startDate: Date.now(),
        managerId: userId as Id<'users'>,
        createdAt: Date.now(),
        workflowId, // Link project to workflow for downstream tasks
      })

      // Determine budget type (default to TimeAndMaterials)
      const budgetType = payload.budgetType ?? 'TimeAndMaterials'

      // Calculate total amount from estimate services
      const totalAmount = estimateServices.reduce((sum, service) => {
        return sum + service.total
      }, 0)

      // Create the budget
      const budgetId = await insertBudget(mutationCtx.db, {
        projectId,
        organizationId: deal.organizationId,
        type: budgetType,
        totalAmount,
        createdAt: Date.now(),
      })

      // Create service records from estimate services
      for (const estimateService of estimateServices) {
        await insertService(mutationCtx.db, {
          budgetId,
          organizationId: deal.organizationId,
          name: estimateService.name,
          rate: estimateService.rate,
          estimatedHours: estimateService.hours,
          totalAmount: estimateService.total,
        })
      }

      // Update project with budget reference
      await updateProject(mutationCtx.db, projectId, {
        budgetId,
      })

      // Note: Deal is linked to project via workflow, no need for explicit projectId on deal
    },
  )

export const createProjectWorkItem = Builder.workItem('createProject')
  .withActions(createProjectActions.build())

export const createProjectTask = Builder.task(createProjectWorkItem)
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
        scope: 'dealToDelivery:projects:create',
        dealId: deal._id,
        payload: {
          type: 'createProject',
          taskName: 'Create Project',
          dealId: deal._id,
        },
      })
    },
  })
