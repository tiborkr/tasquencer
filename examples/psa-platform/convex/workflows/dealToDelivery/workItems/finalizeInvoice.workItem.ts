import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getInvoice,
  getProject,
  updateInvoice,
  getNextInvoiceNumber,
  listInvoiceLineItemsByInvoice,
  updateTimeEntry,
  updateExpense,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires invoices:finalize scope
const finalizeInvoicePolicy = authService.policies.requireScope(
  'dealToDelivery:invoices:finalize'
)

// Schema for finalizing invoice
const finalizeInvoicePayloadSchema = z.object({
  invoiceId: z.string(),
  dueDate: z.number().optional(), // Override default payment terms
  notes: z.string().optional(), // Final notes to client
})

const finalizeInvoiceActions = authService.builders.workItemActions
  // Start action
  .start(z.never(), finalizeInvoicePolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - finalize invoice and generate invoice number
  .complete(
    finalizeInvoicePayloadSchema,
    finalizeInvoicePolicy,
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

      const invoiceId = payload.invoiceId as Id<'invoices'>
      const invoice = await getInvoice(mutationCtx.db, invoiceId)
      invariant(invoice, 'INVOICE_NOT_FOUND')

      // Verify invoice is still in Draft status
      if (invoice.status !== 'Draft') {
        throw new Error('INVOICE_NOT_DRAFT')
      }

      const project = await getProject(mutationCtx.db, invoice.projectId)
      invariant(project, 'PROJECT_NOT_FOUND')

      // Generate invoice number
      const invoiceNumber = await getNextInvoiceNumber(
        mutationCtx.db,
        project.organizationId
      )

      // Update invoice to Finalized
      const finalizeUpdates: Record<string, unknown> = {
        status: 'Finalized',
        number: invoiceNumber,
        finalizedAt: Date.now(),
        finalizedBy: userId as Id<'users'>,
      }

      if (payload.dueDate !== undefined) {
        finalizeUpdates.dueDate = payload.dueDate
      }

      await updateInvoice(mutationCtx.db, invoiceId, finalizeUpdates)

      // Lock all linked time entries and expenses
      const lineItems = await listInvoiceLineItemsByInvoice(mutationCtx.db, invoiceId)

      for (const lineItem of lineItems) {
        // Lock time entries
        if (lineItem.timeEntryIds) {
          for (const timeEntryId of lineItem.timeEntryIds) {
            await updateTimeEntry(mutationCtx.db, timeEntryId, {
              status: 'Locked',
              invoiceId,
            })
          }
        }

        // Mark expenses as invoiced
        if (lineItem.expenseIds) {
          for (const expenseId of lineItem.expenseIds) {
            await updateExpense(mutationCtx.db, expenseId, {
              invoiceId,
            })
          }
        }
      }

      // Update metadata
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...metadata.payload,
          finalized: true,
          invoiceNumber,
          finalizedBy: userId as Id<'users'>,
          finalizedAt: Date.now(),
        } as typeof metadata.payload,
      })
    }
  )

export const finalizeInvoiceWorkItem = Builder.workItem('finalizeInvoice')
  .withActions(finalizeInvoiceActions.build())

export const finalizeInvoiceTask = Builder.task(finalizeInvoiceWorkItem)
  .withJoinType('xor')
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:invoices:finalize',
        payload: {
          type: 'finalizeInvoice',
          taskName: 'Finalize Invoice',
          invoiceId: '' as Id<'invoices'>,
        },
      })
    },
  })
