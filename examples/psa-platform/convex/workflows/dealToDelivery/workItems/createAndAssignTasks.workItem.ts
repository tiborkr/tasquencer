import { Builder } from '../../../tasquencer'

export const createAndAssignTasksWorkItem = Builder.workItem('createAndAssignTasks')

export const createAndAssignTasksTask = Builder.task(createAndAssignTasksWorkItem)
