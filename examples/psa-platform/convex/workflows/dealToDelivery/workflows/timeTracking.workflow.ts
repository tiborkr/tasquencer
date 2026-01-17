import { Builder } from '../../../tasquencer'
import { selectEntryMethodTask } from '../workItems/selectEntryMethod.workItem'
import { useTimerTask } from '../workItems/useTimer.workItem'
import { manualEntryTask } from '../workItems/manualEntry.workItem'
import { importFromCalendarTask } from '../workItems/importFromCalendar.workItem'
import { autoFromBookingsTask } from '../workItems/autoFromBookings.workItem'
import { submitTimeEntryTask } from '../workItems/submitTimeEntry.workItem'
export const timeTrackingWorkflow = Builder.workflow('timeTracking')
  .startCondition('start')
  .endCondition('end')
  .task('selectEntryMethod', selectEntryMethodTask.withSplitType('xor'))
  .task('useTimer', useTimerTask)
  .task('manualEntry', manualEntryTask)
  .task('importFromCalendar', importFromCalendarTask)
  .task('autoFromBookings', autoFromBookingsTask)
  .task('submitTimeEntry', submitTimeEntryTask.withJoinType('xor'))
  .connectCondition('start', (to) => to.task('selectEntryMethod'))
  .connectTask('selectEntryMethod', (to) =>
    to
      .task('useTimer')
      .task('manualEntry')
      .task('importFromCalendar')
      .task('autoFromBookings')
      .route(async ({ route }) => {
        // TODO: Track selected method in work item metadata to enable proper routing
        // For now, default to manual entry as the most common path.
        // Reference: .review/recipes/psa-platform/specs/07-workflow-time-tracking.md
        return route.toTask('manualEntry')
      })
  )
  .connectTask('useTimer', (to) => to.task('submitTimeEntry'))
  .connectTask('manualEntry', (to) => to.task('submitTimeEntry'))
  .connectTask('importFromCalendar', (to) => to.task('submitTimeEntry'))
  .connectTask('autoFromBookings', (to) => to.task('submitTimeEntry'))
  .connectTask('submitTimeEntry', (to) => to.condition('end'))