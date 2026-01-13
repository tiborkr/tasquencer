import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import {
  getCampaignByWorkflowId,
  getCampaignWorkItemsByAggregate,
  insertCampaign,
} from '../db'
import {
  submitRequestTask,
  intakeReviewTask,
  assignOwnerTask,
} from '../workItems/initiation'

/**
 * Campaign request payload schema for workflow initialization
 */
const campaignRequestSchema = z.object({
  name: z.string().min(1),
  objective: z.string().min(1),
  targetAudience: z.string().min(1),
  keyMessages: z.array(z.string()),
  channels: z.array(
    z.enum(['email', 'paid_ads', 'social', 'events', 'content']),
  ),
  proposedStartDate: z.number(),
  proposedEndDate: z.number(),
  estimatedBudget: z.number().min(0),
  requesterId: z.string(), // Will be validated as Id<'users'>
})

const campaignApprovalWorkflowActions = Builder.workflowActions().initialize(
  campaignRequestSchema,
  async ({ mutationCtx, workflow }, payload) => {
    const workflowId = await workflow.initialize()

    const now = Date.now()

    // Create the campaign aggregate root with full request data
    await insertCampaign(mutationCtx.db, {
      workflowId,
      name: payload.name,
      objective: payload.objective,
      targetAudience: payload.targetAudience,
      keyMessages: payload.keyMessages,
      channels: payload.channels,
      proposedStartDate: payload.proposedStartDate,
      proposedEndDate: payload.proposedEndDate,
      estimatedBudget: payload.estimatedBudget,
      requesterId: payload.requesterId as any, // Cast to Id<'users'>
      ownerId: undefined,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    })
  },
)

/**
 * Helper to get intake review decision from work item metadata
 */
async function getIntakeDecision(
  db: any,
  workflowId: any,
): Promise<'approved' | 'rejected' | 'needs_changes' | null> {
  const campaign = await getCampaignByWorkflowId(db, workflowId)
  if (!campaign) return null

  const workItems = await getCampaignWorkItemsByAggregate(db, campaign._id)
  const intakeItem = workItems.find((wi) => wi.payload.type === 'intakeReview')
  if (!intakeItem || intakeItem.payload.type !== 'intakeReview') return null

  return intakeItem.payload.decision ?? null
}

/**
 * Campaign Approval Workflow - Phase 1: Initiation
 *
 * Flow:
 * start -> submitRequest -> intakeReview -> [XOR routing]
 *   - approved -> assignOwner -> end (TODO: connect to Phase 2)
 *   - rejected -> end
 *   - needs_changes -> submitRequest (loop)
 *
 * Uses XOR split pattern with route() callback for dynamic path selection.
 */
export const campaignApprovalWorkflow = Builder.workflow('campaign_approval')
  .withActions(campaignApprovalWorkflowActions)
  // Conditions
  .startCondition('start')
  .endCondition('end')
  // Phase 1: Initiation Tasks
  // Note: intakeReview uses XOR split to route based on decision
  .task('submitRequest', submitRequestTask)
  .task('intakeReview', intakeReviewTask)
  .task('assignOwner', assignOwnerTask)
  // Connections: Start -> Submit Request
  .connectCondition('start', (to) => to.task('submitRequest'))
  // Submit Request -> Intake Review
  .connectTask('submitRequest', (to) => to.task('intakeReview'))
  // Intake Review -> XOR Split (routes to assignOwner, submitRequest, or end)
  .connectTask('intakeReview', (to) =>
    to
      .task('assignOwner')
      .task('submitRequest')
      .condition('end')
      .route(async ({ route, mutationCtx, parent }) => {
        const decision = await getIntakeDecision(
          mutationCtx.db,
          parent.workflow.id,
        )

        if (decision === 'approved') {
          return route.toTask('assignOwner')
        }
        if (decision === 'needs_changes') {
          return route.toTask('submitRequest')
        }
        // rejected or no decision -> end
        return route.toCondition('end')
      }),
  )
  // Assign Owner -> End (TODO: connect to Phase 2 strategy tasks)
  .connectTask('assignOwner', (to) => to.condition('end'))
