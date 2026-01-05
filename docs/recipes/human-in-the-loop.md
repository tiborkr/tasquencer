# Recipe: Human-in-the-Loop Approval

> **Prerequisites**: [Workflow Basics](../WORKFLOWS_BASIC.md), [Advanced Workflows](../WORKFLOWS_ADVANCED.md)
> **Related**: [Authorization](../AUTHORIZATION.md) | [Work Item Patterns](../WORK_ITEM_PATTERNS.md)

This recipe demonstrates how to implement human approval workflows with typed payloads and proper authentication.

```typescript
// convex/workflows/documentReview/schema.ts - Define metadata table with typed payload
import { defineWorkItemMetadataTable } from '../../authorization/builders'
import { v } from 'convex/values'

const documentWorkItems = defineWorkItemMetadataTable('documents').withPayload(
  v.union(
    v.object({
      type: v.literal('legalApproval'),
      assignedReviewer: v.string(),
      approved: v.optional(v.boolean()),
      comments: v.optional(v.string()),
    }),
    v.object({
      type: v.literal('securityApproval'),
      assignedReviewer: v.string(),
      approved: v.optional(v.boolean()),
      comments: v.optional(v.string()),
    }),
  ),
)

export default {
  // ... other tables
  documentWorkItems,
}

// convex/workflows/documentReview/domain/helpers.ts - Generate helpers
import { workItemMetadataHelpersForTable } from '../../../authorization/builders'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'

export const DocumentWorkItemHelpers =
  workItemMetadataHelpersForTable('documentWorkItems')

export async function initializeDocumentWorkItemMetadata(
  mutationCtx: MutationCtx,
  metadata: Omit<Doc<'documentWorkItems'>, '_id'>,
) {
  await mutationCtx.db.insert('documentWorkItems', metadata)
}

// Domain functions
const DocumentDomain = {
  async getByWorkflowId(
    ctx: { db: DatabaseReader },
    workflowId: Id<'tasquencerWorkflows'>,
  ) {
    const doc = await ctx.db
      .query('documents')
      .withIndex('by_workflow', (q) => q.eq('workflowId', workflowId))
      .unique()
    if (!doc) throw new Error('Document not found')
    return doc
  },
}

// Work item for human approval
// SECURITY CRITICAL: This is a user-facing work item - authentication REQUIRED
const approvalWorkItem = Builder.workItem('approval').withActions(
  Builder.workItemActions()
    .initialize(
      z.object({ documentId: zid('documents'), assignedTo: z.string() }),
      async ({ mutationCtx, workItem, isInternalMutation }, payload) => {
        // SECURITY REQUIRED: Authenticate external calls
        if (!isInternalMutation) {
          const authUser = await authComponent.safeGetAuthUser(mutationCtx)
          assertAuthenticatedUser(authUser, {
            operation: 'initializeApproval',
          })
        }

        const workItemId = await workItem.initialize()

        const scope = 'legal:review'

        // Store approval data in typed payload - no separate table needed!
        await initializeDocumentWorkItemMetadata(mutationCtx, {
          workItemId,
          workflowName: 'documentReview',
          offer: {
            type: 'human',
            requiredScope: scope,
          },
          aggregateTableId: payload.documentId,
          payload: {
            type: 'legalApproval',
            assignedReviewer: payload.assignedTo,
            // approved and comments will be added on complete
          },
        })
      },
    )
    .complete(
      z.object({ approved: z.boolean(), comments: z.string() }),
      async ({ mutationCtx, workItem, isInternalMutation }, payload) => {
        // SECURITY REQUIRED: Authenticate external calls
        if (!isInternalMutation) {
          const authUser = await authComponent.safeGetAuthUser(mutationCtx)
          assertAuthenticatedUser(authUser, {
            operation: 'completeApproval',
            workItemId: workItem.id,
          })
          // Verify user can complete this specific approval
          await assertUserCanCompleteWorkItem(mutationCtx, authUser.userId, workItem.id)
        }

        // Update payload with approval results
        const metadata = await DocumentWorkItemHelpers.getWorkItemMetadata(
          mutationCtx.db,
          workItem.id,
        )
        if (metadata) {
          await mutationCtx.db.patch(metadata._id, {
            payload: {
              ...metadata.payload,
              approved: payload.approved,
              comments: payload.comments,
            },
          })
        }
      },
    ),
)

const approvalTask = Builder.task(approvalWorkItem).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    const doc = await DocumentDomain.getByWorkflowId(
      mutationCtx,
      parent.workflow.id,
    )
    await workItem.initialize({
      documentId: doc._id,
      assignedTo: doc.assignedReviewer,
    })
  },
})

// Use in workflow
const workflow = Builder.workflow('documentReview')
  .startCondition('start')
  .task('approval', approvalTask)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('approval'))
  .connectTask('approval', (to) => to.condition('end'))
```

## Key Benefits

- No separate `approvals` table needed
- Approval data stored in typed `payload` field
- Full type safety from schema to runtime
- Factory-generated helpers handle all metadata operations
- Same table can handle multiple approval types

## Security Note

This recipe demonstrates the human-in-the-loop pattern. In production:
- ALWAYS add authentication checks to custom actions as shown
- Verify users can only complete work items assigned to them
- Consider using the authorization helpers from [Authorization Guide](../AUTHORIZATION.md)

## See Also

- [Authorization and Work Queues](./authorization-work-queues.md)
- [Shared Helper Functions](./shared-helpers.md)
