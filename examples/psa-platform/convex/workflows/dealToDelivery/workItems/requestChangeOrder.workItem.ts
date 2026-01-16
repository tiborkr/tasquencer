import { Builder } from '../../../tasquencer'

export const requestChangeOrderWorkItem = Builder.workItem('requestChangeOrder')

export const requestChangeOrderTask = Builder.task(requestChangeOrderWorkItem)
