import { Builder } from '../../../tasquencer'

export const createProjectWorkItem = Builder.workItem('createProject')

export const createProjectTask = Builder.task(createProjectWorkItem)
