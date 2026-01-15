import { Builder } from '../../../tasquencer'

export const rejectExpenseWorkItem = Builder.workItem('rejectExpense')

export const rejectExpenseTask = Builder.task(rejectExpenseWorkItem)
