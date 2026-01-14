import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { defineWorkItemMetadataTable } from '@repo/tasquencer'

/**
 * Campaign status throughout the workflow
 */
export const campaignStatus = v.union(
  v.literal('draft'),
  v.literal('intake_review'),
  v.literal('strategy'),
  v.literal('budget_approval'),
  v.literal('creative_development'),
  v.literal('technical_setup'),
  v.literal('pre_launch'),
  v.literal('active'),
  v.literal('completed'),
  v.literal('cancelled'),
)

/**
 * Marketing channels
 */
export const channelType = v.union(
  v.literal('email'),
  v.literal('paid_ads'),
  v.literal('social'),
  v.literal('events'),
  v.literal('content'),
)

/**
 * Creative asset types
 */
export const creativeAssetType = v.union(
  v.literal('ad'),
  v.literal('email'),
  v.literal('landing_page'),
  v.literal('social_post'),
  v.literal('video'),
)

/**
 * Budget approval status
 */
export const budgetStatus = v.union(
  v.literal('draft'),
  v.literal('pending_approval'),
  v.literal('approved'),
  v.literal('rejected'),
  v.literal('revision_requested'),
)

/**
 * campaigns - Aggregate root table linking workflow to domain data
 */
const campaigns = defineTable({
  workflowId: v.id('tasquencerWorkflows'),
  name: v.string(),
  objective: v.string(),
  targetAudience: v.string(),
  keyMessages: v.array(v.string()),
  channels: v.array(channelType),
  proposedStartDate: v.number(),
  proposedEndDate: v.number(),
  estimatedBudget: v.number(),
  requesterId: v.id('users'),
  ownerId: v.optional(v.id('users')),
  status: campaignStatus,
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_workflow_id', ['workflowId'])
  .index('by_requester_id', ['requesterId'])
  .index('by_owner_id', ['ownerId'])

/**
 * campaignBudgets - Detailed budget breakdown for campaign
 */
const campaignBudgets = defineTable({
  campaignId: v.id('campaigns'),
  workflowId: v.id('tasquencerWorkflows'),
  totalAmount: v.number(),
  mediaSpend: v.number(),
  creativeProduction: v.number(),
  technologyTools: v.number(),
  agencyFees: v.number(),
  eventCosts: v.number(),
  contingency: v.number(),
  justification: v.string(),
  roiProjection: v.optional(v.string()),
  status: budgetStatus,
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_campaign_id', ['campaignId'])
  .index('by_workflow_id', ['workflowId'])

/**
 * campaignCreatives - Creative assets for campaign
 */
const campaignCreatives = defineTable({
  campaignId: v.id('campaigns'),
  workflowId: v.id('tasquencerWorkflows'),
  assetType: creativeAssetType,
  name: v.string(),
  description: v.optional(v.string()),
  storageId: v.optional(v.id('_storage')),
  version: v.number(),
  createdBy: v.id('users'),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_campaign_id', ['campaignId'])
  .index('by_workflow_id', ['workflowId'])

/**
 * campaignKPIs - Key performance indicators for campaign
 */
const campaignKPIs = defineTable({
  campaignId: v.id('campaigns'),
  metric: v.string(),
  targetValue: v.number(),
  actualValue: v.optional(v.number()),
  unit: v.string(),
  createdAt: v.number(),
}).index('by_campaign_id', ['campaignId'])

/**
 * campaignResearch - Research findings from Phase 2 strategy development
 * Contains audience analysis, competitive insights, and historical learnings
 */
const campaignResearch = defineTable({
  campaignId: v.id('campaigns'),
  audienceAnalysis: v.optional(v.string()),
  competitiveLandscape: v.optional(v.string()),
  historicalInsights: v.optional(v.string()),
  recommendations: v.optional(v.string()),
  createdBy: v.id('users'),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index('by_campaign_id', ['campaignId'])

/**
 * campaignStrategy - Strategy document from Phase 2
 * Contains channel strategy, creative approach, and customer journey
 */
const campaignStrategy = defineTable({
  campaignId: v.id('campaigns'),
  channelStrategy: v.string(),
  creativeApproach: v.string(),
  customerJourney: v.optional(v.string()),
  segmentation: v.optional(v.string()),
  tactics: v.optional(v.array(v.object({
    name: v.string(),
    description: v.string(),
    channel: v.string(),
  }))),
  createdBy: v.id('users'),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index('by_campaign_id', ['campaignId'])

/**
 * Milestone status for timeline tracking
 */
export const milestoneStatus = v.union(
  v.literal('pending'),
  v.literal('in_progress'),
  v.literal('completed'),
  v.literal('delayed'),
)

/**
 * campaignTimeline - Milestones and timeline from Phase 2 planning
 * Each record is one milestone in the campaign timeline
 */
const campaignTimeline = defineTable({
  campaignId: v.id('campaigns'),
  milestoneName: v.string(),
  targetDate: v.number(),
  actualDate: v.optional(v.number()),
  status: milestoneStatus,
  notes: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_campaign_id', ['campaignId'])
  .index('by_target_date', ['targetDate'])

/**
 * Approval type for audit trail
 */
export const approvalType = v.union(
  v.literal('intake'),
  v.literal('budget'),
  v.literal('creative'),
  v.literal('legal'),
  v.literal('launch'),
)

/**
 * Approval decision values
 */
export const approvalDecision = v.union(
  v.literal('approved'),
  v.literal('rejected'),
  v.literal('changes_requested'),
)

/**
 * campaignApprovals - Audit trail for all approval decisions
 * Records every approval gate decision for compliance and history
 */
const campaignApprovals = defineTable({
  campaignId: v.id('campaigns'),
  approvalType: approvalType,
  decision: approvalDecision,
  approvedBy: v.id('users'),
  comments: v.optional(v.string()),
  createdAt: v.number(),
})
  .index('by_campaign_id', ['campaignId'])
  .index('by_approval_type', ['approvalType'])
  .index('by_decision', ['decision'])

/**
 * Work item payload types for all 35 workflow tasks
 */

// Phase 1: Initiation
const submitRequestPayload = v.object({
  type: v.literal('submitRequest'),
  taskName: v.string(),
})

const intakeReviewPayload = v.object({
  type: v.literal('intakeReview'),
  taskName: v.string(),
  decision: v.optional(
    v.union(
      v.literal('approved'),
      v.literal('rejected'),
      v.literal('needs_changes'),
    ),
  ),
  reviewNotes: v.optional(v.string()),
})

const assignOwnerPayload = v.object({
  type: v.literal('assignOwner'),
  taskName: v.string(),
  ownerId: v.optional(v.id('users')),
})

// Phase 2: Strategy
const conductResearchPayload = v.object({
  type: v.literal('conductResearch'),
  taskName: v.string(),
  findings: v.optional(v.string()),
})

const defineMetricsPayload = v.object({
  type: v.literal('defineMetrics'),
  taskName: v.string(),
})

const developStrategyPayload = v.object({
  type: v.literal('developStrategy'),
  taskName: v.string(),
  strategyDocument: v.optional(v.string()),
})

const createPlanPayload = v.object({
  type: v.literal('createPlan'),
  taskName: v.string(),
  planDocument: v.optional(v.string()),
})

// Phase 3: Budget
const developBudgetPayload = v.object({
  type: v.literal('developBudget'),
  taskName: v.string(),
})

const directorApprovalPayload = v.object({
  type: v.literal('directorApproval'),
  taskName: v.string(),
  decision: v.optional(
    v.union(
      v.literal('approved'),
      v.literal('rejected'),
      v.literal('revision_requested'),
    ),
  ),
  approvalNotes: v.optional(v.string()),
})

const executiveApprovalPayload = v.object({
  type: v.literal('executiveApproval'),
  taskName: v.string(),
  decision: v.optional(
    v.union(
      v.literal('approved'),
      v.literal('rejected'),
      v.literal('revision_requested'),
    ),
  ),
  approvalNotes: v.optional(v.string()),
})

const secureResourcesPayload = v.object({
  type: v.literal('secureResources'),
  taskName: v.string(),
  resourcesConfirmed: v.optional(v.boolean()),
})

// Phase 4: Creative
const createBriefPayload = v.object({
  type: v.literal('createBrief'),
  taskName: v.string(),
  briefDocument: v.optional(v.string()),
})

const developConceptsPayload = v.object({
  type: v.literal('developConcepts'),
  taskName: v.string(),
})

const internalReviewPayload = v.object({
  type: v.literal('internalReview'),
  taskName: v.string(),
  decision: v.optional(
    v.union(v.literal('approved'), v.literal('needs_revision')),
  ),
  reviewNotes: v.optional(v.string()),
})

const reviseAssetsPayload = v.object({
  type: v.literal('reviseAssets'),
  taskName: v.string(),
  revisionNotes: v.optional(v.string()),
})

const legalReviewPayload = v.object({
  type: v.literal('legalReview'),
  taskName: v.string(),
  decision: v.optional(
    v.union(v.literal('approved'), v.literal('needs_changes')),
  ),
  legalNotes: v.optional(v.string()),
})

const legalRevisePayload = v.object({
  type: v.literal('legalRevise'),
  taskName: v.string(),
  revisionNotes: v.optional(v.string()),
})

const finalApprovalPayload = v.object({
  type: v.literal('finalApproval'),
  taskName: v.string(),
  decision: v.optional(v.union(v.literal('approved'), v.literal('rejected'))),
  approvalNotes: v.optional(v.string()),
})

// Phase 5: Technical
const buildInfraPayload = v.object({
  type: v.literal('buildInfra'),
  taskName: v.string(),
  infraReady: v.optional(v.boolean()),
})

const configAnalyticsPayload = v.object({
  type: v.literal('configAnalytics'),
  taskName: v.string(),
  analyticsConfigured: v.optional(v.boolean()),
})

const setupMediaPayload = v.object({
  type: v.literal('setupMedia'),
  taskName: v.string(),
  mediaReady: v.optional(v.boolean()),
})

const qaTestPayload = v.object({
  type: v.literal('qaTest'),
  taskName: v.string(),
  decision: v.optional(v.union(v.literal('passed'), v.literal('failed'))),
  testResults: v.optional(v.string()),
})

const fixIssuesPayload = v.object({
  type: v.literal('fixIssues'),
  taskName: v.string(),
  issuesFixed: v.optional(v.boolean()),
})

// Phase 6: Launch
const preLaunchReviewPayload = v.object({
  type: v.literal('preLaunchReview'),
  taskName: v.string(),
  checklistComplete: v.optional(v.boolean()),
})

const addressConcernsPayload = v.object({
  type: v.literal('addressConcerns'),
  taskName: v.string(),
  concernsAddressed: v.optional(v.boolean()),
})

const launchApprovalPayload = v.object({
  type: v.literal('launchApproval'),
  taskName: v.string(),
  decision: v.optional(
    v.union(
      v.literal('approved'),
      v.literal('concerns'),
      v.literal('rejected'),
    ),
  ),
  approvalNotes: v.optional(v.string()),
})

const internalCommsPayload = v.object({
  type: v.literal('internalComms'),
  taskName: v.string(),
  communicationsSent: v.optional(v.boolean()),
})

// Phase 7: Execution
const launchCampaignPayload = v.object({
  type: v.literal('launchCampaign'),
  taskName: v.string(),
  launchConfirmed: v.optional(v.boolean()),
})

const monitorPerformancePayload = v.object({
  type: v.literal('monitorPerformance'),
  taskName: v.string(),
  performanceNotes: v.optional(v.string()),
})

const ongoingOptimizationPayload = v.object({
  type: v.literal('ongoingOptimization'),
  taskName: v.string(),
  optimizationNotes: v.optional(v.string()),
  decision: v.optional(v.union(v.literal('continue'), v.literal('end'))),
})

// Phase 8: Closure
const endCampaignPayload = v.object({
  type: v.literal('endCampaign'),
  taskName: v.string(),
  endConfirmed: v.optional(v.boolean()),
})

const compileDataPayload = v.object({
  type: v.literal('compileData'),
  taskName: v.string(),
  dataCompiled: v.optional(v.boolean()),
})

const conductAnalysisPayload = v.object({
  type: v.literal('conductAnalysis'),
  taskName: v.string(),
  analysisDocument: v.optional(v.string()),
})

const presentResultsPayload = v.object({
  type: v.literal('presentResults'),
  taskName: v.string(),
  presentationComplete: v.optional(v.boolean()),
})

const archiveMaterialsPayload = v.object({
  type: v.literal('archiveMaterials'),
  taskName: v.string(),
  archiveComplete: v.optional(v.boolean()),
})

/**
 * Work item metadata table for campaign_approval workflow
 * Uses auth scope-based authorization with discriminated union payload
 */
const campaignWorkItems = defineWorkItemMetadataTable('campaigns').withPayload(
  v.union(
    // Phase 1: Initiation
    submitRequestPayload,
    intakeReviewPayload,
    assignOwnerPayload,
    // Phase 2: Strategy
    conductResearchPayload,
    defineMetricsPayload,
    developStrategyPayload,
    createPlanPayload,
    // Phase 3: Budget
    developBudgetPayload,
    directorApprovalPayload,
    executiveApprovalPayload,
    secureResourcesPayload,
    // Phase 4: Creative
    createBriefPayload,
    developConceptsPayload,
    internalReviewPayload,
    reviseAssetsPayload,
    legalReviewPayload,
    legalRevisePayload,
    finalApprovalPayload,
    // Phase 5: Technical
    buildInfraPayload,
    configAnalyticsPayload,
    setupMediaPayload,
    qaTestPayload,
    fixIssuesPayload,
    // Phase 6: Launch
    preLaunchReviewPayload,
    addressConcernsPayload,
    launchApprovalPayload,
    internalCommsPayload,
    // Phase 7: Execution
    launchCampaignPayload,
    monitorPerformancePayload,
    ongoingOptimizationPayload,
    // Phase 8: Closure
    endCampaignPayload,
    compileDataPayload,
    conductAnalysisPayload,
    presentResultsPayload,
    archiveMaterialsPayload,
  ),
)

export default {
  campaigns,
  campaignBudgets,
  campaignCreatives,
  campaignKPIs,
  campaignResearch,
  campaignStrategy,
  campaignTimeline,
  campaignApprovals,
  campaignWorkItems,
}
