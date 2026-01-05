# Recipe: Reset Semantics (Redo/Restart Work Items)

> **Prerequisites**: [Advanced Workflows](../WORKFLOWS_ADVANCED.md)
> **Related**: [Looping Patterns](./looping-patterns.md) | [Business Exception Retry](./business-exception-retry.md)

This recipe demonstrates how to reset work items back to their initialized state, allowing them to be re-executed without creating new work items or looping through the workflow graph.

**Problem**: A QA inspector is testing a product. If the test fails, they want to reset and re-run the same test (not create a new test), potentially with notes about what to check differently.

```typescript
import { z } from 'zod'

// Domain functions
const QADomain = {
  async getTestByWorkflowId(
    ctx: { db: DatabaseReader },
    workflowId: Id<'tasquencerWorkflows'>,
  ) {
    return await ctx.db
      .query('qaTests')
      .withIndex('by_workflow', (q) => q.eq('workflowId', workflowId))
      .first()
  },

  async recordTestResult(
    ctx: { db: DatabaseWriter },
    testId: Id<'qaTests'>,
    result: 'pass' | 'fail',
    notes?: string,
  ) {
    await ctx.db.patch(testId, {
      lastResult: result,
      lastTestedAt: Date.now(),
      notes,
    })
  },

  async clearPreviousResults(
    ctx: { db: DatabaseWriter },
    testId: Id<'qaTests'>,
  ) {
    await ctx.db.patch(testId, {
      lastResult: undefined,
      lastTestedAt: undefined,
    })
  },

  async logResetReason(
    ctx: { db: DatabaseWriter },
    testId: Id<'qaTests'>,
    reason: string,
  ) {
    await ctx.db.insert('qaTestResets', {
      testId,
      reason,
      resetAt: Date.now(),
    })
  },
}

// Define the reset action payload schema
const resetPayloadSchema = z.object({
  reason: z.string(),
  reinspectionNotes: z.string().optional(),
})

// Work item with custom reset action
const qaTestWorkItem = Builder.workItem('qaTest')
  .withActions(
    Builder.workItemActions().reset(
      resetPayloadSchema,
      async ({ workItem, mutationCtx, parent }, payload) => {
        // Log the reset reason before resetting
        const test = await QADomain.getTestByWorkflowId(mutationCtx, parent.workflow.id)
        if (test) {
          await QADomain.logResetReason(mutationCtx, test._id, payload.reason)
        }

        // Perform the reset
        await workItem.reset()
      },
    ),
  )
  .withActivities({
    onInitialized: async ({ workItem }) => {
      // Don't auto-start - wait for inspector to begin
    },
    onStarted: async ({ mutationCtx, parent }) => {
      // Inspector has started the test
      const test = await QADomain.getTestByWorkflowId(mutationCtx, parent.workflow.id)
      if (test) {
        await mutationCtx.db.patch(test._id, { status: 'in_progress' })
      }
    },
    onReset: async ({ workItem, mutationCtx, parent }) => {
      // Clear previous test results when reset
      const test = await QADomain.getTestByWorkflowId(mutationCtx, parent.workflow.id)
      if (test) {
        await QADomain.clearPreviousResults(mutationCtx, test._id)
      }
    },
    onCompleted: async ({ mutationCtx, parent }) => {
      // Test passed
      const test = await QADomain.getTestByWorkflowId(mutationCtx, parent.workflow.id)
      if (test) {
        await QADomain.recordTestResult(mutationCtx, test._id, 'pass')
      }
    },
  })

// Task definition
const qaTestTask = Builder.task(qaTestWorkItem).withActivities({
  onEnabled: async ({ workItem }) => {
    await workItem.initialize()
  },
})

// Workflow definition
const qaWorkflow = Builder.workflow('qa')
  .startCondition('start')
  .task('runTest', qaTestTask)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('runTest'))
  .connectTask('runTest', (to) => to.condition('end'))
```

## Helper Functions

