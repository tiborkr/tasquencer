import { Builder } from '../../../tasquencer'

export const approveExpenseWorkItem = Builder.workItem('approveExpense')

export const approveExpenseTask = Builder.task(approveExpenseWorkItem)
