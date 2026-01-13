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
import {
  createBriefTask,
  developConceptsTask,
  internalReviewTask,
  reviseAssetsTask,
  legalReviewTask,
  legalReviseTask,
  finalApprovalTask,
} from '../workItems/creative'
import {
  buildInfraTask,
  configAnalyticsTask,
  setupMediaTask,
  qaTestTask,
  fixIssuesTask,
} from '../workItems/technical'
import {
  preLaunchReviewTask,
  addressConcernsTask,
  launchApprovalTask,
  internalCommsTask,
} from '../workItems/launch'
import {
  launchCampaignTask,
  monitorPerformanceTask,
  ongoingOptimizationTask,
} from '../workItems/execution'

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
 * Helper to get internal review decision from work item metadata
 * Used for XOR routing after internal creative review
 */
async function getInternalReviewDecision(
  db: any,
  workflowId: any,
): Promise<'approved' | 'needs_revision' | null> {
  const campaign = await getCampaignByWorkflowId(db, workflowId)
  if (!campaign) return null

  const workItems = await getCampaignWorkItemsByAggregate(db, campaign._id)

  // Get the most recent internalReview work item (for loop scenarios)
  const reviewItems = workItems
    .filter((wi) => wi.payload.type === 'internalReview')
    .sort((a, b) => b._creationTime - a._creationTime)

  const reviewItem = reviewItems[0]
  if (!reviewItem || reviewItem.payload.type !== 'internalReview') return null

  return reviewItem.payload.decision ?? null
}

/**
 * Helper to get legal review decision from work item metadata
 * Used for XOR routing after legal review
 */
async function getLegalReviewDecision(
  db: any,
  workflowId: any,
): Promise<'approved' | 'needs_changes' | null> {
  const campaign = await getCampaignByWorkflowId(db, workflowId)
  if (!campaign) return null

  const workItems = await getCampaignWorkItemsByAggregate(db, campaign._id)

  // Get the most recent legalReview work item (for loop scenarios)
  const reviewItems = workItems
    .filter((wi) => wi.payload.type === 'legalReview')
    .sort((a, b) => b._creationTime - a._creationTime)

  const reviewItem = reviewItems[0]
  if (!reviewItem || reviewItem.payload.type !== 'legalReview') return null

  return reviewItem.payload.decision ?? null
}

/**
 * Helper to get QA test decision from work item metadata
 * Used for XOR routing after QA testing
 */
async function getQaTestDecision(
  db: any,
  workflowId: any,
): Promise<'passed' | 'failed' | null> {
  const campaign = await getCampaignByWorkflowId(db, workflowId)
  if (!campaign) return null

  const workItems = await getCampaignWorkItemsByAggregate(db, campaign._id)

  // Get the most recent qaTest work item (for loop scenarios)
  const testItems = workItems
    .filter((wi) => wi.payload.type === 'qaTest')
    .sort((a, b) => b._creationTime - a._creationTime)

  const testItem = testItems[0]
  if (!testItem || testItem.payload.type !== 'qaTest') return null

  return testItem.payload.decision ?? null
}

/**
 * Helper to get pre-launch review decision from work item metadata
 * Used for XOR routing after pre-launch review
 */
async function getPreLaunchReviewDecision(
  db: any,
  workflowId: any,
): Promise<boolean | null> {
  const campaign = await getCampaignByWorkflowId(db, workflowId)
  if (!campaign) return null

  const workItems = await getCampaignWorkItemsByAggregate(db, campaign._id)

  // Get the most recent preLaunchReview work item (for loop scenarios)
  const reviewItems = workItems
    .filter((wi) => wi.payload.type === 'preLaunchReview')
    .sort((a, b) => b._creationTime - a._creationTime)

  const reviewItem = reviewItems[0]
  if (!reviewItem || reviewItem.payload.type !== 'preLaunchReview') return null

  return reviewItem.payload.checklistComplete ?? null
}

