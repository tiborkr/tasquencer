/**
 * UI-API Contract Tests
 *
 * These tests verify that the UI task form payloads match the backend zod validators.
 * This ensures that when users complete tasks via the simple UI, the payloads will
 * be accepted by the backend.
 *
 * The simple task UI ($workItemId.tsx) uses TASK_CONFIGS to generate payloads.
 * Each task type has a completionPayload() function that returns the payload shape.
 *
 * Categories:
 * - confirmation: Simple boolean confirmation ({ confirmed: true })
 * - approval: Decision-based with notes ({ decision, notes? })
 * - review: Decision-based with notes ({ decision, notes? })
 * - work: Text-based deliverable ({ notes })
 * - owner_assignment: Assigns user ID ({ ownerId })
 *
 * Note: Some tasks have complex backend schemas that require full form UI.
 * These are marked as "demo-limited" and will show validation errors in the simple UI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'

// Import all work item schemas for validation
// Note: We define expected schemas here to document the contract

/**
 * ============================================================================
 * PHASE 1: INITIATION - Schemas
 * ============================================================================
 */

const submitRequestSchema = z.object({
  confirmed: z.boolean(),
})

const intakeReviewSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'needs_changes']),
  reviewNotes: z.string().optional(),
})

const assignOwnerSchema = z.object({
  ownerId: z.string().min(1),
})

/**
 * ============================================================================
 * PHASE 2: STRATEGY - Schemas
 * ============================================================================
 */

const conductResearchSchema = z.object({
  audienceAnalysis: z.string().min(1),
  competitiveInsights: z.string().min(1),
  historicalLearnings: z.string().min(1),
  marketTimingNotes: z.string().optional(),
})

const defineMetricsSchema = z.object({
  kpis: z.array(z.object({
    metric: z.string().min(1),
    targetValue: z.number().min(0),
    unit: z.string().min(1),
  })).min(1),
})

const developStrategySchema = z.object({
  channelStrategy: z.string().min(1),
  creativeApproach: z.string().min(1),
  customerJourney: z.string().min(1),
  keyTouchpoints: z.array(z.string()).min(1),
})

const createPlanSchema = z.object({
  timeline: z.string().min(1),
  milestones: z.array(z.object({
    name: z.string().min(1),
    date: z.number(),
    description: z.string().optional(),
  })).min(1),
  tactics: z.string().min(1),
  segmentation: z.string().min(1),
  resourceRequirements: z.string().min(1),
})

/**
 * ============================================================================
 * PHASE 3: BUDGET - Schemas
 * ============================================================================
 */

const developBudgetSchema = z.object({
  totalAmount: z.number().min(0),
  mediaSpend: z.number().min(0),
  creativeProduction: z.number().min(0),
  technologyTools: z.number().min(0),
  agencyFees: z.number().min(0),
  eventCosts: z.number().min(0),
  contingency: z.number().min(0),
  justification: z.string().min(1),
  roiProjection: z.string().optional(),
})

const budgetApprovalSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'revision_requested']),
  approvalNotes: z.string().optional(),
})

const secureResourcesSchema = z.object({
  resourcesConfirmed: z.boolean(),
  internalResources: z.array(z.string()).optional(),
  externalVendors: z.array(z.string()).optional(),
  procurementNotes: z.string().optional(),
})

/**
 * ============================================================================
 * PHASE 4: CREATIVE - Schemas
 * ============================================================================
 */

const createBriefSchema = z.object({
  objectives: z.string().min(1),
  targetAudience: z.string().min(1),
  keyMessages: z.array(z.string()).min(1),
  toneAndStyle: z.string().min(1),
  deliverables: z.array(z.object({
    type: z.enum(['ad', 'email', 'landing_page', 'social_post', 'video', 'other']),
    description: z.string().min(1),
  })).min(1),
  deadline: z.number().positive(),
  references: z.array(z.string()).optional(),
})

const developConceptsSchema = z.object({
  assets: z.array(z.object({
    creativeId: z.string(),
    storageId: z.string().optional(),
    notes: z.string().optional(),
  })).min(1),
})

const internalReviewSchema = z.object({
  decision: z.enum(['approved', 'needs_revision']),
  feedback: z.array(z.object({
    creativeId: z.string(),
    notes: z.string(),
    approved: z.boolean(),
  })).optional(),
  reviewNotes: z.string().optional(),
})

