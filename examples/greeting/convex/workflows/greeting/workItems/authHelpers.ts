import type { MutationCtx } from '../../../_generated/server'
import type { Id, Doc } from '../../../_generated/dataModel'

/**
 * Initializes greeting work item metadata using auth scope-based authorization.
 *
 * @param mutationCtx - The mutation context
 * @param workItemId - The ID of the work item to initialize metadata for
 * @param config - Configuration object containing scope, optional group, greeting ID, and payload
 */
export async function initializeGreetingWorkItemAuth(
  mutationCtx: MutationCtx,
  workItemId: Id<'tasquencerWorkItems'>,
  config: {
    scope: string
    groupId?: string
    greetingId: Id<'greetings'>
    payload: Doc<'greetingWorkItems'>['payload']
  },
): Promise<Id<'greetingWorkItems'>> {
  return await mutationCtx.db.insert('greetingWorkItems', {
    workItemId,
    workflowName: 'greeting',
    offer: {
      type: 'human' as const,
      requiredScope: config.scope,
      ...(config.groupId !== undefined && { requiredGroupId: config.groupId }),
    },
    aggregateTableId: config.greetingId,
    payload: config.payload,
  })
}
