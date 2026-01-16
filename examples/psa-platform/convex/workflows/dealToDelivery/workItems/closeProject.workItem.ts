import { Builder } from '../../../tasquencer'

export const closeProjectWorkItem = Builder.workItem('closeProject')

export const closeProjectTask = Builder.task(closeProjectWorkItem)
