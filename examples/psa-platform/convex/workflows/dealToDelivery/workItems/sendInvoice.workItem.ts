import { Builder } from '../../../tasquencer'

export const sendInvoiceWorkItem = Builder.workItem('sendInvoice')

export const sendInvoiceTask = Builder.task(sendInvoiceWorkItem)
