# Recipe: Looping Patterns (Re-enabling Tasks)

> **Prerequisites**: [Advanced Workflows](../WORKFLOWS_ADVANCED.md)
> **Related**: [XOR Split/Join](./xor-split-join.md) | [Reset Semantics](./reset-semantics.md)

This recipe demonstrates how to implement loops in workflows where a task can be re-enabled after completion. This is essential for iterative processes like review cycles, retry loops, and approval workflows with revisions.

**Problem**: A document must go through review. If rejected, it goes back for revision, then review again. This cycle continues until the document is approved.

```typescript
// Domain functions
const DocumentDomain = {
  async getByWorkflowId(
    ctx: { db: DatabaseReader },
    workflowId: Id<'tasquencerWorkflows'>,
  ) {
    return await ctx.db
      .query('documents')
      .withIndex('by_workflow', (q) => q.eq('workflowId', workflowId))
      .first()
  },

  async updateStatus(
    ctx: { db: DatabaseWriter },
    documentId: Id<'documents'>,
    status: 'draft' | 'in_review' | 'revision_needed' | 'approved',
  ) {
    await ctx.db.patch(documentId, { status, updatedAt: Date.now() })
  },

  async incrementRevision(
    ctx: { db: DatabaseWriter },
    documentId: Id<'documents'>,
  ) {
    const doc = await ctx.db.get(documentId)
    await ctx.db.patch(documentId, { revision: (doc!.revision || 0) + 1 })
  },
}

// Track review decisions for routing
let lastReviewDecision: 'approved' | 'rejected' = 'rejected'

// Work item for document review
const reviewWorkItem = Builder.workItem('review')

// Work item for document revision
const reviseWorkItem = Builder.workItem('revise').withActivities({
  onInitialized: async ({ workItem }) => {
    await workItem.start()
  },
  onCompleted: async ({ mutationCtx, parent }) => {
    const doc = await DocumentDomain.getByWorkflowId(mutationCtx, parent.workflow.id)
    if (doc) {
      await DocumentDomain.incrementRevision(mutationCtx, doc._id)
      await DocumentDomain.updateStatus(mutationCtx, doc._id, 'in_review')
    }
  },
})

// Review task with XOR split/join for looping
const reviewTask = Builder.task(reviewWorkItem)
  .withSplitType('xor')
  .withJoinType('xor') // <-- Key: XOR-join allows re-enabling
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      const doc = await DocumentDomain.getByWorkflowId(mutationCtx, parent.workflow.id)
      if (doc) {
        await DocumentDomain.updateStatus(mutationCtx, doc._id, 'in_review')
      }
      await workItem.initialize()
    },
  })

// Revise task
const reviseTask = Builder.task(reviseWorkItem).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    const doc = await DocumentDomain.getByWorkflowId(mutationCtx, parent.workflow.id)
    if (doc) {
      await DocumentDomain.updateStatus(mutationCtx, doc._id, 'revision_needed')
    }
    await workItem.initialize()
  },
})

// Workflow definition
const documentReviewWorkflow = Builder.workflow('documentReview')
  .startCondition('start')
  .task('review', reviewTask)
  .condition('postReview') // Intermediate condition for routing back
  .task('revise', reviseTask)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('review'))
  .connectTask('review', (to) =>
    to
      .condition('postReview')
      .condition('end')
      .route(async ({ route, mutationCtx, parent }) => {
        // Route based on review decision
        if (lastReviewDecision === 'approved') {
          return route.toCondition('end')
        }
        return route.toCondition('postReview')
      }),
  )
  // From postReview, we can go back to review (loop) via revise
  .connectCondition('postReview', (to) => to.task('revise'))
  .connectTask('revise', (to) => to.task('review')) // <-- Loop back
```

## Helper Functions

