import type { DatabaseReader, DatabaseWriter } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'

// ============================================================================
// Work Item Metadata Functions
// ============================================================================

/**
 * Get campaign work items by aggregate (campaign) ID
 * Used for routing decisions based on work item payload
 */
export async function getCampaignWorkItemsByAggregate(
  db: DatabaseReader,
  campaignId: Id<'campaigns'>,
): Promise<Doc<'campaignWorkItems'>[]> {
  return await db
    .query('campaignWorkItems')
    .withIndex('by_aggregateTableId', (q) => q.eq('aggregateTableId', campaignId))
    .collect()
}

// ============================================================================
// Campaign Functions (Aggregate Root)
// ============================================================================

/**
 * Insert a new campaign record
 */
export async function insertCampaign(
  db: DatabaseWriter,
  campaign: Omit<Doc<'campaigns'>, '_id' | '_creationTime'>,
): Promise<Id<'campaigns'>> {
  return await db.insert('campaigns', campaign)
}

/**
 * Get campaign by ID
 */
export async function getCampaign(
  db: DatabaseReader,
  campaignId: Id<'campaigns'>,
): Promise<Doc<'campaigns'> | null> {
  return await db.get(campaignId)
}

/**
 * Get campaign by workflow ID
 */
export async function getCampaignByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<'tasquencerWorkflows'>,
): Promise<Doc<'campaigns'> | null> {
  return await db
    .query('campaigns')
    .withIndex('by_workflow_id', (q) => q.eq('workflowId', workflowId))
    .unique()
}

/**
 * Update campaign fields
 */
export async function updateCampaign(
  db: DatabaseWriter,
  campaignId: Id<'campaigns'>,
  updates: Partial<
    Omit<Doc<'campaigns'>, '_id' | '_creationTime' | 'workflowId'>
  >,
): Promise<void> {
  await db.patch(campaignId, { ...updates, updatedAt: Date.now() })
}

/**
 * List all campaigns ordered by creation time descending
 */
export async function listCampaigns(
  db: DatabaseReader,
): Promise<Doc<'campaigns'>[]> {
  return await db.query('campaigns').order('desc').collect()
}

/**
 * Campaign status type
 */
export type CampaignStatus =
  | 'draft'
  | 'intake_review'
  | 'strategy'
  | 'budget_approval'
  | 'creative_development'
  | 'technical_setup'
  | 'pre_launch'
  | 'active'
  | 'completed'
  | 'cancelled'

/**
 * Filter options for listing campaigns
 */
export interface CampaignFilterOptions {
  status?: CampaignStatus
  ownerId?: Id<'users'>
  requesterId?: Id<'users'>
  limit?: number
  cursor?: string // JSON stringified cursor for pagination
}

/**
 * Paginated result for campaigns
 */
export interface PaginatedCampaignsResult {
  campaigns: Doc<'campaigns'>[]
  nextCursor: string | null
  hasMore: boolean
}

/**
 * List campaigns with optional filters and pagination
 *
 * Supports filtering by status, ownerId, and requesterId.
 * Supports cursor-based pagination with limit.
 *
 * Filter priority (if multiple specified):
 * 1. ownerId (uses by_owner_id index)
 * 2. requesterId (uses by_requester_id index)
 * 3. Full table scan (if no indexed filter)
 *
 * Status is always filtered in memory after the initial query.
 */
