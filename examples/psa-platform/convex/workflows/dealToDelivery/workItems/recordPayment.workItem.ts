import { Builder } from '../../../tasquencer'

export const recordPaymentWorkItem = Builder.workItem('recordPayment')

export const recordPaymentTask = Builder.task(recordPaymentWorkItem)
