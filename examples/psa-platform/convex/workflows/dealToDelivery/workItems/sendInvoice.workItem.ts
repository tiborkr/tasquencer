import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { getInvoice } from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires invoices:send scope
const sendInvoicePolicy = authService.policies.requireScope(
  'dealToDelivery:invoices:send'
)

// Schema for selecting delivery method
const sendInvoicePayloadSchema = z.object({
  invoiceId: z.string(),
  method: z.enum(['email', 'pdf', 'portal']),
})

const sendInvoiceActions = authService.builders.workItemActions
  // Start action - claim the work item
  .start(z.never(), sendInvoicePolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - select delivery method
  .complete(
    sendInvoicePayloadSchema,
    sendInvoicePolicy,
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

      // Verify invoice is finalized and ready to send
      if (invoice.status !== 'Finalized') {
        throw new Error('INVOICE_NOT_FINALIZED')
      }

      // Update metadata with selected method
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...metadata.payload,
          selectedMethod: payload.method,
          selectedBy: userId as Id<'users'>,
          selectedAt: Date.now(),
        } as typeof metadata.payload,
      })
    }
  )

export const sendInvoiceWorkItem = Builder.workItem('sendInvoice')
  .withActions(sendInvoiceActions.build())

export const sendInvoiceTask = Builder.task(sendInvoiceWorkItem)
  .withSplitType('or')
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:invoices:send',
        payload: {
          type: 'sendInvoice',
          taskName: 'Send Invoice',
          invoiceId: '' as Id<'invoices'>,
        },
      })
    },
  })