export async function listCampaignsWithFilters(
  db: DatabaseReader,
  options: CampaignFilterOptions = {},
): Promise<PaginatedCampaignsResult> {
  const { status, ownerId, requesterId, limit = 50, cursor } = options

  // Parse cursor if provided
  let startAfterTime: number | undefined
  let startAfterId: Id<'campaigns'> | undefined
  if (cursor) {
    try {
      const parsed = JSON.parse(cursor) as {
        time: number
        id: Id<'campaigns'>
      }
      startAfterTime = parsed.time
      startAfterId = parsed.id
    } catch {
      // Invalid cursor, ignore
    }
  }

  // Fetch campaigns using the most specific index available
  let campaigns: Doc<'campaigns'>[]

  if (ownerId) {
    // Use by_owner_id index
    campaigns = await db
      .query('campaigns')
      .withIndex('by_owner_id', (q) => q.eq('ownerId', ownerId))
      .order('desc')
      .collect()
  } else if (requesterId) {
    // Use by_requester_id index
    campaigns = await db
      .query('campaigns')
      .withIndex('by_requester_id', (q) => q.eq('requesterId', requesterId))
      .order('desc')
      .collect()
  } else {
    // Full table scan
    campaigns = await db.query('campaigns').order('desc').collect()
  }

  // Apply status filter in memory
  if (status) {
    campaigns = campaigns.filter((c) => c.status === status)
  }

  // Apply cursor-based pagination
  if (startAfterTime !== undefined && startAfterId) {
    const cursorIndex = campaigns.findIndex(
      (c) =>
        c._creationTime === startAfterTime && c._id === startAfterId,
    )
    if (cursorIndex >= 0) {
      campaigns = campaigns.slice(cursorIndex + 1)
    }
  }

  // Apply limit and determine if there are more
  const hasMore = campaigns.length > limit
  const paginatedCampaigns = campaigns.slice(0, limit)

  // Create next cursor from the last item
  const lastCampaign = paginatedCampaigns[paginatedCampaigns.length - 1]
  const nextCursor =
    hasMore && lastCampaign
      ? JSON.stringify({
          time: lastCampaign._creationTime,
          id: lastCampaign._id,
        })
      : null

  return {
    campaigns: paginatedCampaigns,
    nextCursor,
    hasMore,
  }
}

/**
 * List campaigns by requester ID
 */
export async function listCampaignsByRequester(
  db: DatabaseReader,
  requesterId: Id<'users'>,
): Promise<Doc<'campaigns'>[]> {
  return await db
    .query('campaigns')
    .withIndex('by_requester_id', (q) => q.eq('requesterId', requesterId))
    .order('desc')
    .collect()
}

/**
 * List campaigns by owner ID
 */
export async function listCampaignsByOwner(
  db: DatabaseReader,
  ownerId: Id<'users'>,
): Promise<Doc<'campaigns'>[]> {
  return await db
    .query('campaigns')
    .withIndex('by_owner_id', (q) => q.eq('ownerId', ownerId))
    .order('desc')
    .collect()
}

// ============================================================================
// Budget Functions
// ============================================================================

/**
 * Insert a new campaign budget
 */
export async function insertCampaignBudget(
  db: DatabaseWriter,
  budget: Omit<Doc<'campaignBudgets'>, '_id' | '_creationTime'>,
): Promise<Id<'campaignBudgets'>> {
  return await db.insert('campaignBudgets', budget)
}

/**
 * Get budget by campaign ID
 */
export async function getCampaignBudgetByCampaignId(
  db: DatabaseReader,
  campaignId: Id<'campaigns'>,
): Promise<Doc<'campaignBudgets'> | null> {
  return await db
    .query('campaignBudgets')
    .withIndex('by_campaign_id', (q) => q.eq('campaignId', campaignId))
    .unique()
}

/**
 * Get budget by workflow ID
 */
export async function getCampaignBudgetByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<'tasquencerWorkflows'>,
): Promise<Doc<'campaignBudgets'> | null> {
  return await db
    .query('campaignBudgets')
    .withIndex('by_workflow_id', (q) => q.eq('workflowId', workflowId))
    .unique()
}

/**
 * Update campaign budget
 */
export async function updateCampaignBudget(
  db: DatabaseWriter,
  budgetId: Id<'campaignBudgets'>,
  updates: Partial<
    Omit<Doc<'campaignBudgets'>, '_id' | '_creationTime' | 'campaignId' | 'workflowId'>
  >,
): Promise<void> {
  await db.patch(budgetId, { ...updates, updatedAt: Date.now() })
}

// ============================================================================
// Creative Functions
// ============================================================================

/**
 * Insert a new creative asset
 */
export async function insertCampaignCreative(
  db: DatabaseWriter,
  creative: Omit<Doc<'campaignCreatives'>, '_id' | '_creationTime'>,
): Promise<Id<'campaignCreatives'>> {
  return await db.insert('campaignCreatives', creative)
}

/**
 * Get a single creative asset by ID
 */
