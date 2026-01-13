import { Authorization } from '../../tasquencer'

/**
 * Work item metadata helpers for campaign_approval workflow
 * Provides functions for claiming, querying, and managing work items
 */
export const CampaignWorkItemHelpers =
  Authorization.workItemMetadataHelpersForTable('campaignWorkItems')
