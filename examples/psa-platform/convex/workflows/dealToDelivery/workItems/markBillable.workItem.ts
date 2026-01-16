import { Builder } from '../../../tasquencer'

export const markBillableWorkItem = Builder.workItem('markBillable')

export const markBillableTask = Builder.task(markBillableWorkItem)