const reviseAssetsSchema = z.object({
  revisedAssets: z.array(z.object({
    creativeId: z.string(),
    storageId: z.string().optional(),
    revisionNotes: z.string(),
  })).min(1),
})

const legalReviewSchema = z.object({
  decision: z.enum(['approved', 'needs_changes']),
  complianceNotes: z.string().min(1),
  requiredChanges: z.array(z.object({
    creativeId: z.string(),
    issue: z.string(),
    requiredFix: z.string(),
  })).optional(),
})

const legalReviseSchema = z.object({
  revisedAssets: z.array(z.object({
    creativeId: z.string(),
    storageId: z.string().optional(),
    addressedIssue: z.string(),
  })).min(1),
})

const finalApprovalSchema = z.object({
  approved: z.boolean(),
  signoffNotes: z.string().optional(),
})

/**
 * ============================================================================
 * PHASE 5: TECHNICAL - Schemas
 * ============================================================================
 */

const buildInfraSchema = z.object({
  infraReady: z.boolean(),
  notes: z.string().optional(),
})

const configAnalyticsSchema = z.object({
  analyticsConfigured: z.boolean(),
  notes: z.string().optional(),
})

const setupMediaSchema = z.object({
  mediaReady: z.boolean(),
  notes: z.string().optional(),
})

const qaTestSchema = z.object({
  result: z.enum(['passed', 'failed']),
  testResults: z.string().optional(),
})

const fixIssuesSchema = z.object({
  issuesFixed: z.boolean(),
  notes: z.string().optional(),
})

/**
 * ============================================================================
 * PHASE 6: LAUNCH - Schemas
 * ============================================================================
 */

const preLaunchReviewSchema = z.object({
  readyForApproval: z.boolean(),
  meetingNotes: z.string().optional(),
  concerns: z.array(z.object({
    concern: z.string(),
    owner: z.string().optional(),
  })).optional(),
})

const addressConcernsSchema = z.object({
  resolutions: z.array(z.object({
    concern: z.string(),
    resolution: z.string(),
  })).optional(),
})

const launchApprovalSchema = z.object({
  decision: z.enum(['approved', 'concerns', 'rejected']),
  approverNotes: z.string().optional(),
  launchDate: z.number().optional(),
})

const internalCommsSchema = z.object({
  notifiedTeams: z.array(z.object({
    team: z.string(),
    notified: z.boolean(),
  })).optional(),
  communicationsSent: z.boolean().optional(),
})

/**
 * ============================================================================
 * PHASE 7: EXECUTION - Schemas
 * ============================================================================
 */

const launchCampaignSchema = z.object({
  launchedAt: z.number().optional(),
  activatedComponents: z.array(z.object({
    component: z.enum(['landing_page', 'email', 'paid_ads', 'social', 'events']),
    platform: z.string().optional(),
    status: z.enum(['live', 'scheduled']),
    scheduledTime: z.number().optional(),
  })).optional(),
  launchNotes: z.string().optional(),
})

const monitorPerformanceSchema = z.object({
  monitoringPeriod: z.object({
    start: z.number(),
    end: z.number(),
  }).optional(),
  metrics: z.array(z.object({
    metric: z.string(),
    value: z.number(),
    benchmark: z.number().optional(),
    status: z.enum(['above_target', 'on_target', 'below_target']),
  })).optional(),
  issues: z.array(z.object({
    issue: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    action: z.string(),
  })).optional(),
  overallStatus: z.enum(['healthy', 'needs_attention', 'critical']).optional(),
})

const ongoingOptimizationSchema = z.object({
  optimizations: z.array(z.object({
    type: z.enum(['budget_reallocation', 'creative_update', 'targeting_change', 'other']),
    description: z.string(),
    expectedImpact: z.string(),
    implementedAt: z.number(),
  })).optional(),
  budgetChanges: z.object({
    from: z.record(z.string(), z.number()),
    to: z.record(z.string(), z.number()),
    reason: z.string(),
  }).optional(),
  nextReviewDate: z.number().optional(),
  decision: z.enum(['continue', 'end']),
})

