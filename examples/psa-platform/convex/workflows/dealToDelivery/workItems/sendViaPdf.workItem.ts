import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { getInvoice, updateInvoice } from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires invoices:send scope
const sendViaPdfPolicy = authService.policies.requireScope(
  'dealToDelivery:invoices:send'
)

// Schema for PDF generation
const sendViaPdfPayloadSchema = z.object({
  invoiceId: z.string(),
  markAsSent: z.boolean().default(false),
})

const sendViaPdfActions = authService.builders.workItemActions
  // Start action - claim the work item
  .start(z.never(), sendViaPdfPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - generate PDF for manual delivery
  .complete(
    sendViaPdfPayloadSchema,
    sendViaPdfPolicy,
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

      // Verify invoice is finalized
      if (invoice.status !== 'Finalized') {
        throw new Error('INVOICE_NOT_FINALIZED')
      }

      const now = Date.now()

      // Generate PDF URL (in a real implementation, this would generate actual PDF)
      // The PDF would include: org header/logo, client billing address, invoice number,
      // line items with descriptions, subtotal/tax/total, payment instructions, due date
      const pdfUrl = `/invoices/${invoiceId}/download?t=${now}`

      // If markAsSent is true, update invoice status
      if (payload.markAsSent) {
        await updateInvoice(mutationCtx.db, invoiceId, {
          status: 'Sent',
          sentAt: now,
        })
      }

      // Update metadata with PDF details
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...metadata.payload,
          pdfUrl,
          markAsSent: payload.markAsSent,
          generatedAt: now,
          generatedBy: userId as Id<'users'>,
        } as typeof metadata.payload,
      })

      // In a real implementation, this would:
      // 1. Generate PDF using invoice template with:
      //    - Organization header/logo
      //    - Client billing address
      //    - Invoice number and date
      //    - Line items with descriptions
      //    - Subtotal, tax, total
      //    - Payment instructions
      //    - Due date
      // 2. Store the PDF in file storage
      // 3. Return download URL
    }
  )

export const sendViaPdfWorkItem = Builder.workItem('sendViaPdf')
  .withActions(sendViaPdfActions.build())

export const sendViaPdfTask = Builder.task(sendViaPdfWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:invoices:send',
        payload: {
          type: 'sendViaPdf',
          taskName: 'Generate Invoice PDF',
          invoiceId: '' as Id<'invoices'>,
        },
      })
    },
  })