/**
 * Helper to get launch approval decision from work item metadata
 * Used for XOR routing after launch approval
 */
async function getLaunchApprovalDecision(
  db: any,
  workflowId: any,
): Promise<'approved' | 'concerns' | 'rejected' | null> {
  const campaign = await getCampaignByWorkflowId(db, workflowId)
  if (!campaign) return null

  const workItems = await getCampaignWorkItemsByAggregate(db, campaign._id)

  // Get the most recent launchApproval work item (for loop scenarios)
  const approvalItems = workItems
    .filter((wi) => wi.payload.type === 'launchApproval')
    .sort((a, b) => b._creationTime - a._creationTime)

  const approvalItem = approvalItems[0]
  if (!approvalItem || approvalItem.payload.type !== 'launchApproval') return null

  return approvalItem.payload.decision ?? null
}

/**
 * Helper to get optimization decision from work item metadata
 * Used for XOR routing after ongoingOptimization (Phase 7)
 * Returns 'continue' to loop back to monitoring, 'end' to proceed to closure
 */
async function getOptimizationDecision(
  db: any,
  workflowId: any,
): Promise<'continue' | 'end' | null> {
  const campaign = await getCampaignByWorkflowId(db, workflowId)
  if (!campaign) return null

  const workItems = await getCampaignWorkItemsByAggregate(db, campaign._id)

  // Get the most recent ongoingOptimization work item (for loop scenarios)
  const optimizationItems = workItems
    .filter((wi) => wi.payload.type === 'ongoingOptimization')
    .sort((a, b) => b._creationTime - a._creationTime)

  const optimizationItem = optimizationItems[0]
  if (!optimizationItem || optimizationItem.payload.type !== 'ongoingOptimization') return null

  return optimizationItem.payload.decision ?? null
}

/**
 * Campaign Approval Workflow - Phases 1, 2, 3, 4, 5, 6 & 7
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
 *   - approved -> secureResources -> Phase 4
 *   - rejected -> end
 *   - revision_requested -> developBudget (loop)
 *
 * Phase 4: Creative Development
 * secureResources -> createBrief -> developConcepts -> internalReview -> [XOR routing]
 *   - approved -> legalReview -> [XOR routing]
 *       - approved -> finalApproval -> Phase 5
 *       - needs_changes -> legalRevise -> legalReview (loop)
 *   - needs_revision -> reviseAssets -> internalReview (loop)
 *
 * Phase 5: Technical Setup
 * finalApproval -> parallelSetup (AND split) -> [3 parallel tasks]
 *   - buildInfra (campaign:ops)
 *   - configAnalytics (campaign:ops)
 *   - setupMedia (campaign:media)
 * All three -> setupJoin (AND join) -> qaTest -> [XOR routing]
 *   - passed -> preLaunchReview (Phase 6)
 *   - failed -> fixIssues -> qaTest (loop)
 *
 * Phase 6: Launch
 * preLaunchReview -> [XOR routing]
 *   - readyForApproval -> launchApproval -> [XOR routing]
 *       - approved -> internalComms -> Phase 7
 *       - concerns -> addressConcerns -> preLaunchReview (loop)
 *       - rejected -> end
 *   - not ready -> addressConcerns -> preLaunchReview (loop)
 *
 * Phase 7: Execution
 * internalComms -> launchCampaign -> monitorPerformance -> ongoingOptimization -> [XOR routing]
 *   - continue -> monitorPerformance (loop until campaign end)
 *   - end -> [end] (TODO: Phase 8 Closure)
 *
 * Uses XOR split pattern with route() callback for dynamic path selection.
 * Uses AND split/join for parallel technical setup tasks.
 *
 * Note: With 30 tasks + 2 conditions, TypeScript hits type depth limits (TS2589).
 * Using @ts-expect-error to suppress type checking during build. The workflow
 * still validates types at runtime through Convex schema.
 */
