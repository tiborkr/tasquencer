import { v } from 'convex/values'
import { mutation, query } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { greetingVersionManager } from './definition'
import { getGreetingByWorkflowId, listGreetings } from './db'
import { GreetingWorkItemHelpers } from './helpers'
import { authComponent } from '../../auth'
import { type HumanWorkItemOffer, isHumanOffer } from '@repo/tasquencer'
import { assertUserHasScope } from '../../authorization'

// Export version manager API
export const {
  initializeRootWorkflow,
  initializeWorkItem,
  startWorkItem,
  completeWorkItem,
  helpers: { getWorkflowTaskStates },
} = greetingVersionManager.apiForVersion('v1')

function requireHumanOffer(
  metadata: Doc<'greetingWorkItems'>,
): HumanWorkItemOffer {
  if (!isHumanOffer(metadata.offer)) {
    throw new Error('Greeting work items must be offered to humans')
  }
  return metadata.offer
}

function deriveWorkItemStatus(
  workItem: Doc<'tasquencerWorkItems'> | null,
  metadata: Doc<'greetingWorkItems'>,
): 'pending' | 'claimed' | 'completed' {
  if (workItem?.state === 'completed') return 'completed'
  if (metadata.claim) return 'claimed'
  return 'pending'
}

/**
 * Get greeting by workflow ID
 */
export const getGreeting = query({
  args: {
    workflowId: v.id('tasquencerWorkflows'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'greeting:staff')
    return await getGreetingByWorkflowId(ctx.db, args.workflowId)
  },
})

/**
 * List all greetings
 */
export const getGreetings = query({
  args: {},
  handler: async (ctx) => {
    await assertUserHasScope(ctx, 'greeting:staff')
    return await listGreetings(ctx.db)
  },
})

/**
 * Claim a greeting work item
 */
export const claimGreetingWorkItem = mutation({
  args: {
    workItemId: v.id('tasquencerWorkItems'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'greeting:write')
    const authUser = await authComponent.getAuthUser(ctx)

    if (!authUser.userId) {
      throw new Error('USER_NOT_AUTHENTICATED')
    }

    const userId = authUser.userId

    const canClaim = await GreetingWorkItemHelpers.canUserClaimWorkItem(
      ctx,
      userId,
      args.workItemId,
    )

    if (!canClaim) {
      throw new Error('GREETING_WORK_ITEM_CLAIM_NOT_ALLOWED')
    }

    await GreetingWorkItemHelpers.claimWorkItem(ctx, args.workItemId, userId)
  },
})

/**
 * Get the greeting work queue for the authenticated user
 */
export const getGreetingWorkQueue = query({
  args: {},
  handler: async (ctx) => {
    await assertUserHasScope(ctx, 'greeting:staff')
    const authUser = await authComponent.getAuthUser(ctx)

    if (!authUser.userId) {
      return []
    }

    const userId = authUser.userId

    const items = await GreetingWorkItemHelpers.getAvailableWorkItemsByWorkflow(
      ctx,
      userId,
      'greeting',
    )

    const humanItems = items.filter((item) => isHumanOffer(item.metadata.offer))

    if (humanItems.length === 0) {
      return []
    }

    // Batch load greetings
    const greetingIds = new Set(
      humanItems.map(
        (item) => item.metadata.aggregateTableId as Id<'greetings'>,
      ),
    )
    const greetingsMap = new Map<Id<'greetings'>, Doc<'greetings'> | null>()
    await Promise.all(
      Array.from(greetingIds).map(async (greetingId) => {
        const greeting = await ctx.db.get(greetingId)
        greetingsMap.set(greetingId, greeting)
      }),
    )

    return humanItems.map((item) => {
      const metadata = item.metadata
      const workItem = item.workItem
      const greeting = greetingsMap.get(
        metadata.aggregateTableId as Id<'greetings'>,
      )
      const offer = requireHumanOffer(metadata)

      return {
        _id: metadata._id,
        _creationTime: metadata._creationTime,
        workItemId: metadata.workItemId,
        taskName: metadata.payload.taskName,
        taskType: metadata.payload.type,
        status: deriveWorkItemStatus(workItem, metadata),
        requiredScope: offer.requiredScope ?? null,
        greeting: greeting
          ? {
              _id: greeting._id,
              message: greeting.message,
              createdAt: greeting.createdAt,
            }
          : null,
      }
    })
  },
})

/**
 * Get workflow task states
 */
export const greetingWorkflowTaskStates = query({
  args: {
    workflowId: v.id('tasquencerWorkflows'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'greeting:staff')
    return await getWorkflowTaskStates(ctx.db, {
      workflowName: 'greeting',
      workflowId: args.workflowId,
    })
  },
})
