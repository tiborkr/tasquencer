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
const sendViaEmailPolicy = authService.policies.requireScope(
  'dealToDelivery:invoices:send'
)

// Schema for email delivery
const sendViaEmailPayloadSchema = z.object({
  invoiceId: z.string(),
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  ccEmails: z.array(z.string().email()).optional(),
  personalMessage: z.string().optional(),
  attachPdf: z.boolean().default(true),
  includePaymentLink: z.boolean().optional(),
})

const sendViaEmailActions = authService.builders.workItemActions
  // Start action - claim the work item
  .start(z.never(), sendViaEmailPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - send invoice via email
  .complete(
    sendViaEmailPayloadSchema,
    sendViaEmailPolicy,
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

      // Generate a tracking ID for email open/click tracking
      const trackingId = `track-${invoiceId}-${now}`

      // Update invoice status to Sent
      await updateInvoice(mutationCtx.db, invoiceId, {
        status: 'Sent',
        sentAt: now,
      })

      // Update metadata with email details
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...metadata.payload,
          recipientEmail: payload.recipientEmail,
          recipientName: payload.recipientName,
          ccEmails: payload.ccEmails,
          personalMessage: payload.personalMessage,
          attachPdf: payload.attachPdf,
          includePaymentLink: payload.includePaymentLink,
          sentAt: now,
          sentBy: userId as Id<'users'>,
          trackingId,
        } as typeof metadata.payload,
      })

      // In a real implementation, this would:
      // 1. Generate PDF from invoice template
      // 2. Compose email with template
      // 3. Send email via email service (SendGrid, etc.)
      // 4. Store tracking pixel/link for view detection
    }
  )

export const sendViaEmailWorkItem = Builder.workItem('sendViaEmail')
  .withActions(sendViaEmailActions.build())

export const sendViaEmailTask = Builder.task(sendViaEmailWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:invoices:send',
        payload: {
          type: 'sendViaEmail',
          taskName: 'Send Invoice via Email',
          invoiceId: '' as Id<'invoices'>,
        },
      })
    },
  })
