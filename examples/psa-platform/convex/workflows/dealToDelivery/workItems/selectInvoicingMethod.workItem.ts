import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { getBudgetByProject } from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires invoices:create scope
const selectInvoicingMethodPolicy = authService.policies.requireScope(
  'dealToDelivery:invoices:create'
)

// Schema for selecting invoicing method
// User can specify a method or let it default to budget type
const selectInvoicingMethodPayloadSchema = z.object({
  projectId: z.string(),
  method: z.enum(['TimeAndMaterials', 'FixedFee', 'Milestone', 'Recurring']).optional(),
})

const selectInvoicingMethodActions = authService.builders.workItemActions
  // Start action - finance user claims the work item
  .start(z.never(), selectInvoicingMethodPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    // Claim the work item for this user
    await DealToDeliveryWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      userId
    )
    await workItem.start()
  })
  // Complete action - user selects the invoicing method
  .complete(
    selectInvoicingMethodPayloadSchema,
    selectInvoicingMethodPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      // Verify the user has claimed this work item
      const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id
      )
      invariant(metadata, 'WORK_ITEM_METADATA_NOT_FOUND')

      const claimedBy = isHumanClaim(metadata?.claim)
        ? metadata.claim.userId
        : null
      if (!claimedBy || claimedBy !== userId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }

      const projectId = payload.projectId as Id<'projects'>

      // If method provided, use it; otherwise default to budget type
      let method = payload.method
      if (!method) {
        const budget = await getBudgetByProject(mutationCtx.db, projectId)
        if (budget) {
          // Map budget type to invoice method
          // Budget types: TimeAndMaterials, FixedFee, Retainer
          // Invoice methods: TimeAndMaterials, FixedFee, Milestone, Recurring
          if (budget.type === 'Retainer') {
            method = 'Recurring'
          } else {
            method = budget.type
          }
        } else {
          // Default to T&M if no budget
          method = 'TimeAndMaterials'
        }
      }

      // Update metadata with selected method for routing
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...metadata.payload,
          selectedMethod: method,
        } as typeof metadata.payload,
      })
    }
  )

export const selectInvoicingMethodWorkItem = Builder.workItem('selectInvoicingMethod')
  .withActions(selectInvoicingMethodActions.build())

export const selectInvoicingMethodTask = Builder.task(selectInvoicingMethodWorkItem)
  .withSplitType('xor')
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Get project from parent workflow context
      // For now, we store a placeholder projectId that should be set by the triggering context
      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:invoices:create',
        payload: {
          type: 'selectInvoicingMethod',
          taskName: 'Select Invoicing Method',
          projectId: '' as Id<'projects'>, // Will be set by workflow context
        },
      })
    },
  })