export async function getCampaignCreative(
  db: DatabaseReader,
  creativeId: Id<'campaignCreatives'>,
): Promise<Doc<'campaignCreatives'> | null> {
  return await db.get(creativeId)
}

/**
 * List creative assets by campaign ID
 */
export async function listCreativesByCampaignId(
  db: DatabaseReader,
  campaignId: Id<'campaigns'>,
): Promise<Doc<'campaignCreatives'>[]> {
  return await db
    .query('campaignCreatives')
    .withIndex('by_campaign_id', (q) => q.eq('campaignId', campaignId))
    .order('desc')
    .collect()
}

/**
 * Update creative asset
 */
export async function updateCampaignCreative(
  db: DatabaseWriter,
  creativeId: Id<'campaignCreatives'>,
  updates: Partial<
    Omit<Doc<'campaignCreatives'>, '_id' | '_creationTime' | 'campaignId' | 'workflowId' | 'createdBy'>
  >,
): Promise<void> {
  await db.patch(creativeId, { ...updates, updatedAt: Date.now() })
}

/**
 * Increment creative version (creates new version on revision)
 */
export async function incrementCreativeVersion(
  db: DatabaseWriter,
  creativeId: Id<'campaignCreatives'>,
): Promise<void> {
  const creative = await db.get(creativeId)
  if (!creative) {
    throw new Error(`Creative ${creativeId} not found`)
  }
  await db.patch(creativeId, {
    version: creative.version + 1,
    updatedAt: Date.now(),
  })
}

// ============================================================================
// KPI Functions
// ============================================================================

/**
 * Insert a new KPI
 */
export async function insertCampaignKPI(
  db: DatabaseWriter,
  kpi: Omit<Doc<'campaignKPIs'>, '_id' | '_creationTime'>,
): Promise<Id<'campaignKPIs'>> {
  return await db.insert('campaignKPIs', kpi)
}

/**
 * List KPIs by campaign ID
 */
export async function listKPIsByCampaignId(
  db: DatabaseReader,
  campaignId: Id<'campaigns'>,
): Promise<Doc<'campaignKPIs'>[]> {
  return await db
    .query('campaignKPIs')
    .withIndex('by_campaign_id', (q) => q.eq('campaignId', campaignId))
    .collect()
}

/**
 * Update KPI (typically to set actualValue post-campaign)
 */
export async function updateCampaignKPI(
  db: DatabaseWriter,
  kpiId: Id<'campaignKPIs'>,
  updates: Partial<Pick<Doc<'campaignKPIs'>, 'actualValue' | 'targetValue'>>,
): Promise<void> {
  await db.patch(kpiId, updates)
}

// ============================================================================
// Research Functions (Phase 2)
// ============================================================================

/**
 * Insert a new research record
 */
export async function insertCampaignResearch(
  db: DatabaseWriter,
  research: Omit<Doc<'campaignResearch'>, '_id' | '_creationTime'>,
): Promise<Id<'campaignResearch'>> {
  return await db.insert('campaignResearch', research)
}

/**
 * Get research by campaign ID
 */
export async function getCampaignResearchByCampaignId(
  db: DatabaseReader,
  campaignId: Id<'campaigns'>,
): Promise<Doc<'campaignResearch'> | null> {
  return await db
    .query('campaignResearch')
    .withIndex('by_campaign_id', (q) => q.eq('campaignId', campaignId))
    .unique()
}

/**
 * Update campaign research
 */
export async function updateCampaignResearch(
  db: DatabaseWriter,
  researchId: Id<'campaignResearch'>,
  updates: Partial<
    Omit<Doc<'campaignResearch'>, '_id' | '_creationTime' | 'campaignId' | 'createdBy'>
  >,
): Promise<void> {
  await db.patch(researchId, { ...updates, updatedAt: Date.now() })
}

// ============================================================================
// Strategy Functions (Phase 2)
// ============================================================================

/**
 * Insert a new strategy record
 */
export async function insertCampaignStrategy(
  db: DatabaseWriter,
  strategy: Omit<Doc<'campaignStrategy'>, '_id' | '_creationTime'>,
): Promise<Id<'campaignStrategy'>> {
  return await db.insert('campaignStrategy', strategy)
}

/**
 * Get strategy by campaign ID
 */
