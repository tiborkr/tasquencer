import { Builder } from '../../../tasquencer'

export const selectExpenseTypeWorkItem = Builder.workItem('selectExpenseType')

export const selectExpenseTypeTask = Builder.task(selectExpenseTypeWorkItem)
