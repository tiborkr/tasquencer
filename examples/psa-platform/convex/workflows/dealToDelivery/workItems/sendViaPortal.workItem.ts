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
const sendViaPortalPolicy = authService.policies.requireScope(
  'dealToDelivery:invoices:send'
)

// Schema for portal publishing
const sendViaPortalPayloadSchema = z.object({
  invoiceId: z.string(),
  clientUserId: z.string().optional(), // Specific client user to notify
  notifyAllContacts: z.boolean().optional(), // Or notify all company contacts
  portalMessage: z.string().optional(),
})

const sendViaPortalActions = authService.builders.workItemActions
  // Start action - claim the work item
  .start(z.never(), sendViaPortalPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - publish invoice to client portal
  .complete(
    sendViaPortalPayloadSchema,
    sendViaPortalPolicy,
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

      // Generate portal URL (in a real implementation, this would be a proper portal link)
      const portalUrl = `/portal/invoices/${invoiceId}`

      // Update invoice status to Sent
      await updateInvoice(mutationCtx.db, invoiceId, {
        status: 'Sent',
        sentAt: now,
      })

      // Update metadata with portal details
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...metadata.payload,
          clientUserId: payload.clientUserId as Id<'users'> | undefined,
          notifyAllContacts: payload.notifyAllContacts,
          portalMessage: payload.portalMessage,
          portalUrl,
          publishedAt: now,
          publishedBy: userId as Id<'users'>,
        } as typeof metadata.payload,
      })

      // In a real implementation, this would:
      // 1. Create portal invoice view link with access token
      // 2. Set invoice as visible in client portal
      // 3. Send portal notification email to client contacts
      //    - If clientUserId specified, notify that specific user
      //    - If notifyAllContacts, notify all company contacts
      // 4. Track first view timestamp when client accesses portal
    }
  )

export const sendViaPortalWorkItem = Builder.workItem('sendViaPortal')
  .withActions(sendViaPortalActions.build())

export const sendViaPortalTask = Builder.task(sendViaPortalWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:invoices:send',
        payload: {
          type: 'sendViaPortal',
          taskName: 'Publish Invoice to Portal',
          invoiceId: '' as Id<'invoices'>,
        },
      })
    },
  })
