import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProject,
  getBudgetByProject,
  listApprovedBillableTimeEntriesForInvoicing,
  listApprovedBillableExpensesForInvoicing,
  listMilestonesByProject,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires invoices:view scope
const checkMoreBillingPolicy = authService.policies.requireScope(
  'dealToDelivery:invoices:view:all'
)

// Schema for checking more billing
const checkMoreBillingPayloadSchema = z.object({
  projectId: z.string(),
})

const checkMoreBillingActions = authService.builders.workItemActions
  // Start action - claim the work item
  .start(z.never(), checkMoreBillingPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    await DealToDeliveryWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      userId
    )
    await workItem.start()
  })
  // Complete action - check if more billing cycles are needed
  .complete(
    checkMoreBillingPayloadSchema,
    checkMoreBillingPolicy,
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
      const project = await getProject(mutationCtx.db, projectId)
      invariant(project, 'PROJECT_NOT_FOUND')

      // Check for uninvoiced items
      const uninvoicedTime = await listApprovedBillableTimeEntriesForInvoicing(
        mutationCtx.db,
        projectId
      )
      const uninvoicedExpenses = await listApprovedBillableExpensesForInvoicing(
        mutationCtx.db,
        projectId
      )

      // Check for unpaid milestones
      const milestones = await listMilestonesByProject(mutationCtx.db, projectId)
      const unpaidMilestones = milestones.filter(
        (m) => m.completedAt && !m.invoiceId
      )

      // Check for recurring billing (Retainer budgets)
      const budget = await getBudgetByProject(mutationCtx.db, projectId)
      const isRetainer = budget?.type === 'Retainer'
      // In a real implementation, would check if next billing cycle is due
      // For simplicity, if it's a retainer and project is active, assume recurring is due
      const isRecurringDue = isRetainer && project.status === 'Active'

      // Determine if more billing is needed
      const moreBillingCycles =
        uninvoicedTime.length > 0 ||
        uninvoicedExpenses.length > 0 ||
        unpaidMilestones.length > 0 ||
        isRecurringDue

      const now = Date.now()

      // Update metadata with check results
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...metadata.payload,
          moreBillingCycles,
          uninvoicedTimeCount: uninvoicedTime.length,
          uninvoicedExpenseCount: uninvoicedExpenses.length,
          unpaidMilestoneCount: unpaidMilestones.length,
          isRecurringDue,
          checkedAt: now,
        } as typeof metadata.payload,
      })
    }
  )

export const checkMoreBillingWorkItem = Builder.workItem('checkMoreBilling')
  .withActions(checkMoreBillingActions.build())

export const checkMoreBillingTask = Builder.task(checkMoreBillingWorkItem)
  .withSplitType('xor')
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:invoices:view:all',
        payload: {
          type: 'checkMoreBilling',
          taskName: 'Check More Billing',
          projectId: '' as Id<'projects'>,
        },
      })
    },
  })
