# Recipe: Shared Helper Functions

> **Prerequisites**: [Work Item Patterns](../WORK_ITEM_PATTERNS.md), [Authorization](../AUTHORIZATION.md)
> **Related**: [Authorization and Work Queues](./authorization-work-queues.md)

**Solution:** Use factory-generated helpers + thin wrappers for workflow-specific patterns.

```typescript
// convex/workflows/myWorkflow/helpers.ts

// Factory-generated helpers (do this once per workflow)
import { workItemMetadataHelpersForTable } from '../../authorization/builders'
export const MyWorkItemHelpers = workItemMetadataHelpersForTable('myWorkItems')

// convex/workflows/myWorkflow/workItems/helpers.ts

// Helper 1: Start + Claim (uses factory helper)
export async function startAndClaimWorkItem(
  mutationCtx: MutationCtx,
  workItem: { id: Id<'tasquencerWorkItems'>; start: () => Promise<void> },
): Promise<void> {
  const authUser = await authComponent.safeGetAuthUser(mutationCtx)
  assertAuthenticatedUser(authUser, {
    operation: 'startAndClaimWorkItem',
    workItemId: workItem.id,
  })

  const userId = authUser.userId as Id<'users'>
  await MyWorkItemHelpers.claimWorkItem(mutationCtx.db, workItem.id, userId)
  await workItem.start()
}

// Helper 2: Workflow-specific wrapper (optional)
export async function initializeMyWorkItem(
  mutationCtx: MutationCtx,
  workItemId: Id<'tasquencerWorkItems'>,
  config: {
    scope: string
    aggregateId: Id<'documents'>
    payload: Doc<'myWorkItems'>['payload']  // Fully typed!
  },
): Promise<void> {
  await mutationCtx.db.insert('myWorkItems', {
    workItemId,
    workflowName: 'myWorkflow',  // Baked in!
    offer: {
      type: 'human',
      requiredScope: config.scope,
    },
    aggregateTableId: config.aggregateId,
    payload: config.payload,
  })
}

// Usage: One line per work item!
const reviewWorkItem = Builder.workItem('review')
  .initialize(
    z.object({ documentId: zid('documents') }),
    async ({ mutationCtx, workItem }, payload) => {
      const workItemId = await workItem.initialize()

      await initializeMyWorkItem(mutationCtx, workItemId, {
        scope: 'document:review',
        aggregateId: payload.documentId,
        payload: {
          type: 'review',
          taskName: 'Review Document',
          priority: 'urgent',
        },
      })
    },
  )
  .start(async ({ mutationCtx, workItem }) => {
    await startAndClaimWorkItem(mutationCtx, workItem)
  })
```

## Benefits

- Factory helpers provide type-safe, consistent API
- Wrappers bake in workflow-specific configuration
- Full type inference from schema to runtime
- One table per aggregate root shared across all work items

## Pattern Summary

| Layer | Purpose | Example |
|-------|---------|---------|
| Factory helpers | Generic, reusable operations | `workItemMetadataHelpersForTable()` |
| Workflow wrappers | Bake in workflow-specific config | `initializeMyWorkItem()` |
| Work item actions | Call wrappers with payload data | `await initializeMyWorkItem(...)` |

## See Also

- [Work Item Patterns - Factory Helpers](../WORK_ITEM_PATTERNS.md#shared-helper-functions)
- [Domain Modeling - Data Storage](../DOMAIN_MODELING.md#3-work-item-data-storage)
- [Authorization and Work Queues](./authorization-work-queues.md)
