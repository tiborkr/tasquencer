import type { DatabaseReader, DatabaseWriter } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'

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
