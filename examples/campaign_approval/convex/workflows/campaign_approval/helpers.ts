import { Authorization } from '../../tasquencer'

/**
 * Work item metadata helpers for LUcampaignUapproval workflow
 * Provides functions for claiming, querying, and managing work items
 */
export const UcampaignUapprovalWorkItemHelpers =
  Authorization.workItemMetadataHelpersForTable('LUcampaignUapprovalWorkItems')
