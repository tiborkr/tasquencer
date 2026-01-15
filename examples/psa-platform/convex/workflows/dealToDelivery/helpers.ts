import { Authorization } from '../../tasquencer'
import type { DatabaseReader } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'

/**
 * Work item metadata helpers for Deal To Delivery workflow.
 * Provides functions for claiming, querying, and managing work items.
 */
export const DealToDeliveryWorkItemHelpers =
  Authorization.workItemMetadataHelpersForTable('dealToDeliveryWorkItems')

/**
 * Get the most recent work item metadata of a specific type for a project.
 * Used for routing decisions that depend on previous work item outcomes.
 */
export async function getLatestWorkItemByTypeAndProject(
  db: DatabaseReader,
  workItemType: Doc<'dealToDeliveryWorkItems'>['payload']['type'],
  projectId: Id<'projects'>,
): Promise<Doc<'dealToDeliveryWorkItems'> | null> {
  // Query all work items and filter by type and projectId in payload
  const allWorkItems = await db.query('dealToDeliveryWorkItems').collect()

  const matching = allWorkItems
    .filter((wi) => {
      if (wi.payload.type !== workItemType) return false
      // Check if payload has projectId (not all work items do)
      const payload = wi.payload as { projectId?: Id<'projects'> }
      return payload.projectId === projectId
    })
    .sort((a, b) => b._creationTime - a._creationTime)

  return matching[0] ?? null
}
