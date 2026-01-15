import { Builder } from '../../../tasquencer'
import { viewTeamAvailabilityTask } from '../workItems/viewTeamAvailability.workItem'
import { filterBySkillsRoleTask } from '../workItems/filterBySkillsRole.workItem'
import { recordPlannedTimeOffTask } from '../workItems/recordPlannedTimeOff.workItem'
import { createBookingsTask } from '../workItems/createBookings.workItem'
import { reviewBookingsTask } from '../workItems/reviewBookings.workItem'
import { checkConfirmationNeededTask } from '../workItems/checkConfirmationNeeded.workItem'
import { confirmBookingsTask } from '../workItems/confirmBookings.workItem'
import { getProjectByWorkflowId, listBookingsByProject } from '../db'
import { getLatestWorkItemByTypeAndProject } from '../helpers'
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
      .route(async ({ mutationCtx, parent, route }) => {
        // Get project to find the work item decision
        const project = await getProjectByWorkflowId(mutationCtx.db, parent.workflow.id)
        if (!project) {
          throw new Error('Project not found for workflow')
        }

        // Get the latest reviewBookings work item for this project
        const reviewWorkItem = await getLatestWorkItemByTypeAndProject(
          mutationCtx.db,
          'reviewBookings',
          project._id
        )

        // Route based on the review decision stored in the work item metadata
        // approved = true → proceed to checkConfirmationNeeded
        // approved = false → go back to filterBySkillsRole (revise)
        if (reviewWorkItem?.payload.type === 'reviewBookings' && reviewWorkItem.payload.approved === false) {
          return route.toTask('filterBySkillsRole')
        }
        return route.toTask('checkConfirmationNeeded')
      })
  )
  .connectTask('checkConfirmationNeeded', (to) =>
    to
      .task('confirmBookings')
      .task('completeAllocation')
      .route(async ({ mutationCtx, parent, route }) => {
        // Get project and its bookings
        const project = await getProjectByWorkflowId(mutationCtx.db, parent.workflow.id)
        if (!project) {
          throw new Error('Project not found for workflow')
        }

        const bookings = await listBookingsByProject(mutationCtx.db, project._id)

        // Route based on whether any Tentative bookings need confirmation
        const hasTentativeBookings = bookings.some((b) => b.type === 'Tentative')

        return hasTentativeBookings
          ? route.toTask('confirmBookings')
          : route.toTask('completeAllocation')
      })
  )
  .connectTask('confirmBookings', (to) => to.task('completeAllocation'))
  .connectTask('completeAllocation', (to) => to.condition('end'))