import { Builder } from '../../../tasquencer'

export const submitExpenseWorkItem = Builder.workItem('submitExpense')

export const submitExpenseTask = Builder.task(submitExpenseWorkItem)
