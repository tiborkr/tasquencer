import { Builder } from '../../../tasquencer'

export const getChangeOrderApprovalWorkItem = Builder.workItem('getChangeOrderApproval')

export const getChangeOrderApprovalTask = Builder.task(getChangeOrderApprovalWorkItem)
