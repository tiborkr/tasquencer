import { Builder } from '../../../tasquencer'

/**
 * Determine invoicing method for this billing cycle
 */
export const selectInvoicingMethodWorkItem = Builder.workItem('selectInvoicingMethod')

export const selectInvoicingMethodTask = Builder.task(selectInvoicingMethodWorkItem)