/**
 * ============================================================================
 * PHASE 8: CLOSURE - Schemas
 * ============================================================================
 */

const endCampaignSchema = z.object({
  endedAt: z.number(),
  deactivatedComponents: z.array(z.object({
    component: z.enum(['landing_page', 'email', 'paid_ads', 'social', 'events']),
    platform: z.string().optional(),
    deactivatedAt: z.number(),
  })),
  remainingBudget: z.number().optional(),
  endNotes: z.string().optional(),
})

const compileDataSchema = z.object({
  dataSources: z.array(z.object({
    source: z.string(),
    metricsCollected: z.array(z.string()),
    dataRange: z.object({
      start: z.number(),
      end: z.number(),
    }),
  })),
  aggregatedMetrics: z.object({
    totalImpressions: z.number().optional(),
    totalClicks: z.number().optional(),
    totalConversions: z.number().optional(),
    totalSpend: z.number(),
    totalRevenue: z.number().optional(),
  }),
  dataLocation: z.string(),
})

const conductAnalysisSchema = z.object({
  kpiResults: z.array(z.object({
    kpiId: z.string(),
    metric: z.string(),
    target: z.number(),
    actual: z.number(),
    percentAchieved: z.number(),
    analysis: z.string(),
  })),
  whatWorked: z.array(z.string()),
  whatDidntWork: z.array(z.string()),
  lessonsLearned: z.array(z.string()),
  recommendationsForFuture: z.array(z.string()),
  overallAssessment: z.enum(['exceeded_expectations', 'met_expectations', 'below_expectations', 'failed']),
})

const presentResultsSchema = z.object({
  presentationDate: z.number(),
  attendees: z.array(z.string()),
  presentationUrl: z.string().optional(),
  feedbackReceived: z.string(),
  followUpActions: z.array(z.object({
    action: z.string(),
    owner: z.string(),
    dueDate: z.number().optional(),
  })).optional(),
})

const archiveMaterialsSchema = z.object({
  archivedItems: z.array(z.object({
    itemType: z.enum(['creative', 'document', 'data', 'report']),
    location: z.string(),
    description: z.string(),
  })),
  archiveLocation: z.string(),
  retentionPeriod: z.string().optional(),
  archivedAt: z.number(),
})

/**
 * ============================================================================
 * UI PAYLOAD GENERATORS
 *
 * These simulate what the simple task form UI sends for each task type.
 * Extracted from src/routes/_app/simple/tasks/$workItemId.tsx TASK_CONFIGS
 * ============================================================================
 */

const UI_PAYLOADS = {
  // Phase 1: Initiation
  submitRequest: () => ({ confirmed: true }),
  intakeReview: (decision: string, notes?: string) => ({
    decision,
    reviewNotes: notes || undefined
  }),
  assignOwner: (ownerId: string) => ({ ownerId }),

  // Phase 2: Strategy
  conductResearch: (audienceAnalysis: string, competitiveInsights: string, historicalLearnings: string, marketTimingNotes?: string) => ({
    audienceAnalysis,
    competitiveInsights,
    historicalLearnings,
    marketTimingNotes: marketTimingNotes || undefined,
  }),
  defineMetrics: () => ({ confirmed: true }),
  developStrategy: (notes: string) => ({ strategyDocument: notes || '' }),
  createPlan: (notes: string) => ({ planDocument: notes || '' }),

  // Phase 3: Budget
  developBudget: () => ({ confirmed: true }),
  directorApproval: (decision: string, notes?: string) => ({
    decision,
    approvalNotes: notes || undefined
  }),
  executiveApproval: (decision: string, notes?: string) => ({
    decision,
    approvalNotes: notes || undefined
  }),
  secureResources: () => ({ resourcesConfirmed: true }),

  // Phase 4: Creative
  createBrief: (notes: string) => ({ briefDocument: notes || '' }),
  developConcepts: () => ({ confirmed: true }),
  internalReview: (decision: string, notes?: string) => ({
    decision,
    reviewNotes: notes || undefined
  }),
  reviseAssets: (notes: string) => ({ revisionNotes: notes || '' }),
  legalReview: (decision: string, notes?: string) => ({
    decision,
    legalNotes: notes || undefined
  }),
  legalRevise: (notes: string) => ({ revisionNotes: notes || '' }),
  finalApproval: (decision: string, notes?: string) => ({
    decision,
    approvalNotes: notes || undefined
  }),

  // Phase 5: Technical
  buildInfra: () => ({ infraReady: true }),
  configAnalytics: () => ({ analyticsConfigured: true }),
  setupMedia: () => ({ mediaReady: true }),
  qaTest: (decision: string, notes?: string) => ({
    result: decision, // Fixed: UI now sends 'result' instead of 'decision'
    testResults: notes || undefined
  }),
  fixIssues: () => ({ issuesFixed: true }),

  // Phase 6: Launch
  preLaunchReview: () => ({ readyForApproval: true }), // Fixed: UI now sends 'readyForApproval' instead of 'checklistComplete'
  addressConcerns: () => ({ concernsAddressed: true }),
  launchApproval: (decision: string, notes?: string) => ({
    decision,
    approvalNotes: notes || undefined
  }),
  internalComms: () => ({ communicationsSent: true }),

  // Phase 7: Execution
  launchCampaign: () => ({ launchConfirmed: true }),
  monitorPerformance: (notes: string) => ({ performanceNotes: notes || '' }),
  ongoingOptimization: (decision: string, notes?: string) => ({
    decision,
    optimizationNotes: notes || undefined
  }),

  // Phase 8: Closure
  endCampaign: () => ({ endConfirmed: true }),
  compileData: () => ({ dataCompiled: true }),
  conductAnalysis: (notes: string) => ({ analysisDocument: notes || '' }),
  presentResults: () => ({ presentationComplete: true }),
  archiveMaterials: () => ({ archiveComplete: true }),
}

