import { Builder } from '../../../tasquencer'

export const createDealWorkItem = Builder.workItem('createDeal')

export const createDealTask = Builder.task(createDealWorkItem)
