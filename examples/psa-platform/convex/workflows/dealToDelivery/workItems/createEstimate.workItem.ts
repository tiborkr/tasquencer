import { Builder } from '../../../tasquencer'

export const createEstimateWorkItem = Builder.workItem('createEstimate')

export const createEstimateTask = Builder.task(createEstimateWorkItem)
