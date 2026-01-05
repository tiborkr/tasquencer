# Debugging & Troubleshooting

> **Prerequisites**: [Workflow Basics](./WORKFLOWS_BASIC.md), [Core Concepts](./CORE_CONCEPTS.md)  
> **Related**: [Exception Handling](./EXCEPTIONS.md) | [Recipe Book](./RECIPES.md)

This guide covers debugging workflows and common troubleshooting scenarios.

## Table of Contents

- [Inspect Workflow State](#inspect-workflow-state)
- [Time-Travel Debugging](#time-travel-debugging)
- [Common Issues](#common-issues)
  - [Task Never Enables](#task-never-enables)
  - [Work Item Stuck](#work-item-stuck)
  - [OR-Join Never Fires](#or-join-never-fires)
  - [Workflow Stuck After Task Completion](#workflow-stuck-after-task-completion)
- [Common Pitfalls](#common-pitfalls)

---

## Debugging & Troubleshooting

### Inspect Workflow State

Tasquencer provides two ways to inspect workflow state:

1. **Built-in Audit UI** - A visual time-travel debugger included in the examples
2. **Audit API** - Programmatic access via the `tasquencerAudit` component

#### Built-in Audit UI

The examples include a ready-to-use audit UI at `/audit` that provides:
- List of all workflow traces with status indicators
- Time-travel visualization showing state at any point in time
- Span inspection for debugging routing decisions and join behavior

See `examples/greeting/src/routes/_app/audit/` for the implementation.

#### Audit API Wrapper

Create API wrappers to expose audit functions with your authorization:

```typescript
// convex/admin/audit.ts
import { query } from '../_generated/server'
import { components } from '../_generated/api'
import { v } from 'convex/values'
import { assertUserHasScope } from '../authorization'

export const getWorkflowStateAtTime = query({
  args: {
    traceId: v.string(),
    workflowId: v.optional(v.string()),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'system:admin')
    return await ctx.runQuery(
      components.tasquencerAudit.api.getWorkflowStateAtTime,
      args,
    )
  },
})

export const getKeyEvents = query({
  args: { traceId: v.string() },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'system:admin')
    return await ctx.runQuery(
      components.tasquencerAudit.api.getKeyEvents,
      args,
    )
  },
})

export const getTraceSpans = query({
  args: { traceId: v.string() },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'system:admin')
    return await ctx.runQuery(
      components.tasquencerAudit.api.getTraceSpans,
      args,
    )
  },
})
```

**Note**: Audit data is stored in a Convex component and must be accessed through `components.tasquencerAudit.api`. Direct database access to Tasquencer tables is not supported.

## Time-Travel Debugging

Tasquencer includes powerful time-travel debugging capabilities that let you reconstruct complete workflow state at any point in time.

### Reconstruct State at Any Point

```typescript
// Get workflow state at a specific timestamp
const state = await ctx.runQuery(
  components.tasquencerAudit.api.getWorkflowStateAtTime,
  {
    traceId: workflowId,
    timestamp: Date.now() - 10000, // 10 seconds ago
  },
)

// Check condition markings at that time
console.log('Was condition c1 marked?', state.conditions.c1.marking > 0)
// Output: { marking: 1, lastChangedAt: 1729222912000, name: 'c1' }

// Check task state at that time
console.log('What state was taskA in?', state.tasks.taskA.state)
// Output: 'started'

// Check all work items
console.log(
  'Active work items:',
  Object.values(state.workItems).filter((wi) => wi.state === 'started'),
)
```

### Debug Task Enable Issues

```typescript
// Why didn't task enable?
const state = await ctx.runQuery(
  components.tasquencerAudit.api.getWorkflowStateAtTime,
  {
    traceId: workflowId,
    timestamp: suspiciousTimestamp,
  },
)

const task = state.tasks.myTask

if (task.state === 'disabled') {
  console.log('Task disabled because:')

  // Get the task enable span to see join info
  const spans = await ctx.runQuery(
    components.tasquencerAudit.api.getTraceSpans,
    { traceId: workflowId },
  )

  const enableSpan = spans.find(
    (s) => s.operation === 'Task.enable' && s.resourceName === 'myTask',
  )

  if (enableSpan) {
    const { joinType, inputConditions } = enableSpan.attributes
    console.log(`Join type: ${joinType}`)
    console.log('Input conditions at enable time:', inputConditions)
    // Output: [{ name: 'c1', marking: 1 }, { name: 'c2', marking: 0 }]
  }
}
```

### Trace Token Flow

```typescript
// Get all condition marking changes
const keyEvents = await ctx.runQuery(
  components.tasquencerAudit.api.getKeyEvents,
  { traceId: workflowId },
)

// Filter to condition events
const conditionEvents = keyEvents.filter((e) => e.category === 'condition')

console.log('Token flow:')
conditionEvents.forEach((event) => {
  console.log(`${event.timestamp}: ${event.description}`)
  // Output: "1729222912000: c1: 0→1"
  // Output: "1729222915000: c1: 1→0"
})
```

### Get Key Timeline Events

```typescript
// Get important moments for timeline navigation
const events = await ctx.runQuery(
  components.tasquencerAudit.api.getKeyEvents,
  { traceId: workflowId },
)

// Events include:
// - Workflow state changes (initialize, start, complete, fail, cancel)
// - Task state changes (enable, start, complete, fail, cancel)
// - Condition marking changes (increment/decrement with old→new values)
// - WorkItem state changes
// - Errors

const taskEvents = events.filter((e) => e.category === 'task')
console.log(
  'Task timeline:',
  taskEvents.map(
    (e) => `${new Date(e.timestamp).toISOString()}: ${e.description}`,
  ),
)
```

### Debug Routing Decisions

```typescript
// Check what split type was used and which conditions were marked
const spans = await ctx.runQuery(
  components.tasquencerAudit.api.getTraceSpans,
  { traceId: workflowId },
)

const completeSpan = spans.find(
  (s) => s.operation === 'Task.complete' && s.resourceName === 'decisionTask',
)

if (completeSpan) {
  const { splitType, outputConditions } = completeSpan.attributes
  console.log(`Split type: ${splitType}`)
  console.log('Available output conditions:', outputConditions)
  // For AND splits: all conditions get marked
  // For XOR/OR splits: routing decision determines which conditions get marked
}
```

### Time Range Queries

```typescript
// Get all spans within a time window
const spans = await ctx.runQuery(
  components.tasquencerAudit.api.getSpansByTimeRange,
  {
    traceId: workflowId,
    startTime: startTimestamp,
    endTime: endTimestamp,
  },
)

console.log(`Found ${spans.length} spans in time range`)
```

### What's Captured

The audit system captures:

- **Condition Markings**: Every increment/decrement with old→new marking values
- **Task States**: Full lifecycle (disabled → enabled → started → completed/failed/canceled)
- **WorkItem States**: Complete state machine tracking
- **Join Info**: Input conditions and their markings when task enables
- **Split Info**: Output conditions and split type when task completes
- **Workflow Structure**: Complete Petri net topology at initialization
- **Timing**: Precise timestamps for all state changes

### Common Issues

#### Task Never Enables

**Symptom**: Task stays in `disabled` state

**Check:**

1. Are input conditions marked (have tokens)?
2. Is the join satisfied?
   - AND join: ALL input conditions must be marked
   - XOR join: ANY input condition marked
   - OR join: Use E2WFOJNet analysis (check that no more tokens will arrive)

**Debug:**

Use the audit API or built-in audit UI to inspect condition markings:

```typescript
// Get workflow state at current time
const state = await ctx.runQuery(
  components.tasquencerAudit.api.getWorkflowStateAtTime,
  {
    traceId: workflowId,
    timestamp: Date.now(),
  },
)

// Check input condition markings
const c1 = state.conditions.c1
const c2 = state.conditions.c2
console.log('Input markings:', { c1: c1?.marking, c2: c2?.marking })
```

#### Work Item Stuck

**Symptom**: Work item in `initialized` or `started` state forever

**Check:**

1. Did you call `await workItem.start()` in the action?
2. Did you call `await workItem.complete()` in the action?
3. If using scheduler, did the action get called?
4. Check domain table for error logs

**Debug:**

Use the audit API to check work item state, and query your domain table for related data:

```typescript
// Get workflow state to see all work items
const state = await ctx.runQuery(
  components.tasquencerAudit.api.getWorkflowStateAtTime,
  {
    traceId: workflowId,
    timestamp: Date.now(),
  },
)

// Find the work item by task name
const workItemState = Object.values(state.workItems).find(
  (wi) => wi.taskName === 'myTask',
)
console.log('Work item state:', workItemState?.state)

// Check your domain table for related data
const domainRecord = await ctx.db
  .query('myDomainTable')
  .withIndex('by_workItemId', (q) => q.eq('workItemId', workItemId))
  .unique()
console.log('Domain state:', domainRecord)
```

#### OR-Join "Never" Fires (This is Usually Correct Behavior!)

**First, understand OR-join semantics:**

- **OR-join is a synchronized merge join** that waits for **ALL** dynamically-selected branches
- Unlike XOR-join (fires when ANY branch arrives), OR-join waits for **ALL** branches that were fired
- Think "Dynamic AND-join" - you select branches at runtime, then wait for all of them

**If your OR-join hasn't fired yet, this is usually CORRECT behavior because:**

1. **Not all fired branches have completed** - OR-join is waiting for all of them
2. **Unmarked input conditions could still receive tokens** - Some fired tasks haven't completed yet
3. **The E2WFOJNet algorithm is being conservative** - It waits until it's certain no more tokens will arrive

**Debug checklist:**

1. ✅ Are **ALL** dynamically-fired branches completed? (not just "some")
2. ✅ Are there any started tasks that could still produce tokens to unmarked inputs?
3. ✅ Did you expect XOR-join behavior (first-to-complete) but used OR-join instead?

**Common mistake: Confusing OR-join with XOR-join**

```typescript
// ❌ If you want "first branch wins" behavior, use XOR-join
.task('merge', mergeTask.withJoinType('xor'))

// ✅ If you want "wait for all selected branches", use OR-join
.task('merge', mergeTask.withJoinType('or'))
```

**This is correct behavior!** OR-join prevents premature firing and ensures all selected work is complete.

#### Workflow Stuck After Task Completion

**Symptom**: Task completes but workflow doesn't progress

**Check:**

1. Did you define outgoing flows for the task?
2. Are output conditions connected to next tasks?

**Debug:**

Use the audit API or built-in audit UI to inspect task and condition states:

```typescript
// Get workflow state to see all tasks and conditions
const state = await ctx.runQuery(
  components.tasquencerAudit.api.getWorkflowStateAtTime,
  {
    traceId: workflowId,
    timestamp: Date.now(),
  },
)

// Check task state
console.log('Task state:', state.tasks.myTask?.state)

// Check all condition markings
console.log(
  'All markings:',
  Object.entries(state.conditions).map(([name, c]) => ({
    name,
    marking: c.marking,
  })),
)
```

---

## Common Pitfalls

### ❌ Forgetting to Store Work Item ID When You Need It

**Important**: The engine automatically ensures work item methods are called. You only call them explicitly when you need the ID.

```typescript
// If you DON'T need the work item ID:
.initialize(
  z.object({ userId: z.string() }),
  async ({ mutationCtx }, payload) => {
    // Engine will call initialize() automatically
    // Use domain function (not direct DB access!)
    await MyDomain.createRecord(mutationCtx, {
      userId: payload.userId
    })
  }
)

// If you DO need the work item ID (to link domain data):
.initialize(
  z.object({ userId: z.string() }),
  async ({ mutationCtx, workItem }, payload) => {
    const workItemId = await workItem.initialize()  // ✓ Get the ID
    // Use domain function to store
    await MyDomain.createRecord(mutationCtx, {
      userId: payload.userId,
      workItemId  // ✓ Store it for later reference
    })
  }
)
```

### ❌ Using Activities for External API

```typescript
// WRONG: Activities run in mutation, cannot do I/O!
.withActivities({
  onEnabled: async ({ mutationCtx }) => {
    await fetch('https://api.example.com') // ❌ Will fail!
  }
})

// RIGHT: Use registerScheduled to queue work
.withActivities({
  onEnabled: async ({ workItem, mutationCtx, registerScheduled }) => {
    const workItemId = await workItem.initialize()
    await registerScheduled(
      mutationCtx.scheduler.runAfter(
        0,
        internal.myActions.callExternalApi,
        { workItemId },
      ),
    )
  }
})
```

### ❌ Confusing Business Exceptions with Code Errors

```typescript
// WRONG: Throwing errors for business logic exceptions
.complete(
  z.object({ approved: z.boolean() }),
  async ({ mutationCtx, workItem }, payload) => {
    if (!payload.approved) {
      throw new Error('Not approved') // ❌ This rolls back the entire transaction!
    }
  }
)

// RIGHT: Use workItem.fail() for business exceptions
.complete(
  z.object({ result: z.union([
    z.object({ success: z.literal(true), data: z.string() }),
    z.object({ success: z.literal(false), reason: z.string() })
  ]) }),
  async ({ mutationCtx, workItem }, payload) => {
    if (!payload.result.success) {
      // Business exception - workflow continues with work item in 'failed' state
      await workItem.fail({ reason: payload.result.reason })
      return
    }
    // Success - use domain function to process
    await MyDomain.processResult(mutationCtx, workItem.id, payload.result.data)
  }
)
```

**Important distinctions:**

- **Unhandled exceptions** = Code bugs → Entire mutation rolls back (Convex guarantee)
- **`workItem.fail()`** = Business exception → Workflow continues, can be handled by policies
- Since there's no I/O in Tasquencer actions, most errors should be business logic exceptions, not code exceptions
- **Let exceptions bubble**: If domain functions throw unrecoverable errors, let them propagate - Convex will abort the transaction

### ❌ Missing Route Function for OR/XOR Splits

```typescript
// WRONG: OR/XOR splits need route function!
.connectTask('decide', to =>
  to.task('option1').task('option2') // ❌ Which one(s) fire?
)

// RIGHT (XOR - returns single route):
.connectTask('decide', to =>
  to
    .task('option1')
    .task('option2')
    .route(async ({ mutationCtx, route }) => {
      const decision = await getDecision(mutationCtx)
      return decision.useOption1
        ? route.toTask('option1')
        : route.toTask('option2')
    })
)

// RIGHT (OR - returns array of routes):
.connectTask('decide', to =>
  to
    .task('option1')
    .task('option2')
    .route(async ({ mutationCtx, route }) => {
      const decision = await getDecision(mutationCtx)
      const routes: AvailableRoutes<typeof route>[] = []
      if (decision.useOption1) routes.push(route.toTask('option1'))
      if (decision.useOption2) routes.push(route.toTask('option2'))
      return routes
    })
)
```

### ❌ Storing Workflow State in Domain Tables

```typescript
// WRONG: Duplicating workflow state
await MyDomain.createRecord(ctx, {
  workItemId,
  status: 'started', // ❌ Tasquencer already tracks this!
})

// RIGHT: Store only domain-specific data
await MyDomain.createRecord(ctx, {
  workItemId,
  documentId: 'doc-123', // ✓ Domain data
  reviewerName: 'Alice', // ✓ Domain data
  notes: 'Looks good', // ✓ Domain data
  // No workflow state duplication
})
```

### ❌ Manually Syncing Task States to Domain Tables

```typescript
// WRONG: Adding task states to domain tables
const myWorkflow = Builder.workflow('myWorkflow').withActions(
  Builder.workflowActions().initialize(
    z.object({
      /* ... */
    }),
    async ({ mutationCtx, workflow }, payload) => {
      await mutationCtx.db.insert('myDomainTable', {
        workflowId: await workflow.initialize(),
        activeStates: [], // ❌ Don't duplicate task states!
      })
    },
  ),
)

// WRONG: Syncing states in activities
const myTask = Builder.task(myWorkItem).withActivities({
  onStarted: async ({ mutationCtx, parent }) => {
    await addActiveState(mutationCtx.db, parent.workflow.id, 'processing') // ❌
  },
  onCompleted: async ({ mutationCtx, parent }) => {
    await removeActiveState(mutationCtx.db, parent.workflow.id, 'processing') // ❌
  },
  // ... repeat for onFailed, onCanceled
})

// RIGHT: Use getWorkflowTaskStates helper
// In your workflow definition:
import { versionManagerFor } from '../../tasquencer'
import { myWorkflow } from './workflow'

export const myWorkflowVersionManager = versionManagerFor('myWorkflow')
  .registerVersion('v1', myWorkflow)
  .build('v1')

// In your API file:
import { myWorkflowVersionManager } from '../definition'

export const {
  initializeRootWorkflow,
  completeWorkItem,
  helpers: { getWorkflowTaskStates },
} = myWorkflowVersionManager.apiForVersion('v1')

export const getMyWorkflowTaskStates = query({
  args: { workflowId: v.id('tasquencerWorkflows') },
  handler: async (ctx, args) => {
    // Type-safe, always in sync, no boilerplate!
    return await getWorkflowTaskStates(ctx.db, {
      workflowName: 'myWorkflow',
      workflowId: args.workflowId,
    })
  },
})

// Use in UI:
const taskStates = useQuery(api.myWorkflow.getMyWorkflowTaskStates, {
  workflowId,
})
if (taskStates?.myTask === 'started') {
  // Show loading state
}
```

**Why this is wrong:**

- ❌ Massive boilerplate (4 activities per task just for state tracking)
- ❌ Risk of getting out of sync with actual workflow state
- ❌ Maintenance burden when adding/removing tasks
- ❌ Violates single source of truth principle

**Why the helper is right:**

- ✅ Single source of truth (reads directly from Tasquencer)
- ✅ Type-safe (returns `Record<TaskName, TaskState>`)
- ✅ No sync issues possible
- ✅ Zero boilerplate in activities
- ✅ Developer controls access via query wrapper
- ✅ Reactive updates in UI automatically

### ❌ Using Workflow State for Business Logic

```typescript
// WRONG: Inspecting workflow state in mutations
export const updateDocument = mutation({
  args: { documentId: v.id('documents'), content: v.string() },
  handler: async (ctx, args) => {
    const doc = await DocumentDomain.getById(ctx, args.documentId)

    // ❌ Don't check workflow state for business logic!
    const workflowState = await getWorkflowState(ctx.db, doc.workflowId)
    if (workflowState !== 'started') {
      throw new Error('Cannot edit')
    }

    await DocumentDomain.update(ctx, args.documentId, { content: args.content })
  },
})

// RIGHT: Use domain state
export const updateDocument = mutation({
  args: { documentId: v.id('documents'), content: v.string() },
  handler: async (ctx, args) => {
    const doc = await DocumentDomain.getById(ctx, args.documentId)

    // ✅ Check domain state instead
    if (doc.status !== 'draft') {
      throw new Error('Cannot edit - document is not in draft')
    }

    await DocumentDomain.update(ctx, args.documentId, { content: args.content })
  },
})

// EXCEPTION: UI queries can check workflow state
export const getDocumentDisplay = query({
  args: { documentId: v.id('documents') },
  handler: async (ctx, args) => {
    const doc = await DocumentDomain.getById(ctx, args.documentId)

    // ✅ OK: For UI display purposes only
    const workflowState = await getWorkflowState(ctx.db, doc.workflowId)
    const taskStates = await getWorkflowTaskStates(ctx.db, {
      workflowName: 'documentReview',
      workflowId: doc.workflowId,
    })

    return { doc, workflowState, taskStates }
  },
})
```

**Why this is wrong:**

- Workflow state is orchestration state, not business state
- Business logic should be based on domain state (e.g., `doc.status`)
- Creates tight coupling between orchestration and business logic
- Makes the system harder to understand and maintain

**The only exception:** UI queries can inspect workflow state to show progress indicators, enable/disable buttons, etc.

### ❌ Multiple Start or End Conditions

```typescript
// WRONG: Multiple start conditions
Builder.workflow('myWorkflow')
  .startCondition('start1') // ❌
  .startCondition('start2') // ❌ YAWL violation!
  .task('doWork', myTask)
  .endCondition('end')
  .connectCondition('start1', (to) => to.task('doWork'))
  .connectCondition('start2', (to) => to.task('doWork'))
  .connectTask('doWork', (to) => to.condition('end'))

// WRONG: Multiple end conditions
Builder.workflow('myWorkflow')
  .startCondition('start')
  .task('decide', decideTask.withSplitType('xor'))
  .endCondition('successEnd') // ❌
  .endCondition('failureEnd') // ❌ YAWL violation!
  .connectCondition('start', (to) => to.task('decide'))
  .connectTask('decide', (to) =>
    to
      .condition('successEnd')
      .condition('failureEnd')
      .route(async ({ mutationCtx, route }) => {
        // ...
      }),
  )

// RIGHT: Exactly one start and one end
Builder.workflow('myWorkflow')
  .startCondition('start') // ✓ One start
  .task('decide', decideTask.withSplitType('xor'))
  .condition('success')
  .condition('failure')
  .task('merge', mergeTask.withJoinType('xor'))
  .endCondition('end') // ✓ One end
  .connectCondition('start', (to) => to.task('decide'))
  .connectTask('decide', (to) =>
    to
      .condition('success')
      .condition('failure')
      .route(async ({ mutationCtx, route }) => {
        const result = await MyDomain.getResult(mutationCtx)
        return result.success
          ? route.toCondition('success')
          : route.toCondition('failure')
      }),
  )
  .connectCondition('success', (to) => to.task('merge'))
  .connectCondition('failure', (to) => to.task('merge'))
  .connectTask('merge', (to) => to.condition('end'))
```

**Why this is wrong:**

- YAWL semantics require exactly one start and one end condition per workflow
- Multiple start/end conditions violate the formal model
- Will cause runtime errors
- Use intermediate conditions and XOR-join tasks to merge paths back to single end

### ❌ Infinite Loops Without Exit Condition

```typescript
// WRONG: Loop with no logical exit (will loop forever)
.connectTask('check', to =>
  to
    .condition('continue')
    .condition('end')
    .route(async ({ route }) => {
      return route.toCondition('continue') // Always loops!
    })
)

// RIGHT: Always have a logical exit condition
.connectTask('check', to =>
  to
    .condition('continue')
    .condition('end')
    .route(async ({ mutationCtx, route, parent }) => {
      const iteration = await LoopDomain.getIteration(
        mutationCtx,
        parent.workflow.id,
      )
      // XOR: return single route
      return iteration < 10
        ? route.toCondition('continue')
        : route.toCondition('end')
    })
)
```

**Important**: While loops won't cause mutation timeouts (each iteration is just state transitions), you still need exit conditions to prevent logical infinite loops where your workflow never completes

---
