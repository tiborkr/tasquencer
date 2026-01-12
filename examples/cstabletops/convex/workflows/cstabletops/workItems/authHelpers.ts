import type { MutationCtx } from '../../../_generated/server'
import type { Doc, Id } from '../../../_generated/dataModel'

export async function initializeCstabletopsWorkItemAuth(
  mutationCtx: MutationCtx,
  workItemId: Id<'tasquencerWorkItems'>,
  config: {
    scope?: string
    groupId?: string
    sessionId: Id<'ttxSessions'>
    payload: Doc<'cstabletopsWorkItems'>['payload']
  },
): Promise<Id<'cstabletopsWorkItems'>> {
  return await mutationCtx.db.insert('cstabletopsWorkItems', {
    workItemId,
    workflowName: 'cstabletops',
    offer: {
      type: 'human' as const,
      ...(config.scope !== undefined && { requiredScope: config.scope }),
      ...(config.groupId !== undefined && { requiredGroupId: config.groupId }),
    },
    aggregateTableId: config.sessionId,
    payload: config.payload,
  })
}
