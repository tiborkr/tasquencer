import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import {
  getCampaignByWorkflowId,
  getCampaignWorkItemsByAggregate,
  getCampaignBudgetByWorkflowId,
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
import {
  developBudgetTask,
  directorApprovalTask,
  executiveApprovalTask,
  secureResourcesTask,
} from '../workItems/budget'

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
 * Helper to get budget total amount for routing
 * Routes to director (< $50k) or executive (>= $50k) approval
 */
async function getBudgetAmount(db: any, workflowId: any): Promise<number | null> {
  const budget = await getCampaignBudgetByWorkflowId(db, workflowId)
  if (!budget) return null
  return budget.totalAmount
}

/**
 * Budget approval threshold - budgets under this amount go to director,
 * budgets at or above go to executive
 */
const BUDGET_APPROVAL_THRESHOLD = 50000

/**
 * Helper to get budget approval decision from work item metadata
 * Checks both director and executive approval work items
 */
async function getBudgetApprovalDecision(
  db: any,
  workflowId: any,
): Promise<'approved' | 'rejected' | 'revision_requested' | null> {
  const campaign = await getCampaignByWorkflowId(db, workflowId)
  if (!campaign) return null

  const workItems = await getCampaignWorkItemsByAggregate(db, campaign._id)

  // Check director approval first
  const directorItem = workItems.find(
    (wi) => wi.payload.type === 'directorApproval',
  )
  if (directorItem && directorItem.payload.type === 'directorApproval') {
    if (directorItem.payload.decision) {
      return directorItem.payload.decision
    }
  }

  // Check executive approval
  const executiveItem = workItems.find(
    (wi) => wi.payload.type === 'executiveApproval',
  )
  if (executiveItem && executiveItem.payload.type === 'executiveApproval') {
    if (executiveItem.payload.decision) {
      return executiveItem.payload.decision
    }
  }

  return null
}

/**
 * Campaign Approval Workflow - Phases 1, 2 & 3
 *
 * Phase 1: Initiation
 * start -> submitRequest -> intakeReview -> [XOR routing]
 *   - approved -> assignOwner -> Phase 2
 *   - rejected -> end
 *   - needs_changes -> submitRequest (loop)
 *
 * Phase 2: Strategy (sequential linear flow)
 * assignOwner -> conductResearch -> defineMetrics -> developStrategy -> createPlan -> Phase 3
 *
 * Phase 3: Budget
 * createPlan -> developBudget -> [XOR routing by amount]
 *   - < $50k -> directorApproval -> [XOR routing by decision]
 *   - >= $50k -> executiveApproval -> [XOR routing by decision]
 * Approval decisions:
 *   - approved -> secureResources -> end (TODO: Phase 4)
 *   - rejected -> end
 *   - revision_requested -> developBudget (loop)
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
  // Phase 3: Budget Tasks
  // Note: developBudget uses XOR split to route to director or executive based on amount
  // Note: approval tasks use XOR split to route based on decision
  .task('developBudget', developBudgetTask)
  .task('directorApproval', directorApprovalTask)
  .task('executiveApproval', executiveApprovalTask)
  .task('secureResources', secureResourcesTask)
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
  // Create Plan -> Develop Budget (Phase 3 begins)
  .connectTask('createPlan', (to) => to.task('developBudget'))
  // Develop Budget -> XOR Split by amount (director < $50k, executive >= $50k)
  .connectTask('developBudget', (to) =>
    to
      .task('directorApproval')
      .task('executiveApproval')
      .route(async ({ route, mutationCtx, parent }) => {
        const amount = await getBudgetAmount(mutationCtx.db, parent.workflow.id)

        if (amount !== null && amount < BUDGET_APPROVAL_THRESHOLD) {
          return route.toTask('directorApproval')
        }
        // >= $50k or null (treat as high budget) -> executive
        return route.toTask('executiveApproval')
      }),
  )
  // Director Approval -> XOR Split by decision
  .connectTask('directorApproval', (to) =>
    to
      .task('secureResources')
      .task('developBudget')
      .condition('end')
      .route(async ({ route, mutationCtx, parent }) => {
        const decision = await getBudgetApprovalDecision(
          mutationCtx.db,
          parent.workflow.id,
        )

        if (decision === 'approved') {
          return route.toTask('secureResources')
        }
        if (decision === 'revision_requested') {
          return route.toTask('developBudget')
        }
        // rejected or no decision -> end
        return route.toCondition('end')
      }),
  )
  // Executive Approval -> XOR Split by decision
  .connectTask('executiveApproval', (to) =>
    to
      .task('secureResources')
      .task('developBudget')
      .condition('end')
      .route(async ({ route, mutationCtx, parent }) => {
        const decision = await getBudgetApprovalDecision(
          mutationCtx.db,
          parent.workflow.id,
        )

        if (decision === 'approved') {
          return route.toTask('secureResources')
        }
        if (decision === 'revision_requested') {
          return route.toTask('developBudget')
        }
        // rejected or no decision -> end
        return route.toCondition('end')
      }),
  )
  // Secure Resources -> End (TODO: connect to Phase 4 Creative tasks)
  .connectTask('secureResources', (to) => to.condition('end'))
