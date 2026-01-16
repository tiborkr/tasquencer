import { Builder } from '../../../tasquencer'

/**
 * Create draft by budget amount or remaining budget
 */
export const invoiceFixedFeeWorkItem = Builder.workItem('invoiceFixedFee')

export const invoiceFixedFeeTask = Builder.task(invoiceFixedFeeWorkItem)
