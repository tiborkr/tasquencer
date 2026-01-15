import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getInvoice,
  updateInvoice,
  listInvoiceLineItemsByInvoice,
  insertInvoiceLineItem,
  updateInvoiceLineItem,
  deleteInvoiceLineItem,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires invoices:edit scope
const editDraftPolicy = authService.policies.requireScope(
  'dealToDelivery:invoices:edit'
)

// Schema for editing draft invoice
const lineItemChangeSchema = z.object({
  id: z.string().optional(), // Existing line item ID (optional for new items)
  action: z.enum(['add', 'update', 'remove']),
  description: z.string().optional(),
  quantity: z.number().optional(),
  rate: z.number().optional(),
})

const editDraftPayloadSchema = z.object({
  invoiceId: z.string(),
  changes: z.object({
    lineItems: z.array(lineItemChangeSchema).optional(),
    dueDate: z.number().optional(),
    notes: z.string().optional(),
    discount: z.object({
      type: z.enum(['percentage', 'fixed']),
      value: z.number(),
    }).optional(),
  }),
})

const editDraftActions = authService.builders.workItemActions
  // Start action
  .start(z.never(), editDraftPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - apply edits to draft invoice
  .complete(
    editDraftPayloadSchema,
    editDraftPolicy,
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

      // Apply line item changes
      if (payload.changes.lineItems) {
        const existingLineItems = await listInvoiceLineItemsByInvoice(mutationCtx.db, invoiceId)
        let maxSortOrder = existingLineItems.length > 0
          ? Math.max(...existingLineItems.map(li => li.sortOrder))
          : -1

        for (const change of payload.changes.lineItems) {
          if (change.action === 'add') {
            invariant(change.description, 'LINE_ITEM_DESCRIPTION_REQUIRED')
            invariant(change.quantity !== undefined, 'LINE_ITEM_QUANTITY_REQUIRED')
            invariant(change.rate !== undefined, 'LINE_ITEM_RATE_REQUIRED')

            const amount = Math.round(change.quantity * change.rate)
            maxSortOrder++

            await insertInvoiceLineItem(mutationCtx.db, {
              invoiceId,
              description: change.description,
              quantity: change.quantity,
              rate: change.rate,
              amount,
              sortOrder: maxSortOrder,
            })
          } else if (change.action === 'update' && change.id) {
            const lineItemId = change.id as Id<'invoiceLineItems'>
            const updates: Record<string, unknown> = {}

            if (change.description !== undefined) {
              updates.description = change.description
            }
            if (change.quantity !== undefined) {
              updates.quantity = change.quantity
            }
            if (change.rate !== undefined) {
              updates.rate = change.rate
            }

            // Recalculate amount if quantity or rate changed
            const existingItem = existingLineItems.find(li => li._id === lineItemId)
            if (existingItem) {
              const newQuantity = change.quantity ?? existingItem.quantity
              const newRate = change.rate ?? existingItem.rate
              updates.amount = Math.round(newQuantity * newRate)
            }

            if (Object.keys(updates).length > 0) {
              await updateInvoiceLineItem(mutationCtx.db, lineItemId, updates)
            }
          } else if (change.action === 'remove' && change.id) {
            await deleteInvoiceLineItem(mutationCtx.db, change.id as Id<'invoiceLineItems'>)
          }
        }
      }

      // Recalculate totals
      const updatedLineItems = await listInvoiceLineItemsByInvoice(mutationCtx.db, invoiceId)
      let subtotal = updatedLineItems.reduce((sum, li) => sum + li.amount, 0)

      // Apply discount if specified
      let discountAmount = 0
      if (payload.changes.discount) {
        if (payload.changes.discount.type === 'percentage') {
          discountAmount = Math.round(subtotal * (payload.changes.discount.value / 100))
        } else {
          discountAmount = payload.changes.discount.value
        }
        subtotal -= discountAmount
      }

      // Update invoice (no tax calculation for now)
      const invoiceUpdates: Record<string, unknown> = {
        subtotal,
        total: subtotal,
      }

      if (payload.changes.dueDate !== undefined) {
        invoiceUpdates.dueDate = payload.changes.dueDate
      }

      await updateInvoice(mutationCtx.db, invoiceId, invoiceUpdates)

      // Update metadata
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          ...metadata.payload,
          edited: true,
          newTotal: subtotal,
          editedBy: userId as Id<'users'>,
          editedAt: Date.now(),
        } as typeof metadata.payload,
      })
    }
  )

export const editDraftWorkItem = Builder.workItem('editDraft')
  .withActions(editDraftActions.build())

export const editDraftTask = Builder.task(editDraftWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:invoices:edit',
        payload: {
          type: 'editDraft',
          taskName: 'Edit Invoice Draft',
          invoiceId: '' as Id<'invoices'>,
        },
      })
    },
  })
