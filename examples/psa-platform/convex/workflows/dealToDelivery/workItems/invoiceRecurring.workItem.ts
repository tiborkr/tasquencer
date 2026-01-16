import { Builder } from '../../../tasquencer'

/**
 * Auto-generate draft on schedule
 */
export const invoiceRecurringWorkItem = Builder.workItem('invoiceRecurring')

export const invoiceRecurringTask = Builder.task(invoiceRecurringWorkItem)