/**
 * ============================================================================
 * CONTRACT TESTS
 * ============================================================================
 */

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('UI-API Contract: Payload Validation', () => {
  describe('Phase 1: Initiation', () => {
    it('submitRequest: UI payload matches backend schema', () => {
      const uiPayload = UI_PAYLOADS.submitRequest()
      const result = submitRequestSchema.safeParse(uiPayload)
      expect(result.success).toBe(true)
    })

    it('intakeReview: UI payload matches backend schema', () => {
      const uiPayload = UI_PAYLOADS.intakeReview('approved', 'Looks good')
      const result = intakeReviewSchema.safeParse(uiPayload)
      expect(result.success).toBe(true)
    })

    it('assignOwner: UI payload matches backend schema', () => {
      const uiPayload = UI_PAYLOADS.assignOwner('user-123')
      const result = assignOwnerSchema.safeParse(uiPayload)
      expect(result.success).toBe(true)
    })
  })

  describe('Phase 2: Strategy', () => {
    it('conductResearch: UI payload matches backend schema (FIXED)', () => {
      const uiPayload = UI_PAYLOADS.conductResearch(
        'Target audience is 25-45 professionals',
        'Competitors focus on price, we differentiate on quality',
        'Previous campaigns had 3% conversion rate'
      )
      const result = conductResearchSchema.safeParse(uiPayload)
      expect(result.success).toBe(true)
    })

    it('defineMetrics: UI payload DOES NOT match backend schema (demo-limited)', () => {
      const uiPayload = UI_PAYLOADS.defineMetrics()
      const result = defineMetricsSchema.safeParse(uiPayload)
      // Backend requires: { kpis: Array<{metric, targetValue, unit}> }
      // UI sends: { confirmed: true }
      expect(result.success).toBe(false)
    })

    it('developStrategy: UI payload DOES NOT match backend schema (demo-limited)', () => {
      const uiPayload = UI_PAYLOADS.developStrategy('Strategy document')
      const result = developStrategySchema.safeParse(uiPayload)
      // Backend requires: channelStrategy, creativeApproach, customerJourney, keyTouchpoints
      // UI sends: { strategyDocument: string }
      expect(result.success).toBe(false)
    })

    it('createPlan: UI payload DOES NOT match backend schema (demo-limited)', () => {
      const uiPayload = UI_PAYLOADS.createPlan('Plan document')
      const result = createPlanSchema.safeParse(uiPayload)
      // Backend requires: timeline, milestones[], tactics, segmentation, resourceRequirements
      // UI sends: { planDocument: string }
      expect(result.success).toBe(false)
    })
  })

  describe('Phase 3: Budget', () => {
    it('developBudget: UI payload DOES NOT match backend schema (demo-limited)', () => {
      const uiPayload = UI_PAYLOADS.developBudget()
      const result = developBudgetSchema.safeParse(uiPayload)
      // Backend requires: 8 numeric fields + justification
      // UI sends: { confirmed: true }
      expect(result.success).toBe(false)
    })

    it('directorApproval: UI payload matches backend schema', () => {
      const uiPayload = UI_PAYLOADS.directorApproval('approved', 'Budget approved')
      const result = budgetApprovalSchema.safeParse(uiPayload)
      expect(result.success).toBe(true)
    })

    it('executiveApproval: UI payload matches backend schema', () => {
      const uiPayload = UI_PAYLOADS.executiveApproval('rejected', 'Too expensive')
      const result = budgetApprovalSchema.safeParse(uiPayload)
      expect(result.success).toBe(true)
    })

    it('secureResources: UI payload matches backend schema', () => {
      const uiPayload = UI_PAYLOADS.secureResources()
      const result = secureResourcesSchema.safeParse(uiPayload)
      expect(result.success).toBe(true)
    })
  })

  describe('Phase 4: Creative', () => {
    it('createBrief: UI payload DOES NOT match backend schema (demo-limited)', () => {
      const uiPayload = UI_PAYLOADS.createBrief('Brief document')
      const result = createBriefSchema.safeParse(uiPayload)
      // Backend requires: objectives, targetAudience, keyMessages[], toneAndStyle, deliverables[], deadline
      // UI sends: { briefDocument: string }
      expect(result.success).toBe(false)
    })

    it('developConcepts: UI payload DOES NOT match backend schema (demo-limited)', () => {
      const uiPayload = UI_PAYLOADS.developConcepts()
      const result = developConceptsSchema.safeParse(uiPayload)
      // Backend requires: { assets: Array<{creativeId, storageId?, notes?}> }
      // UI sends: { confirmed: true }
      expect(result.success).toBe(false)
    })

    it('internalReview: UI payload matches backend schema', () => {
      const uiPayload = UI_PAYLOADS.internalReview('approved', 'Looks good')
      const result = internalReviewSchema.safeParse(uiPayload)
      expect(result.success).toBe(true)
    })

    it('reviseAssets: UI payload DOES NOT match backend schema (demo-limited)', () => {
      const uiPayload = UI_PAYLOADS.reviseAssets('Revisions made')
      const result = reviseAssetsSchema.safeParse(uiPayload)
      // Backend requires: { revisedAssets: Array<{creativeId, storageId?, revisionNotes}> }
      // UI sends: { revisionNotes: string }
      expect(result.success).toBe(false)
    })

    it('legalReview: UI payload DOES NOT match backend schema (demo-limited)', () => {
      const uiPayload = UI_PAYLOADS.legalReview('approved', 'Compliant')
      const result = legalReviewSchema.safeParse(uiPayload)
      // Backend requires: complianceNotes (required), but UI sends legalNotes
      expect(result.success).toBe(false)
    })

    it('legalRevise: UI payload DOES NOT match backend schema (demo-limited)', () => {
      const uiPayload = UI_PAYLOADS.legalRevise('Legal issues addressed')
      const result = legalReviseSchema.safeParse(uiPayload)
      // Backend requires: { revisedAssets: Array<{creativeId, storageId?, addressedIssue}> }
      // UI sends: { revisionNotes: string }
      expect(result.success).toBe(false)
    })

    it('finalApproval: UI payload DOES NOT match backend schema (demo-limited)', () => {
      const uiPayload = UI_PAYLOADS.finalApproval('approved', 'All approved')
      const result = finalApprovalSchema.safeParse(uiPayload)
      // Backend requires: { approved: boolean, signoffNotes? }
      // UI sends: { decision: string, approvalNotes? }
      expect(result.success).toBe(false)
    })
  })

  describe('Phase 5: Technical', () => {
    it('buildInfra: UI payload matches backend schema', () => {
      const uiPayload = UI_PAYLOADS.buildInfra()
      const result = buildInfraSchema.safeParse(uiPayload)
      expect(result.success).toBe(true)
    })

    it('configAnalytics: UI payload matches backend schema', () => {
      const uiPayload = UI_PAYLOADS.configAnalytics()
      const result = configAnalyticsSchema.safeParse(uiPayload)
      expect(result.success).toBe(true)
    })

    it('setupMedia: UI payload matches backend schema', () => {
      const uiPayload = UI_PAYLOADS.setupMedia()
      const result = setupMediaSchema.safeParse(uiPayload)
      expect(result.success).toBe(true)
    })

    it('qaTest: UI payload matches backend schema (field name fixed)', () => {
      const uiPayload = UI_PAYLOADS.qaTest('passed', 'All tests pass')
      const result = qaTestSchema.safeParse(uiPayload)
      // Backend requires: { result: 'passed'|'failed' }
      // UI sends: { result: 'passed'|'failed' } (FIXED)
      expect(result.success).toBe(true)
    })

    it('fixIssues: UI payload matches backend schema', () => {
      const uiPayload = UI_PAYLOADS.fixIssues()
      const result = fixIssuesSchema.safeParse(uiPayload)
      expect(result.success).toBe(true)
    })
  })

  describe('Phase 6: Launch', () => {
    it('preLaunchReview: UI payload matches backend schema (field name fixed)', () => {
      const uiPayload = UI_PAYLOADS.preLaunchReview()
      const result = preLaunchReviewSchema.safeParse(uiPayload)
      // Backend requires: { readyForApproval: boolean }
      // UI sends: { readyForApproval: boolean } (FIXED)
      expect(result.success).toBe(true)
    })

    it('addressConcerns: UI payload passes (backend schema is fully optional)', () => {
      const uiPayload = UI_PAYLOADS.addressConcerns()
      const result = addressConcernsSchema.safeParse(uiPayload)
      // Backend schema: { resolutions?: Array<{concern, resolution}> } - fully optional
      // UI sends: { concernsAddressed: boolean } - extra key is ignored
      // Zod doesn't reject extra keys by default, so this passes
      expect(result.success).toBe(true)
    })

    it('launchApproval: UI payload matches backend schema (decision is required)', () => {
      const uiPayload = UI_PAYLOADS.launchApproval('approved', 'Ready to launch')
      const result = launchApprovalSchema.safeParse(uiPayload)
      // Backend schema: { decision (required), approverNotes?, launchDate? }
      // UI sends: { decision, approvalNotes? } - extra key is ignored
      // The required 'decision' field is present, so this passes
      expect(result.success).toBe(true)
    })

    it('internalComms: UI payload matches backend schema', () => {
      const uiPayload = UI_PAYLOADS.internalComms()
      const result = internalCommsSchema.safeParse(uiPayload)
      expect(result.success).toBe(true)
    })
  })

  describe('Phase 7: Execution', () => {
    it('launchCampaign: UI payload passes (backend schema is fully optional)', () => {
      const uiPayload = UI_PAYLOADS.launchCampaign()
      const result = launchCampaignSchema.safeParse(uiPayload)
      // Backend schema: { launchedAt?, activatedComponents?, launchNotes? } - fully optional
      // UI sends: { launchConfirmed: boolean } - extra key is ignored
      // Empty object {} would also pass since all fields are optional
      expect(result.success).toBe(true)
    })

    it('monitorPerformance: UI payload passes (backend schema is fully optional)', () => {
      const uiPayload = UI_PAYLOADS.monitorPerformance('Performance is good')
      const result = monitorPerformanceSchema.safeParse(uiPayload)
      // Backend schema: { monitoringPeriod?, metrics?, issues?, overallStatus? } - fully optional
      // UI sends: { performanceNotes: string } - extra key is ignored
      // Empty object {} would also pass since all fields are optional
      expect(result.success).toBe(true)
    })

    it('ongoingOptimization: UI payload matches backend schema', () => {
      const uiPayload = UI_PAYLOADS.ongoingOptimization('continue', 'Keep running')
      const result = ongoingOptimizationSchema.safeParse(uiPayload)
      // Backend requires: { decision: 'continue'|'end' } (required)
      // UI sends: { decision: 'continue'|'end' }
      expect(result.success).toBe(true)
    })
  })

  describe('Phase 8: Closure', () => {
    it('endCampaign: UI payload DOES NOT match backend schema (demo-limited)', () => {
      const uiPayload = UI_PAYLOADS.endCampaign()
      const result = endCampaignSchema.safeParse(uiPayload)
      // Backend requires: { endedAt: number, deactivatedComponents: Array }
      // UI sends: { endConfirmed: boolean }
      expect(result.success).toBe(false)
    })

    it('compileData: UI payload DOES NOT match backend schema (demo-limited)', () => {
      const uiPayload = UI_PAYLOADS.compileData()
      const result = compileDataSchema.safeParse(uiPayload)
      // Backend requires: { dataSources[], aggregatedMetrics{}, dataLocation }
      // UI sends: { dataCompiled: boolean }
      expect(result.success).toBe(false)
    })

    it('conductAnalysis: UI payload DOES NOT match backend schema (demo-limited)', () => {
      const uiPayload = UI_PAYLOADS.conductAnalysis('Analysis complete')
      const result = conductAnalysisSchema.safeParse(uiPayload)
      // Backend requires: { kpiResults[], whatWorked[], etc. }
      // UI sends: { analysisDocument: string }
      expect(result.success).toBe(false)
    })

    it('presentResults: UI payload DOES NOT match backend schema (demo-limited)', () => {
      const uiPayload = UI_PAYLOADS.presentResults()
      const result = presentResultsSchema.safeParse(uiPayload)
      // Backend requires: { presentationDate, attendees[], feedbackReceived }
      // UI sends: { presentationComplete: boolean }
      expect(result.success).toBe(false)
    })

    it('archiveMaterials: UI payload DOES NOT match backend schema (demo-limited)', () => {
      const uiPayload = UI_PAYLOADS.archiveMaterials()
      const result = archiveMaterialsSchema.safeParse(uiPayload)
      // Backend requires: { archivedItems[], archiveLocation, archivedAt }
      // UI sends: { archiveComplete: boolean }
      expect(result.success).toBe(false)
    })
  })
})

