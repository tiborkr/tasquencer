import { Builder } from '../../../tasquencer'

export const getNextTaskWorkItem = Builder.workItem('getNextTask')

export const getNextTaskTask = Builder.task(getNextTaskWorkItem)
