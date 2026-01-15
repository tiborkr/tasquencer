import type { MutationCtx } from '../../../_generated/server'
import type { Id, Doc } from '../../../_generated/dataModel'

/**
 * Initializes deal-to-delivery work item metadata using auth scope-based authorization.
 * This function creates the work item metadata entry that enables:
 * - Work queue visibility for users with required scopes
 * - Work item claiming by authorized users
 * - Scope-based access control for work item actions
 *
 * @param mutationCtx - The mutation context with database access
 * @param workItemId - The Tasquencer work item ID to associate metadata with
 * @param config - Configuration for the work item metadata
 */
export async function initializeDealToDeliveryWorkItemAuth(
  mutationCtx: MutationCtx,
  workItemId: Id<'tasquencerWorkItems'>,
  config: {
    /** Authorization scope required to claim/complete this work item */
    scope: string
    /** Optional group ID required (in addition to scope) */
    groupId?: string
    /** ID of the aggregate root (deals table) this work item relates to */
    dealId: Id<'deals'>
    /** Typed payload specific to the work item type */
    payload: Doc<'dealToDeliveryWorkItems'>['payload']
  },
): Promise<Id<'dealToDeliveryWorkItems'>> {
  return await mutationCtx.db.insert('dealToDeliveryWorkItems', {
    workItemId,
    workflowName: 'dealToDelivery',
    offer: {
      type: 'human' as const,
      requiredScope: config.scope,
      ...(config.groupId !== undefined && { requiredGroupId: config.groupId }),
    },
    aggregateTableId: config.dealId,
    payload: config.payload,
  })
}

/**
 * Creates an agent work item that auto-completes without human intervention.
 * Used for routing decisions, automated checks, and system tasks.
 *
 * @param mutationCtx - The mutation context with database access
 * @param workItemId - The Tasquencer work item ID to associate metadata with
 * @param config - Configuration for the agent work item metadata
 */
export async function initializeAgentWorkItemAuth(
  mutationCtx: MutationCtx,
  workItemId: Id<'tasquencerWorkItems'>,
  config: {
    /** ID of the aggregate root (deals table) this work item relates to */
    dealId: Id<'deals'>
    /** Typed payload specific to the work item type */
    payload: Doc<'dealToDeliveryWorkItems'>['payload']
  },
): Promise<Id<'dealToDeliveryWorkItems'>> {
  return await mutationCtx.db.insert('dealToDeliveryWorkItems', {
    workItemId,
    workflowName: 'dealToDelivery',
    offer: {
      type: 'agent' as const,
    },
    aggregateTableId: config.dealId,
    payload: config.payload,
  })
}
