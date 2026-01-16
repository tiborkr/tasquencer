import { Builder } from '../../../tasquencer'

export const syncParallelTasksWorkItem = Builder.workItem('syncParallelTasks')

export const syncParallelTasksTask = Builder.task(syncParallelTasksWorkItem)