```typescript
const qaHelpers = factory.helpers(qaWorkflow)

// Inspector starts the test
export const startTest = mutation({
  args: { workItemId: v.id('tasquencerWorkItems') },
  handler: async (ctx, args) => {
    await qaHelpers.startWorkItem(ctx, args.workItemId)
  },
})

// Inspector passes the test
export const passTest = mutation({
  args: { workItemId: v.id('tasquencerWorkItems') },
  handler: async (ctx, args) => {
    await qaHelpers.completeWorkItem(ctx, args.workItemId)
  },
})

// Inspector fails the test (different from reset!)
export const failTest = mutation({
  args: {
    workItemId: v.id('tasquencerWorkItems'),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const workItem = await ctx.db.get(args.workItemId)
    const test = await QADomain.getTestByWorkflowId(ctx, workItem!.workflowId)
    if (test) {
      await QADomain.recordTestResult(ctx, test._id, 'fail', args.notes)
    }
    await qaHelpers.failWorkItem(ctx, args.workItemId)
  },
})

// Inspector resets to re-run the test
export const resetTest = mutation({
  args: {
    workItemId: v.id('tasquencerWorkItems'),
    reason: v.string(),
    reinspectionNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await qaHelpers.resetWorkItem(ctx, args.workItemId, {
      reason: args.reason,
      reinspectionNotes: args.reinspectionNotes,
    })
    // Work item is now back to 'initialized' state
    // Inspector can start it again
  },
})
```

## How It Works

1. Test work item is created in `initialized` state
2. Inspector starts the test → work item transitions to `started`
3. Inspector realizes they need to re-run:
   - Calls `resetTest` with a reason
   - Custom reset action logs the reason
   - `workItem.reset()` transitions back to `initialized`
   - `onReset` activity clears previous results
4. Work item is now back at `initialized` - ready to be started again
5. Inspector can start and complete/fail the test

## Reset State Machine

```
           ┌─────────────────────────────────────┐
           │                                     │
           ▼                                     │
     initialized ──────► started ────────────────┤
           ▲                │                    │ reset()
           │                │                    │
           │                ▼                    │
           │           completed                 │
           │                                     │
           └─────────────────────────────────────┘

Valid reset transitions:
- started → initialized  ✓
- initialized → *        ✗ (already initialized)
- completed → *          ✗ (finalized state)
- failed → *             ✗ (finalized state)
- canceled → *           ✗ (finalized state)
```

## Reset vs. Retry vs. Loop

| Pattern | Use Case | Mechanism |
|---------|----------|-----------|
| **Reset** | Same work item, try again | `workItem.reset()` back to initialized |
| **Retry** | Create new work item | `workItem.initialize()` in `onWorkItemStateChanged` |
| **Loop** | Re-enable entire task | XOR-join with route back to task |

## Custom Reset Actions

Use `withActions()` to define custom reset behavior with typed payloads:

```typescript
const workItem = Builder.workItem('example')
  .withActions(
    Builder.workItemActions().reset(
      z.object({
        reason: z.string(),
        preserveData: z.boolean().optional(),
      }),
      async ({ workItem, mutationCtx, parent }, payload) => {
        if (!payload.preserveData) {
          // Clear cached data before reset
          await clearCache(mutationCtx, parent.workflow.id)
        }

        // Log the reset
        await logReset(mutationCtx, payload.reason)

        // Perform the actual reset
        await workItem.reset()
      },
    ),
  )
```

## The `onReset` Activity

The `onReset` activity runs after a successful reset:

```typescript
.withActivities({
  onReset: async ({ workItem, mutationCtx, parent }) => {
    // Work item is now in 'initialized' state
    // Clean up any state from the previous attempt

    // Example: Clear temporary files
    await clearTempFiles(mutationCtx, workItem.id)

    // Example: Reset counters
    await resetAttemptCounter(mutationCtx, parent.workflow.id)

    // Note: You can auto-start here if desired
    // await workItem.start()
  },
})
```

## Multiple Reset Cycles

A work item can be reset multiple times:

```
Cycle 1: initialized → started → reset → initialized
Cycle 2: initialized → started → reset → initialized
Cycle 3: initialized → started → completed
```

Track reset count in your domain:

```typescript
const workItem = Builder.workItem('tracked')
  .withActions(
    Builder.workItemActions().reset(
      z.object({ reason: z.string() }),
      async ({ workItem, mutationCtx, parent }, payload) => {
        // Increment reset counter
        await incrementResetCount(mutationCtx, parent.workflow.id)
        await workItem.reset()
      },
    ),
  )
```

## See Also

- [Looping Patterns](./looping-patterns.md) - Re-enable tasks through graph routing
- [Business Exception Retry](./business-exception-retry.md) - Create new work items for retry
- [AI Agent Retry](./ai-agent-retry.md) - Retry with exponential backoff
