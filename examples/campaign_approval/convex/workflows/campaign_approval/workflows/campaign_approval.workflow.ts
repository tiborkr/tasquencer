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
import {
  conductResearchTask,
  defineMetricsTask,
  developStrategyTask,
  createPlanTask,
} from '../workItems/strategy'

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
 * Campaign Approval Workflow - Phases 1 & 2
 *
 * Phase 1: Initiation
 * start -> submitRequest -> intakeReview -> [XOR routing]
 *   - approved -> assignOwner -> Phase 2
 *   - rejected -> end
 *   - needs_changes -> submitRequest (loop)
 *
 * Phase 2: Strategy (sequential linear flow)
 * assignOwner -> conductResearch -> defineMetrics -> developStrategy -> createPlan -> end
 * (TODO: connect createPlan to Phase 3 Budget tasks)
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
  // Phase 2: Strategy Tasks (sequential)
  .task('conductResearch', conductResearchTask)
  .task('defineMetrics', defineMetricsTask)
  .task('developStrategy', developStrategyTask)
  .task('createPlan', createPlanTask)
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
  // Assign Owner -> Conduct Research (Phase 2 begins)
  .connectTask('assignOwner', (to) => to.task('conductResearch'))
  // Phase 2: Strategy sequential flow
  .connectTask('conductResearch', (to) => to.task('defineMetrics'))
  .connectTask('defineMetrics', (to) => to.task('developStrategy'))
  .connectTask('developStrategy', (to) => to.task('createPlan'))
  // Create Plan -> End (TODO: connect to Phase 3 Budget tasks)
  .connectTask('createPlan', (to) => to.condition('end'))
