# Recipe: Authorization and Work Queues

> **Prerequisites**: [Authorization](../AUTHORIZATION.md), [Work Item Patterns](../WORK_ITEM_PATTERNS.md)
> **Related**: [Human-in-the-Loop](./human-in-the-loop.md) | [Shared Helper Functions](./shared-helpers.md)

**Solution:** Use the metadata factory pattern with typed payloads for role-based work assignment.

See [Authorization](../AUTHORIZATION.md) for complete details. Quick overview:

```typescript
// 1. Define metadata table schema
const myWorkItems = defineWorkItemMetadataTable('documents').withPayload(
  v.union(
    v.object({
      type: v.literal('review'),
      taskName: v.string(),
      priority: v.union(v.literal('routine'), v.literal('urgent')),
    }),
    v.object({
      type: v.literal('approval'),
      taskName: v.string(),
      priority: v.literal('urgent'),
      approvalLevel: v.number(),
    }),
  ),
)

// 2. Generate helpers
export const MyWorkItemHelpers = workItemMetadataHelpersForTable('myWorkItems')

export async function initializeMyWorkItemMetadata(
  mutationCtx: MutationCtx,
  metadata: Omit<Doc<'myWorkItems'>, '_id'>,
) {
  await mutationCtx.db.insert('myWorkItems', metadata)
}

// 3. Initialize metadata in work item
const reviewWorkItem = Builder.workItem('review').withActions(
  Builder.workItemActions().initialize(
    z.object({ documentId: zid('documents'), priority: z.enum(['routine', 'urgent']) }),
    async ({ mutationCtx, workItem }, payload) => {
      const workItemId = await workItem.initialize()
      const scope = 'document:review'

      await initializeMyWorkItemMetadata(mutationCtx, {
        workItemId,
        workflowName: 'myWorkflow',
        offer: {
          type: 'human',
          requiredScope: scope,
        },
        aggregateTableId: payload.documentId,
        payload: {
          type: 'review',
          taskName: 'Review Document',
          priority: payload.priority,
        },
      })
    },
  ),
)

// 4. Query work queue with factory helper
export const getMyWorkQueue = query({
  handler: async (ctx) => {
    const authUser = await authComponent.safeGetAuthUser(ctx)
    if (!authUser) return []

    const userId = authUser.userId as Id<'users'>
    const candidates = await MyWorkItemHelpers.getAvailableWorkItemsForUser(
      ctx.db,
      userId,
    )

    return candidates.filter(
      ({ metadata }) => metadata.workflowName === 'myWorkflow',
    )
  },
})

// 5. Claim and start with factory helper
export const startWorkItem = mutation({
  args: { workItemId: v.id('tasquencerWorkItems') },
  handler: async (ctx, args) => {
    const authUser = await authComponent.safeGetAuthUser(ctx)
    assertAuthenticatedUser(authUser)

    const userId = authUser.userId as Id<'users'>
    await MyWorkItemHelpers.claimWorkItem(ctx.db, args.workItemId, userId)

    const workItem = await getWorkItem(ctx, args.workItemId)
    await workItem.start()
  },
})
```

## Benefits

- Factory helpers provide type-safe API
- Typed payload eliminates separate tables
- One table per aggregate root
- Full authorization enforcement

## Authorization Fields

| Field | Type | Purpose |
|-------|------|---------|
| `requiredScope` | `string` | Permission scope required to claim |
| `requiredGroupId` | `Id<'authGroups'>` | Auth group that can claim |

## See Also

- [Authorization](../AUTHORIZATION.md) - Complete RBAC guide
- [Work Item Patterns](../WORK_ITEM_PATTERNS.md) - Metadata factory pattern
- [Shared Helper Functions](./shared-helpers.md)
