import { Builder } from '../../../tasquencer'

export const approveTimesheetWorkItem = Builder.workItem('approveTimesheet')

export const approveTimesheetTask = Builder.task(approveTimesheetWorkItem)
