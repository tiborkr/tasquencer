import { Builder } from '../../../tasquencer'
import { viewTeamAvailabilityTask } from '../workItems/viewTeamAvailability.workItem'
import { filterBySkillsRoleTask } from '../workItems/filterBySkillsRole.workItem'
import { recordPlannedTimeOffTask } from '../workItems/recordPlannedTimeOff.workItem'
import { createBookingsTask } from '../workItems/createBookings.workItem'
import { reviewBookingsTask } from '../workItems/reviewBookings.workItem'
import { checkConfirmationNeededTask } from '../workItems/checkConfirmationNeeded.workItem'
import { confirmBookingsTask } from '../workItems/confirmBookings.workItem'
const completeAllocationTask = Builder.dummyTask()
  .withJoinType('xor')
export const resourcePlanningWorkflow = Builder.workflow('resourcePlanning')
  .startCondition('start')
  .endCondition('end')
  .task('viewTeamAvailability', viewTeamAvailabilityTask)
  .task('filterBySkillsRole', filterBySkillsRoleTask.withJoinType('xor'))
  .task('recordPlannedTimeOff', recordPlannedTimeOffTask)
  .task('createBookings', createBookingsTask)
  .task('reviewBookings', reviewBookingsTask.withSplitType('xor'))
  .task('checkConfirmationNeeded', checkConfirmationNeededTask.withSplitType('xor'))
  .task('confirmBookings', confirmBookingsTask)
  .dummyTask('completeAllocation', completeAllocationTask)
  .connectCondition('start', (to) => to.task('viewTeamAvailability'))
  .connectTask('viewTeamAvailability', (to) => to.task('filterBySkillsRole'))
  .connectTask('filterBySkillsRole', (to) => to.task('recordPlannedTimeOff').task('createBookings'))
  .connectTask('recordPlannedTimeOff', (to) => to.task('reviewBookings'))
  .connectTask('createBookings', (to) => to.task('reviewBookings'))
  .connectTask('reviewBookings', (to) =>
    to
      .task('filterBySkillsRole')
      .task('checkConfirmationNeeded')
      .route(async ({ route }) => {
      const routes = [route.toTask('filterBySkillsRole'), route.toTask('checkConfirmationNeeded')]
      return routes[Math.floor(Math.random() * routes.length)]!
    })
  )
  .connectTask('checkConfirmationNeeded', (to) =>
    to
      .task('confirmBookings')
      .task('completeAllocation')
      .route(async ({ route }) => {
      const routes = [route.toTask('confirmBookings'), route.toTask('completeAllocation')]
      return routes[Math.floor(Math.random() * routes.length)]!
    })
  )
  .connectTask('confirmBookings', (to) => to.task('completeAllocation'))
  .connectTask('completeAllocation', (to) => to.condition('end'))