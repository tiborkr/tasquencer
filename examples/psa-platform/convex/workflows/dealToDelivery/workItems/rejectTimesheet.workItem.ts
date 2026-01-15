import { Builder } from '../../../tasquencer'

export const rejectTimesheetWorkItem = Builder.workItem('rejectTimesheet')

export const rejectTimesheetTask = Builder.task(rejectTimesheetWorkItem)
