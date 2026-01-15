import { Builder } from '../../../tasquencer'

/**
 * Lock and finalize invoice for sending
 */
export const finalizeInvoiceWorkItem = Builder.workItem('finalizeInvoice')

export const finalizeInvoiceTask = Builder.task(finalizeInvoiceWorkItem)
