import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getInvoice,
  updateInvoice,
  insertPayment,
  getTotalPaymentsForInvoice,
  getProject,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires payments:record scope
const recordPaymentPolicy = authService.policies.requireScope(
  'dealToDelivery:payments:record'
)

// Schema for recording payment
const recordPaymentPayloadSchema = z.object({
  invoiceId: z.string(),
  amount: z.number().positive(), // Payment amount in cents
  date: z.number(), // Payment date
  method: z.enum(['Check', 'ACH', 'Wire', 'CreditCard', 'Cash', 'Other']),
  reference: z.string().optional(), // Check number, transaction ID, etc.
  notes: z.string().optional(),
})

const recordPaymentActions = authService.builders.workItemActions
  // Start action - claim the work item
  .start(z.never(), recordPaymentPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - record payment against invoice
  .complete(
    recordPaymentPayloadSchema,
    recordPaymentPolicy,
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

      // Invoice should be Sent or Viewed to record payment
      if (invoice.status !== 'Sent' && invoice.status !== 'Viewed') {
        throw new Error('INVOICE_NOT_SENT')
      }

      const project = await getProject(mutationCtx.db, invoice.projectId)
      invariant(project, 'PROJECT_NOT_FOUND')

      const now = Date.now()

      // Create payment record
      const paymentId = await insertPayment(mutationCtx.db, {
        organizationId: project.organizationId,
        invoiceId,
        amount: payload.amount,
        date: payload.date,
        method: payload.method,
        reference: payload.reference,
        syncedToAccounting: false,
        createdAt: now,
      })

      // Calculate total payments including this new one
      const previousTotal = await getTotalPaymentsForInvoice(
        mutationCtx.db,
        invoiceId
      )
      const totalPaid = previousTotal + payload.amount
      const remaining = invoice.total - totalPaid
      const fullyPaid = totalPaid >= invoice.total

      // Warn if overpayment
      if (totalPaid > invoice.total) {
        // In a real implementation, log this warning
        console.warn(
          `Overpayment detected on invoice ${invoiceId}: paid ${totalPaid}, total ${invoice.total}`
        )
      }

      // Update invoice status if fully paid
      if (fullyPaid) {
        await updateInvoice(mutationCtx.db, invoiceId, {
          status: 'Paid',
          paidAt: now,
        })
      }

      // Update metadata with payment details
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...metadata.payload,
          paymentId,
          amount: payload.amount,
          paymentDate: payload.date,
          paymentMethod: payload.method,
          reference: payload.reference,
          notes: payload.notes,
          fullyPaid,
          totalPaid,
          remaining: remaining > 0 ? remaining : 0,
          recordedBy: userId as Id<'users'>,
          recordedAt: now,
        } as typeof metadata.payload,
      })

      // In a real implementation, this would also:
      // 1. Sync payment to accounting system if integration enabled
      // 2. Generate payment receipt
      // 3. Send payment confirmation to client
    }
  )

export const recordPaymentWorkItem = Builder.workItem('recordPayment')
  .withActions(recordPaymentActions.build())

export const recordPaymentTask = Builder.task(recordPaymentWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:payments:record',
        payload: {
          type: 'recordPayment',
          taskName: 'Record Payment',
          invoiceId: '' as Id<'invoices'>,
        },
      })
    },
  })