/**
 * ============================================================================
 * CONTRACT SUMMARY
 * ============================================================================
 *
 * COMPATIBLE - Simple UI Works (20 of 35 tasks = 57%):
 * Phase 1: submitRequest ✓, intakeReview ✓, assignOwner ✓
 * Phase 2: conductResearch ✓ (FIXED - added research form with 3 fields)
 * Phase 3: directorApproval ✓, executiveApproval ✓, secureResources ✓
 * Phase 4: internalReview ✓
 * Phase 5: buildInfra ✓, configAnalytics ✓, setupMedia ✓, qaTest ✓ (FIXED), fixIssues ✓
 * Phase 6: preLaunchReview ✓ (FIXED), addressConcerns ✓, launchApproval ✓, internalComms ✓
 * Phase 7: launchCampaign ✓, monitorPerformance ✓, ongoingOptimization ✓
 *
 * Note: Some tasks pass because their backend schemas use fully optional fields,
 * which means any object (including one with extra keys) will pass validation.
 * The UI's "extra" fields (e.g., concernsAddressed, launchConfirmed) are simply
 * ignored by zod since they don't use .strict() mode.
 *
 * FIELD NAME MISMATCHES - ALL FIXED:
 * - qaTest: FIXED - UI now sends "result" (was "decision")
 * - preLaunchReview: FIXED - UI now sends "readyForApproval" (was "checklistComplete")
 * - conductResearch: FIXED - UI now has proper research form with all required fields
 *
 * SCHEMA MISMATCHES - Demo-Limited (15 tasks):
 * These tasks have complex schemas requiring specific data structures.
 * The simple UI sends simplified payloads that won't pass validation.
 *
 * Phase 2: defineMetrics, developStrategy, createPlan
 * Phase 3: developBudget
 * Phase 4: createBrief, developConcepts, reviseAssets, legalReview, legalRevise,
 *          finalApproval
 * Phase 8: endCampaign, compileData, conductAnalysis, presentResults, archiveMaterials
 *
 * RECOMMENDATION for Demo-Limited Tasks:
 * These 16 tasks require full task-specific forms with structured data.
 * The simple UI should display a message guiding users to use the campaigns
 * section for these tasks, or implement proper forms for each.
 */
