import { Builder } from '../../../tasquencer'

export const setBudgetWorkItem = Builder.workItem('setBudget')

export const setBudgetTask = Builder.task(setBudgetWorkItem)
