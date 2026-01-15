import { Builder } from '../../../tasquencer'

export const executeTaskWorkItem = Builder.workItem('executeTask')

export const executeTaskTask = Builder.task(executeTaskWorkItem)
