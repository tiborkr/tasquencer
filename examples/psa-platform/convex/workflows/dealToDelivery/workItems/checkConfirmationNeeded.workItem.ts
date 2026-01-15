import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import invariant from 'tiny-invariant'
import {
  getProjectByWorkflowId,
  listBookingsByProject,
} from '../db'
import { initializeAgentWorkItemAuth } from './authHelpers'

// Policy: system task requires basic view scope
const checkConfirmationNeededPolicy = authService.policies.requireScope('dealToDelivery:resources:view:team')

// This is a system/automated task - no manual start required
// The task automatically completes when enabled

const checkConfirmationNeededActions = authService.builders.workItemActions
  // No start action - this is an automatic system task
  // Complete action - check if any bookings need confirmation
  .complete(
    z.object({}),
    checkConfirmationNeededPolicy,
    async ({ mutationCtx, parent }) => {
      // Get project and its bookings
      const project = await getProjectByWorkflowId(mutationCtx.db, parent.workflow.id)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      const bookings = await listBookingsByProject(mutationCtx.db, project._id)

      // Check if any bookings are tentative
      const tentativeCount = bookings.filter((b) => b.type === 'Tentative').length

      // Log the check result - routing is handled by workflow definition
      // querying domain state (tentative bookings exist)
      console.log(`checkConfirmationNeeded: ${tentativeCount} tentative bookings found`)
    },
  )

export const checkConfirmationNeededWorkItem = Builder.workItem('checkConfirmationNeeded')
  .withActions(checkConfirmationNeededActions.build())

export const checkConfirmationNeededTask = Builder.task(checkConfirmationNeededWorkItem)
  .withSplitType('xor') // Routes to either confirmBookings or completeAllocation (end)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Get project linked to this workflow
      const project = await getProjectByWorkflowId(mutationCtx.db, parent.workflow.id)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      // Initialize as agent work item (automatic system task)
      await initializeAgentWorkItemAuth(mutationCtx, workItemId, {
        payload: {
          type: 'checkConfirmationNeeded',
          taskName: 'Check Confirmation Needed',
          projectId: project._id,
        },
      })

      // Check for tentative bookings to determine routing
      const bookings = await listBookingsByProject(mutationCtx.db, project._id)
      const hasTentativeBookings = bookings.some((b) => b.type === 'Tentative')

      // Log the decision for debugging
      // The workflow definition will use domain state to route appropriately
      console.log(`checkConfirmationNeeded: ${hasTentativeBookings ? 'needs confirmation' : 'already confirmed'}`)
    },
  })