export async function getCampaignStrategyByCampaignId(
  db: DatabaseReader,
  campaignId: Id<'campaigns'>,
): Promise<Doc<'campaignStrategy'> | null> {
  return await db
    .query('campaignStrategy')
    .withIndex('by_campaign_id', (q) => q.eq('campaignId', campaignId))
    .unique()
}

/**
 * Update campaign strategy
 */
export async function updateCampaignStrategy(
  db: DatabaseWriter,
  strategyId: Id<'campaignStrategy'>,
  updates: Partial<
    Omit<Doc<'campaignStrategy'>, '_id' | '_creationTime' | 'campaignId' | 'createdBy'>
  >,
): Promise<void> {
  await db.patch(strategyId, { ...updates, updatedAt: Date.now() })
}

// ============================================================================
// Timeline Functions (Phase 2)
// ============================================================================

/**
 * Milestone status type
 */
export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'delayed'

/**
 * Insert a new timeline milestone
 */
export async function insertCampaignMilestone(
  db: DatabaseWriter,
  milestone: Omit<Doc<'campaignTimeline'>, '_id' | '_creationTime'>,
): Promise<Id<'campaignTimeline'>> {
  return await db.insert('campaignTimeline', milestone)
}

/**
 * List milestones by campaign ID
 */
export async function listMilestonesByCampaignId(
  db: DatabaseReader,
  campaignId: Id<'campaigns'>,
): Promise<Doc<'campaignTimeline'>[]> {
  return await db
    .query('campaignTimeline')
    .withIndex('by_campaign_id', (q) => q.eq('campaignId', campaignId))
    .collect()
}

/**
 * Update milestone
 */
export async function updateCampaignMilestone(
  db: DatabaseWriter,
  milestoneId: Id<'campaignTimeline'>,
  updates: Partial<
    Omit<Doc<'campaignTimeline'>, '_id' | '_creationTime' | 'campaignId'>
  >,
): Promise<void> {
  await db.patch(milestoneId, { ...updates, updatedAt: Date.now() })
}

/**
 * Delete a milestone
 */
export async function deleteCampaignMilestone(
  db: DatabaseWriter,
  milestoneId: Id<'campaignTimeline'>,
): Promise<void> {
  await db.delete(milestoneId)
}

// ============================================================================
// Approvals Functions (Audit Trail)
// ============================================================================

/**
 * Approval type for categorizing approval decisions
 */
export type ApprovalType = 'intake' | 'budget' | 'creative' | 'legal' | 'launch'

/**
 * Approval decision values
 */
export type ApprovalDecision = 'approved' | 'rejected' | 'changes_requested'

/**
 * Insert a new approval record
 */
export async function insertCampaignApproval(
  db: DatabaseWriter,
  approval: Omit<Doc<'campaignApprovals'>, '_id' | '_creationTime'>,
): Promise<Id<'campaignApprovals'>> {
  return await db.insert('campaignApprovals', approval)
}

/**
 * List approvals by campaign ID
 */
export async function listApprovalsByCampaignId(
  db: DatabaseReader,
  campaignId: Id<'campaigns'>,
): Promise<Doc<'campaignApprovals'>[]> {
  return await db
    .query('campaignApprovals')
    .withIndex('by_campaign_id', (q) => q.eq('campaignId', campaignId))
    .order('desc')
    .collect()
}

/**
 * List approvals by type
 */
export async function listApprovalsByType(
  db: DatabaseReader,
  approvalType: ApprovalType,
): Promise<Doc<'campaignApprovals'>[]> {
  return await db
    .query('campaignApprovals')
    .withIndex('by_approval_type', (q) => q.eq('approvalType', approvalType))
    .order('desc')
    .collect()
}

/**
 * Get most recent approval for a campaign and type
 */
export async function getMostRecentApproval(
  db: DatabaseReader,
  campaignId: Id<'campaigns'>,
  approvalType: ApprovalType,
): Promise<Doc<'campaignApprovals'> | null> {
  const approvals = await db
    .query('campaignApprovals')
    .withIndex('by_campaign_id', (q) => q.eq('campaignId', campaignId))
    .order('desc')
    .collect()

  return approvals.find(a => a.approvalType === approvalType) ?? null
}