// @ts-expect-error TS2589: Type instantiation is excessively deep and possibly infinite (27+ workflow elements)
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
  // Phase 4: Creative Tasks
  // Note: internalReview uses XOR split to route to legalReview or reviseAssets
  // Note: legalReview uses XOR split to route to finalApproval or legalRevise
  .task('createBrief', createBriefTask)
  .task('developConcepts', developConceptsTask)
  .task('internalReview', internalReviewTask)
  .task('reviseAssets', reviseAssetsTask)
  .task('legalReview', legalReviewTask)
  .task('legalRevise', legalReviseTask)
  .task('finalApproval', finalApprovalTask)
  // Phase 5: Technical Tasks
  // Note: Uses AND split for parallel execution and AND join to wait for all
  // Note: qaTest uses XOR split to route based on pass/fail
  .dummyTask('parallelSetup', Builder.dummyTask().withSplitType('and'))
  .task('buildInfra', buildInfraTask)
  .task('configAnalytics', configAnalyticsTask)
  .task('setupMedia', setupMediaTask)
  .dummyTask('setupJoin', Builder.dummyTask().withJoinType('and'))
  .task('qaTest', qaTestTask)
  .task('fixIssues', fixIssuesTask)
  // Phase 6: Launch Tasks
  // Note: preLaunchReview uses XOR split to route based on readyForApproval
  // Note: launchApproval uses XOR split to route based on decision
  .task('preLaunchReview', preLaunchReviewTask)
  .task('addressConcerns', addressConcernsTask)
  .task('launchApproval', launchApprovalTask)
  .task('internalComms', internalCommsTask)
  // Phase 7: Execution Tasks
  // Note: monitorPerformance uses XOR join for input from launchCampaign OR ongoingOptimization loop
  // Note: ongoingOptimization uses XOR split to route to monitorPerformance (continue) or end
  .task('launchCampaign', launchCampaignTask)
  .task('monitorPerformance', monitorPerformanceTask)
  .task('ongoingOptimization', ongoingOptimizationTask)
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
  // Secure Resources -> Create Brief (Phase 4 begins)
  .connectTask('secureResources', (to) => to.task('createBrief'))
  // Phase 4: Creative Development flow
  // Create Brief -> Develop Concepts
  .connectTask('createBrief', (to) => to.task('developConcepts'))
  // Develop Concepts -> Internal Review
  .connectTask('developConcepts', (to) => to.task('internalReview'))
  // Internal Review -> XOR Split (routes to legalReview or reviseAssets)
  .connectTask('internalReview', (to) =>
    to
      .task('legalReview')
      .task('reviseAssets')
      .route(async ({ route, mutationCtx, parent }) => {
        const decision = await getInternalReviewDecision(
          mutationCtx.db,
          parent.workflow.id,
        )

        if (decision === 'approved') {
          return route.toTask('legalReview')
        }
        // needs_revision or no decision -> reviseAssets
        return route.toTask('reviseAssets')
      }),
  )
  // Revise Assets -> Internal Review (loop back)
  .connectTask('reviseAssets', (to) => to.task('internalReview'))
  // Legal Review -> XOR Split (routes to finalApproval or legalRevise)
  .connectTask('legalReview', (to) =>
    to
      .task('finalApproval')
      .task('legalRevise')
      .route(async ({ route, mutationCtx, parent }) => {
        const decision = await getLegalReviewDecision(
          mutationCtx.db,
          parent.workflow.id,
        )

        if (decision === 'approved') {
          return route.toTask('finalApproval')
        }
        // needs_changes or no decision -> legalRevise
        return route.toTask('legalRevise')
      }),
  )
  // Legal Revise -> Legal Review (loop back)
  .connectTask('legalRevise', (to) => to.task('legalReview'))
  // Final Approval -> Phase 5 Technical Setup (AND split for parallel tasks)
  .connectTask('finalApproval', (to) => to.task('parallelSetup'))
  // Phase 5: Technical Setup connections
  // AND split: parallelSetup -> buildInfra, configAnalytics, setupMedia (all start in parallel)
  .connectTask('parallelSetup', (to) =>
    to.task('buildInfra').task('configAnalytics').task('setupMedia'),
  )
  // Each parallel task connects to the AND join
  .connectTask('buildInfra', (to) => to.task('setupJoin'))
  .connectTask('configAnalytics', (to) => to.task('setupJoin'))
  .connectTask('setupMedia', (to) => to.task('setupJoin'))
  // AND join -> QA Test
  .connectTask('setupJoin', (to) => to.task('qaTest'))
  // QA Test -> XOR Split (routes to Phase 6 preLaunchReview or fixIssues)
  .connectTask('qaTest', (to) =>
    to
      .task('preLaunchReview')
      .task('fixIssues')
      .route(async ({ route, mutationCtx, parent }) => {
        const decision = await getQaTestDecision(
          mutationCtx.db,
          parent.workflow.id,
        )

        if (decision === 'passed') {
          return route.toTask('preLaunchReview')
        }
        // failed or no decision -> fixIssues
        return route.toTask('fixIssues')
      }),
  )
  // Fix Issues -> QA Test (loop back)
  .connectTask('fixIssues', (to) => to.task('qaTest'))
  // Phase 6: Launch Connections
  // Pre-Launch Review -> XOR Split (routes to launchApproval or addressConcerns)
  .connectTask('preLaunchReview', (to) =>
    to
      .task('launchApproval')
      .task('addressConcerns')
      .route(async ({ route, mutationCtx, parent }) => {
        const readyForApproval = await getPreLaunchReviewDecision(
          mutationCtx.db,
          parent.workflow.id,
        )

        if (readyForApproval === true) {
          return route.toTask('launchApproval')
        }
        // not ready or no decision -> addressConcerns
        return route.toTask('addressConcerns')
      }),
  )
  // Address Concerns -> Pre-Launch Review (loop back)
  .connectTask('addressConcerns', (to) => to.task('preLaunchReview'))
  // Launch Approval -> XOR Split (routes to internalComms, addressConcerns, or end)
  .connectTask('launchApproval', (to) =>
    to
      .task('internalComms')
      .task('addressConcerns')
      .condition('end')
      .route(async ({ route, mutationCtx, parent }) => {
        const decision = await getLaunchApprovalDecision(
          mutationCtx.db,
          parent.workflow.id,
        )

        if (decision === 'approved') {
          return route.toTask('internalComms')
        }
        if (decision === 'concerns') {
          return route.toTask('addressConcerns')
        }
        // rejected or no decision -> end
        return route.toCondition('end')
      }),
  )
  // Internal Comms -> Phase 7 Execution
  .connectTask('internalComms', (to) => to.task('launchCampaign'))
  // Phase 7: Execution Connections
  // Launch Campaign -> Monitor Performance
  // @ts-expect-error TS2589: Type instantiation depth exceeded (30+ workflow elements)
  .connectTask('launchCampaign', (to: any) => to.task('monitorPerformance'))
  // Monitor Performance -> Ongoing Optimization
  // @ts-expect-error TS2589: Type instantiation depth exceeded (30+ workflow elements)
  .connectTask('monitorPerformance', (to: any) => to.task('ongoingOptimization'))
  // Ongoing Optimization -> XOR Split (routes to monitorPerformance loop or end)
  // @ts-expect-error TS2589: Type instantiation depth exceeded (30+ workflow elements)
  .connectTask('ongoingOptimization', (to: any) =>
    to
      .task('monitorPerformance')
      .condition('end')
      .route(async ({ route, mutationCtx, parent }: any) => {
        const decision = await getOptimizationDecision(
          mutationCtx.db,
          parent.workflow.id,
        )

        if (decision === 'continue') {
          return route.toTask('monitorPerformance')
        }
        // end or no decision -> end (TODO: Phase 8 Closure)
        return route.toCondition('end')
      }),
  )
