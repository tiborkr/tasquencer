import { Builder } from '../../../tasquencer'

/**
 * Create draft for percentage of budget at milestone
 */
export const invoiceMilestoneWorkItem = Builder.workItem('invoiceMilestone')

export const invoiceMilestoneTask = Builder.task(invoiceMilestoneWorkItem)
