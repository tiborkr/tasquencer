import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { getInvoice, listInvoiceLineItemsByInvoice } from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires invoices:view:all scope
const reviewDraftPolicy = authService.policies.requireScope(
  'dealToDelivery:invoices:view:all'
)

// Schema for reviewing draft invoice
const reviewDraftPayloadSchema = z.object({
  invoiceId: z.string(),
  approved: z.boolean(),
  comments: z.string().optional(),
})

const reviewDraftActions = authService.builders.workItemActions
  // Start action - finance user claims the work item to review
  .start(z.never(), reviewDraftPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - user submits their review decision
  .complete(
    reviewDraftPayloadSchema,
    reviewDraftPolicy,
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

      // Get line items for review
      const lineItems = await listInvoiceLineItemsByInvoice(mutationCtx.db, invoiceId)

      // Store the review decision in metadata for routing
      // The XOR routing will use this to determine next task
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...metadata.payload,
          approved: payload.approved,
          reviewComments: payload.comments,
          reviewedBy: userId as Id<'users'>,
          reviewedAt: Date.now(),
          lineItemCount: lineItems.length,
        } as typeof metadata.payload,
      })
    }
  )

export const reviewDraftWorkItem = Builder.workItem('reviewDraft')
  .withActions(reviewDraftActions.build())

export const reviewDraftTask = Builder.task(reviewDraftWorkItem)
  .withJoinType('xor') // XOR join for multiple paths leading here
  .withSplitType('xor') // XOR split for edit/finalize paths
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:invoices:view:all',
        payload: {
          type: 'reviewDraft',
          taskName: 'Review Invoice Draft',
          invoiceId: '' as Id<'invoices'>,
        },
      })
    },
  })
