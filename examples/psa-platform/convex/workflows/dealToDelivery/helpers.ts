import { Authorization } from '../../tasquencer'

/**
 * Work item metadata helpers for Deal To Delivery workflow.
 * Provides functions for claiming, querying, and managing work items.
 */
export const DealToDeliveryWorkItemHelpers =
  Authorization.workItemMetadataHelpersForTable('dealToDeliveryWorkItems')
