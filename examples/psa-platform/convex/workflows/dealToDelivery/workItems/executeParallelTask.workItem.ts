import { Builder } from '../../../tasquencer'

export const executeParallelTaskWorkItem = Builder.workItem('executeParallelTask')

export const executeParallelTaskTask = Builder.task(executeParallelTaskWorkItem)
