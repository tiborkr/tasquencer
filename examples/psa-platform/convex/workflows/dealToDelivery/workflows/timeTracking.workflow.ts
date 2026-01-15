import { Builder } from '../../../tasquencer'
import { selectEntryMethodTask } from '../workItems/selectEntryMethod.workItem'
import { useTimerTask } from '../workItems/useTimer.workItem'
import { manualEntryTask } from '../workItems/manualEntry.workItem'
import { importFromCalendarTask } from '../workItems/importFromCalendar.workItem'
import { autoFromBookingsTask } from '../workItems/autoFromBookings.workItem'
import { submitTimeEntryTask } from '../workItems/submitTimeEntry.workItem'
import { DealToDeliveryWorkItemHelpers } from '../helpers'

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
      .route(async ({ mutationCtx, workItem, route }) => {
        // Get the work item ID from the completed task
        const workItemIds = await workItem.getAllWorkItemIds()
        const workItemId = workItemIds[workItemIds.length - 1] // Get the most recent
        if (!workItemId) {
          return route.toTask('manualEntry')
        }

        // Get the selected entry method from the work item metadata
        const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
          mutationCtx.db,
          workItemId
        )

        // Route based on the selected entry method
        if (metadata?.payload.type === 'selectEntryMethod' && metadata.payload.method) {
          switch (metadata.payload.method) {
            case 'timer':
              return route.toTask('useTimer')
            case 'manual':
              return route.toTask('manualEntry')
            case 'calendar':
              return route.toTask('importFromCalendar')
            case 'autoBooking':
              return route.toTask('autoFromBookings')
          }
        }

        // Default to manual entry if no method selected
        return route.toTask('manualEntry')
      })
  )
  .connectTask('useTimer', (to) => to.task('submitTimeEntry'))
  .connectTask('manualEntry', (to) => to.task('submitTimeEntry'))
  .connectTask('importFromCalendar', (to) => to.task('submitTimeEntry'))
  .connectTask('autoFromBookings', (to) => to.task('submitTimeEntry'))
  .connectTask('submitTimeEntry', (to) => to.condition('end'))