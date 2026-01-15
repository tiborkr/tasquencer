import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getDealByWorkflowId,
  getProjectByWorkflowId,
  getBudgetByProject,
  updateBudget,
  listServicesByBudget,
  insertService,
  deleteService,
} from '../db'
import { initializeDealToDeliveryWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'

// Policy: requires budgets:create scope (or budgets:edit for modifying)
const setBudgetPolicy = authService.policies.requireScope('dealToDelivery:budgets:create')

// Schema for individual service
const serviceSchema = z.object({
  name: z.string().min(1, 'Service name is required'),
  rate: z.number().int().min(0, 'Rate must be non-negative'), // cents per hour
  estimatedHours: z.number().min(0.25, 'Estimated hours must be at least 0.25'),
})

// Schema for the complete action payload
const setBudgetPayloadSchema = z.object({
  type: z.enum(['TimeAndMaterials', 'FixedFee', 'Retainer']),
  services: z.array(serviceSchema).min(1, 'At least one service is required'),
})

const setBudgetActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), setBudgetPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - finalize budget with services
  .complete(
    setBudgetPayloadSchema,
    setBudgetPolicy,
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

      // Verify work item type for type safety
      invariant(metadata.payload.type === 'setBudget', 'INVALID_WORK_ITEM_TYPE')
      const projectId = metadata.payload.projectId

      // Get the budget for this project
      const budget = await getBudgetByProject(mutationCtx.db, projectId)
      invariant(budget, 'BUDGET_NOT_FOUND')

      // Calculate total amount from services
      const totalAmount = payload.services.reduce((sum, service) => {
        return sum + (service.rate * service.estimatedHours)
      }, 0)

      // Update budget type and total
      await updateBudget(mutationCtx.db, budget._id, {
        type: payload.type,
        totalAmount,
      })

      // Get existing services for this budget
      const existingServices = await listServicesByBudget(mutationCtx.db, budget._id)

      // Delete all existing services (we'll recreate them from the payload)
      for (const service of existingServices) {
        await deleteService(mutationCtx.db, service._id)
      }

      // Create new service records from payload
      for (const service of payload.services) {
        const serviceTotal = service.rate * service.estimatedHours
        await insertService(mutationCtx.db, {
          budgetId: budget._id,
          organizationId: budget.organizationId,
          name: service.name,
          rate: service.rate,
          estimatedHours: service.estimatedHours,
          totalAmount: serviceTotal,
        })
      }
    },
  )

export const setBudgetWorkItem = Builder.workItem('setBudget')
  .withActions(setBudgetActions.build())

export const setBudgetTask = Builder.task(setBudgetWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Find the deal linked to this workflow (aggregate root)
      const workflowId = parent.workflow.id
      const deal = await getDealByWorkflowId(mutationCtx.db, workflowId)
      invariant(deal, 'DEAL_NOT_FOUND_FOR_WORKFLOW')

      // Find the project linked to this workflow
      const project = await getProjectByWorkflowId(mutationCtx.db, workflowId)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      // Initialize work item with the dealId (aggregate root) and projectId in payload
      await initializeDealToDeliveryWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:budgets:create',
        dealId: deal._id,
        payload: {
          type: 'setBudget',
          taskName: 'Set Budget',
          projectId: project._id,
        },
      })
    },
  })
