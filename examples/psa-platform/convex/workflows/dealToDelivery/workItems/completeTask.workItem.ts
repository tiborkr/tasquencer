import { Builder } from '../../../tasquencer'

export const completeTaskWorkItem = Builder.workItem('completeTask')

export const completeTaskTask = Builder.task(completeTaskWorkItem)
