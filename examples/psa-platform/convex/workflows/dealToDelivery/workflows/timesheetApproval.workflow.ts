import { Builder } from '../../../tasquencer'
import { reviewTimesheetTask } from '../workItems/reviewTimesheet.workItem'
import { approveTimesheetTask } from '../workItems/approveTimesheet.workItem'
import { rejectTimesheetTask } from '../workItems/rejectTimesheet.workItem'
import { reviseTimesheetTask } from '../workItems/reviseTimesheet.workItem'
const completeApprovalTask = Builder.dummyTask()
export const timesheetApprovalWorkflow = Builder.workflow('timesheetApproval')
  .startCondition('start')
  .endCondition('end')
  .task('reviewTimesheet', reviewTimesheetTask.withJoinType('xor').withSplitType('xor'))
  .task('approveTimesheet', approveTimesheetTask)
  .task('rejectTimesheet', rejectTimesheetTask)
  .task('reviseTimesheet', reviseTimesheetTask)
  .dummyTask('completeApproval', completeApprovalTask)
  .connectCondition('start', (to) => to.task('reviewTimesheet'))
  .connectTask('reviewTimesheet', (to) =>
    to
      .task('approveTimesheet')
      .task('rejectTimesheet')
      .route(async ({ route }) => {
      const routes = [route.toTask('approveTimesheet'), route.toTask('rejectTimesheet')]
      return routes[Math.floor(Math.random() * routes.length)]!
    })
  )
  .connectTask('approveTimesheet', (to) => to.task('completeApproval'))
  .connectTask('rejectTimesheet', (to) => to.task('reviseTimesheet'))
  .connectTask('reviseTimesheet', (to) => to.task('reviewTimesheet'))
  .connectTask('completeApproval', (to) => to.condition('end'))