```typescript
const documentReviewHelpers = factory.helpers(documentReviewWorkflow)

// Approve the document
export const approveDocument = mutation({
  args: { workItemId: v.id('tasquencerWorkItems') },
  handler: async (ctx, args) => {
    const workItem = await ctx.db.get(args.workItemId)
    const doc = await DocumentDomain.getByWorkflowId(ctx, workItem!.workflowId)

    await DocumentDomain.updateStatus(ctx, doc!._id, 'approved')
    lastReviewDecision = 'approved'

    await documentReviewHelpers.startWorkItem(ctx, args.workItemId)
    await documentReviewHelpers.completeWorkItem(ctx, args.workItemId)
  },
})

// Reject the document (sends back for revision)
export const rejectDocument = mutation({
  args: {
    workItemId: v.id('tasquencerWorkItems'),
    feedback: v.string(),
  },
  handler: async (ctx, args) => {
    const workItem = await ctx.db.get(args.workItemId)
    const doc = await DocumentDomain.getByWorkflowId(ctx, workItem!.workflowId)

    // Store feedback for the author
    await ctx.db.insert('reviewFeedback', {
      documentId: doc!._id,
      feedback: args.feedback,
      createdAt: Date.now(),
    })

    lastReviewDecision = 'rejected'

    await documentReviewHelpers.startWorkItem(ctx, args.workItemId)
    await documentReviewHelpers.completeWorkItem(ctx, args.workItemId)
  },
})

// Submit revision
export const submitRevision = mutation({
  args: { workItemId: v.id('tasquencerWorkItems') },
  handler: async (ctx, args) => {
    await documentReviewHelpers.startWorkItem(ctx, args.workItemId)
    await documentReviewHelpers.completeWorkItem(ctx, args.workItemId)
    // Completing revise task will re-enable review task
  },
})
```

## How It Works

1. Document starts at `review` task
2. Reviewer examines document and decides:
   - **Approve**: Routes to `end` condition, workflow completes
   - **Reject**: Routes to `postReview` condition
3. `postReview` enables `revise` task
4. Author revises the document and submits
5. `revise` completion re-enables `review` task (because of XOR-join)
6. Cycle repeats until approved

## Why XOR-Join Enables Looping

The key is the **XOR-join** on the review task:

```typescript
.withJoinType('xor')
```

- **XOR-join fires when ANY incoming edge has a token**
- After `revise` completes, it puts a token on the edge to `review`
- Since `review` has XOR-join, this single token is enough to re-enable it
- Each iteration creates a **new generation** of the task

Compare to AND-join:
- AND-join would require tokens from ALL incoming edges
- Since `start` only fires once, the task couldn't be re-enabled

## Task Generations

Each time a task is re-enabled, it gets a new **generation**:

```
First review:  task.generation = 1
After revise:  task.generation = 2
After revise:  task.generation = 3
...
```

Work items belong to their task's generation. Previous generations' work items are not affected.

## Visual Flow

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌───────┐    ┌────────┐    ┌────────────┐    ┌─────────┐  │
│  │ start │───►│ review │───►│ postReview │───►│ revise  │  │
│  └───────┘    └────┬───┘    └────────────┘    └────┬────┘  │
│                    │                               │        │
│                    │ (approved)                    │        │
│                    ▼                               │        │
│               ┌─────────┐                          │        │
│               │   end   │◄─────────────────────────┘        │
│               └─────────┘         (loop back)               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Common Looping Patterns

### Simple Retry Loop

```typescript
.task('attempt', attemptTask.withSplitType('xor').withJoinType('xor'))
.condition('retry')
.connectTask('attempt', (to) =>
  to.condition('end').condition('retry')
    .route(async ({ route }) => success ? route.toCondition('end') : route.toCondition('retry'))
)
.connectCondition('retry', (to) => to.task('attempt'))
```

### Loop with Counter

```typescript
let attempts = 0
const maxAttempts = 3

.connectTask('attempt', (to) =>
  to.condition('end').condition('retry').condition('failed')
    .route(async ({ route }) => {
      attempts++
      if (success) return route.toCondition('end')
      if (attempts >= maxAttempts) return route.toCondition('failed')
      return route.toCondition('retry')
    })
)
```

### Loop with Human Decision

```typescript
.connectTask('review', (to) =>
  to.condition('approved').condition('needsWork').condition('rejected')
    .route(async ({ route }) => {
      switch (decision) {
        case 'approve': return route.toCondition('approved')
        case 'revise': return route.toCondition('needsWork')
        case 'reject': return route.toCondition('rejected')
      }
    })
)
.connectCondition('needsWork', (to) => to.task('revise'))
.connectTask('revise', (to) => to.task('review'))
```

## See Also

- [XOR Split/Join](./xor-split-join.md) - Understanding XOR routing
- [Reset Semantics](./reset-semantics.md) - Resetting work items without looping
- [Business Exception Retry](./business-exception-retry.md) - Retry patterns
