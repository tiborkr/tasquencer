# Workflow Basics

> **Prerequisites**: [Getting Started](./GETTING_STARTED.md), [Core Concepts](./CORE_CONCEPTS.md), [Domain Modeling](./DOMAIN_MODELING.md)  
> **Related**: [Advanced Workflows](./WORKFLOWS_ADVANCED.md) | [Actions vs Activities](./ACTIONS_ACTIVITIES.md)

This guide covers the fundamental building blocks for creating Tasquencer workflows.

## Table of Contents

- [Builder API Reference](#builder-api-reference)
- [Work Items](#work-items)
- [Tasks](#tasks)
- [Workflows](#workflows)
- [Conditions](#conditions)
- [Connecting Elements](#connecting-elements)

---

## Builder API Reference

### Workflow Builder

```typescript
Builder.workflow(name: string)
  // Define elements
  .startCondition(name: string)  // ⚠️ Required - exactly one per workflow
  .endCondition(name: string)    // ⚠️ Required - exactly one per workflow
  .condition(name: string)
  .task(name: string, taskBuilder: TaskBuilder)
  .compositeTask(name: string, compositeTaskBuilder: CompositeTaskBuilder)
  .dummyTask(name: string, dummyTaskBuilder: DummyTaskBuilder)

  // Connect flows (bipartite graph rules)
  .connectCondition(name, builder => builder.task(...))        // Condition → Task only
  .connectTask(name, builder => builder.condition(...).task(...)) // Task → Condition or Task

  // Advanced
  .withActions(actions: WorkflowActions)
  .withActivities(activities: WorkflowActivities)
  .withCancellationRegion(taskName, builder => builder.task(...).condition(...))

  // Build
  .build() // Returns Workflow runtime element
```

**YAWL requirement:**

- ⚠️ **Every workflow MUST have exactly one `.startCondition()` and exactly one `.endCondition()`**
- Multiple start/end conditions violate YAWL semantics and will cause runtime errors
- All workflow paths must eventually lead to the single end condition

**Connection rules (bipartite graph):**

- `connectCondition()` can only connect to tasks (not other conditions)
- `connectTask()` can connect to conditions or tasks
- When connecting task → task, an implicit condition is created automatically
- Conditions cannot be directly connected to other conditions

### Task Builder

```typescript
Builder.task(workItemBuilder: WorkItemBuilder)
  // Control flow
  .withSplitType('and' | 'xor' | 'or')  // Default: 'and'
  .withJoinType('and' | 'xor' | 'or')   // Default: 'and'

  // Lifecycle
  .withActivities({
    onEnabled: async (ctx) => { /* ... */ },
    onStarted: async (ctx) => { /* ... */ },
    onCompleted: async (ctx) => { /* ... */ },
    onFailed: async (ctx) => { /* ... */ },
    onCanceled: async (ctx) => { /* ... */ },
    onWorkItemStateChanged: async (ctx) => {
      // Called when ANY work item state changes
      // Runs BEFORE policies are evaluated
      // Can dynamically initialize new work items based on state/payload
    }
  })
  // See [Complete Activity Reference](./ACTIONS_ACTIVITIES.md#complete-activity-reference)
  // for details on registerScheduled availability and child element access patterns

  // Policy (evaluated AFTER activities)
  .withPolicy(async (ctx) => 'continue' | 'fail' | 'complete')
    // Called when ANY work item transitions to completed/failed/canceled
    // ⚠️ NOT called during workflow cancellation (clean shutdown bypass)
    // ⚠️ NOT called during workflow failure (non-originating tasks canceled)
    // Receives ctx.transition: { prevState, nextState }
    // Returns:
    //   - 'continue': work item changed state but task doesn't transition
    //   - 'fail': task should fail → workflow fails → other tasks canceled
    //   - 'complete': task should complete
  // Default policy (if not specified):
  //   The policy checks if all work items are finalized (completed, failed, or canceled).
  //   - `nextState === 'completed'`: Returns `'complete'` if all work items are finalized, otherwise `'continue'`.
  //   - `nextState === 'failed'`: Returns `'fail'` immediately. This is fail-fast behavior.
  //   - `nextState === 'canceled'`: Returns `'complete'` if all work items are finalized, otherwise `'continue'`.
  //   This ensures cancellation doesn't prematurely complete the task while other work items are still running.
  //   Failure, however, propagates immediately by default.
  // Policy sees any work items created in onWorkItemStateChanged
  // See task.ts and compositeTask.ts for implementation
```

### Dummy Task Builder

```typescript
Builder.dummyTask()
  // Control flow (same as regular task)
  .withSplitType('and' | 'xor' | 'or')
  .withJoinType('and' | 'xor' | 'or')

  // Activities (for routing logic, no work items)
  .withActivities({
    onEnabled: async (ctx) => {
      /* ... */
    },
    onStarted: async (ctx) => {
      /* ... */
    },
    onCompleted: async (ctx) => {
      /* ... */
    },
  })
```

**Use dummy tasks when:**

- You need split/join behavior without actual work
- Creating fan-out/gather patterns with OR-joins
- Workflow structure requires a task but no domain logic exists

**Note**: Dummy tasks are different from `Builder.noOpTask` (used in tests). Dummy tasks automatically start and complete, while noOpTask requires explicit work item lifecycle management.

### Work Item Builder

**Important: Default vs Custom Actions**

When you DON'T call `.withActions()`, the work item uses **default actions** that:
- Automatically assert `isInternalMutation=true`
- Can ONLY be called by activities or scheduled functions
- Cannot be called from external API (will throw `NotInternalMutationError`)
- Perfect for system-only work items

When you DO call `.withActions()`, you create **custom actions** that:
- **⚠️ SECURITY CRITICAL**: YOU MUST implement authentication and authorization logic
- Exposed as public API mutations - accessible to any authenticated user without checks
- Can be called externally (users) or internally (activities/scheduled functions)
- Check `isInternalMutation` flag to differentiate call sources
- Perfect for user-facing work items

```typescript
// Example: Default actions (system-only)
Builder.workItem('notification')
  .withActivities({
    onInitialized: async ({ workItem }) => {
      // Activities automatically set isInternalMutation=true
      workItem.start({})
    },
  })
// No .withActions() = default actions (internal only)

// Example: Custom actions (user-facing)
Builder.workItem('review')
  .withActions(
    Builder.workItemActions()
      .initialize(schema, callback)
      .start(schema, callback)  // ⚠️ MUST implement auth here
      .complete(schema, callback)
      .fail(schema, callback)
      .cancel(schema, callback)
      .reset(schema, callback)  // Transition from started → initialized
  )
  .withActivities({
    onInitialized: async ({ workItem }) => {
      // Auto-trigger: Can call workItem.start(payload) to auto-start
      // See "Auto-Trigger Pattern" section below
    },
    onStarted: async ({ workItem }) => {
      // Auto-trigger: Can call workItem.complete/fail/cancel(payload)
      // See "Auto-Trigger Pattern" section below
    },
    onCompleted: async (ctx) => { /* ... */ },
    onFailed: async (ctx) => { /* ... */ },
    onCanceled: async (ctx) => { /* ... */ },
    onReset: async (ctx) => {
      // Called after work item transitions from started → initialized via reset
      // Use for cleanup of partial work or logging
    }
  })
```

> **⚠️ SECURITY WARNING: Custom Actions Create Public APIs**
>
> Custom actions are exposed as public mutations. Without proper authorization:
> ```typescript
> // ❌ DANGER: Anyone can complete this work item!
> Builder.workItem('review')
>   .withActions(
>     Builder.workItemActions().complete(
>       z.object({ approved: z.boolean() }),
>       async ({ mutationCtx, workItem }, payload) => {
>         // Missing authentication - SECURITY VULNERABILITY
>         await MyDomain.complete(mutationCtx, workItem.id, payload)
>       }
>     )
>   )
>
> // ✅ CORRECT: Check authorization for external calls
> Builder.workItem('review')
>   .withActions(
>     Builder.workItemActions().complete(
>       z.object({ approved: z.boolean() }),
>       async ({ mutationCtx, workItem, isInternalMutation }, payload) => {
>         // ⚠️ REQUIRED: Authenticate external calls
>         if (!isInternalMutation) {
>           const authUser = await authComponent.safeGetAuthUser(mutationCtx)
>           assertAuthenticatedUser(authUser)
>           // Check user can complete THIS specific work item
>           await assertUserCanCompleteWorkItem(mutationCtx, authUser.userId, workItem.id)
>         }
>         await MyDomain.complete(mutationCtx, workItem.id, payload)
>       }
>     )
>   )
> ```
> See [Authorization Guide](./AUTHORIZATION.md) for complete patterns.

**Context object fields:**

All actions and activities receive a context object with these fields:
- `mutationCtx`: Database access and scheduler
- `isInternalMutation`: Boolean flag indicating if call is from internal mutation (`true`) or external API (`false`)
  - Only relevant for **custom actions** - default actions automatically assert `isInternalMutation=true`
- `executionMode`: Current workflow execution mode (`'normal'` or `'recovery'`)
- `parent`: Parent element info (workflow ID and name)
- `registerScheduled`: Schedule work tied to this element's lifecycle (only available in specific activity callbacks; see below)
- `workItem`/`workflow`/`task`: Element-specific methods and IDs
- `audit`: Tracing information

The `isInternalMutation` flag enables different authorization approaches for user-initiated actions vs system callbacks. When activities trigger actions via auto-trigger queue, `isInternalMutation` is automatically set to `true`. See [Authorization → Authentication Architecture](./AUTHORIZATION.md#authentication-architecture) for details.

**`registerScheduled` availability**

`registerScheduled` is only provided in activity contexts where the element is still active:

- ✅ `onInitialized`, `onEnabled`, `onStarted`, `onWorkItemStateChanged`, `onWorkflowStateChanged`
- ❌ `onCompleted`, `onFailed`, `onCanceled`, `onDisabled`, `onReset`

Use `mutationCtx.scheduler` directly from teardown callbacks (`onCompleted`, `onFailed`, `onCanceled`) when you need scheduled work to outlive the element being cleaned up. See [External Communication](./EXTERNAL_IO.md#pattern-teardown-activity-scheduling) for examples.

**⚠️ Important: Call Order for Type Inference**

When using auto-triggers, **you MUST call `.withActions()` before `.withActivities()`** for TypeScript to correctly infer the payload types for `ctx.workItem.start()`, `ctx.workItem.complete()`, `ctx.workItem.fail()`, and `ctx.workItem.cancel()` inside activity callbacks.

```typescript
// ✅ CORRECT: withActions() before withActivities()
const correctItem = Builder.workItem('correct')
  .withActions(
    Builder.workItemActions()
      .start(z.object({ reason: z.string() }), async (ctx) => {
        /* ... */
      })
      .complete(z.object({ result: z.number() }), async (ctx) => {
        /* ... */
      }),
  )
  .withActivities({
    onInitialized: async (ctx) => {
      // ✅ TypeScript knows payload must be { reason: string }
      ctx.workItem.start({ reason: 'auto-started' })
    },
    onStarted: async (ctx) => {
      // ✅ TypeScript knows payload must be { result: number }
      ctx.workItem.complete({ result: 42 })
    },
  })

// ❌ WRONG: withActivities() before withActions()
const brokenItem = Builder.workItem('broken')
  .withActivities({
    onInitialized: async (ctx) => {
      // ❌ TypeScript can't infer payload type - will be 'never' or 'unknown'
      ctx.workItem.start({ reason: 'auto-started' }) // Type error!
    },
  })
  .withActions(
    Builder.workItemActions().start(
      z.object({ reason: z.string() }),
      async (ctx) => {
        /* ... */
      },
    ),
  )
```

This is a **TypeScript limitation** - the type inference flows left-to-right through the builder chain, so actions must be defined before activities to establish the correct types.

### Auto-Trigger Pattern

**Use case**: Auto-triggers are for work items where the concept of "claiming" makes no sense - you want a simple, immediately-enabled work item that processes automatically without human interaction.

**Common scenarios**:
- System tasks (sending notifications, logging events, scheduled processing)
- Automated background jobs (data synchronization, cleanup tasks)
- AI processing tasks (document analysis, content generation)
- Simple atomic actions that don't require user "claiming" before execution

**Key principle**: If your work item doesn't need to sit in a work queue waiting for a human to claim it, use auto-triggers.

Work items support **auto-transitions** via special methods in activities:

```typescript
// onInitialized can auto-start
const autoStartItem = Builder.workItem('autoStart')
  .withActions(
    Builder.workItemActions().start(schema, async (ctx) => {
      await ctx.workItem.start()
    }),
  )
  .withActivities({
    onInitialized: async (ctx) => {
      // Auto-transition to started (deferred until after onInitialized completes)
      ctx.workItem.start(payload)
    },
  })

// onStarted can auto-complete/fail/cancel
const autoCompleteItem = Builder.workItem('autoComplete')
  .withActions(
    Builder.workItemActions()
      .start(schema, async (ctx) => {
        await ctx.workItem.start()
      })
      .complete(schema, async (ctx) => {
        await ctx.workItem.complete()
      }),
  )
  .withActivities({
    onInitialized: async (ctx) => {
      ctx.workItem.start({ reason: 'auto-started' })
    },
    onStarted: async (ctx) => {
      // Auto-transition to completed (deferred until after onStarted completes)
      ctx.workItem.complete({ result: 'auto-completed' })
    },
  })
```

**How it works:**

1. Activity methods (`onInitialized`, `onStarted`) provide transition methods (`start`, `complete`, `fail`, `cancel`)
2. Calling a transition method **sets a flag** but doesn't execute immediately
3. The transition executes **after the activity completes**
4. Only the **first** transition called is executed (subsequent calls are ignored)
5. **Multiple work items** initialized in the same task activity are batched to prevent race conditions

**When to use:**

- ✅ "One-off" work items that represent a single atomic action (e.g., sending a notification, logging an event)
- ✅ Work items where `initialized` vs `started` distinction is meaningless for your domain
- ✅ Simple state machines where work completes immediately upon starting

**When NOT to use:**

- ❌ Work items that require user interaction between `initialized` and `started` states
- ❌ Work items used in **deferred choice patterns** (see test: `convex/tasquencer/__tests__/deferred-choice.test.ts`)
  - Deferred choice requires work items to remain in `initialized` state until one is chosen
  - Auto-start would immediately start ALL competing work items, breaking the pattern
- ❌ Work items used in **cancellation regions**
  - Cancellation regions are triggered when tasks complete
  - Auto-complete (via auto-start + auto-complete in onStarted) would immediately trigger cancellation, potentially bypassing important control flow
- ❌ Work items where you need to inspect state between transitions (e.g., approval workflows)

**Example: Deferred Choice Anti-Pattern**

```typescript
// ❌ WRONG: Auto-start breaks deferred choice
const brokenDeferredChoice = Builder.workflow('broken')
  .startCondition('start')
  .task('option1', task(autoStartWorkItem)) // Auto-starts immediately!
  .task('option2', task(autoStartWorkItem)) // Auto-starts immediately!
  .connectCondition('start', (to) => to.task('option1').task('option2'))
// Both tasks start, breaking the "choice" - user can't choose anymore!

// ✅ RIGHT: Manual start allows deferred choice
const correctDeferredChoice = Builder.workflow('correct')
  .startCondition('start')
  .task('option1', task(manualStartWorkItem)) // Waits in 'initialized'
  .task('option2', task(manualStartWorkItem)) // Waits in 'initialized'
  .connectCondition('start', (to) => to.task('option1').task('option2'))
// User chooses by calling startWorkItem on one → other gets canceled
```

**Race condition prevention:**

When multiple work items are initialized in a single task activity (e.g., `onEnabled`, `onStarted`, `onWorkItemStateChanged`), auto-triggers are batched:

```typescript
// Multiple work items with auto-transitions - handled safely
task(autoCompleteItem).withActivities({
  onEnabled: async ({ workItem }) => {
    await workItem.initialize() // Auto-starts → auto-completes
    await workItem.initialize() // Auto-starts → auto-completes
    await workItem.initialize() // Auto-starts → auto-completes
    // All 3 transitions are batched and execute in parallel AFTER onEnabled completes
    // No race condition - task won't complete until all work items finish
  },
})
```

**Implementation details:**

- Auto-triggers use `WorkItemAutoTriggerQueue` internally
- Queue is created in `Task.afterEnable()`, `Task.afterStart()`, and `Task.workItemStateChanged()`
- All queued transitions execute with `Promise.all()` after the activity completes
- Direct work item API calls (e.g., `api.startWorkItem()`) bypass the queue and execute immediately

**Summary:**

- ✅ Use for simple, atomic work items where state separation is meaningless
- ❌ Avoid for interactive workflows, deferred choice, or cancellation regions
- 🔧 Engine automatically batches transitions to prevent race conditions
- 📖 See tests: `convex/tasquencer/__tests__/auto-trigger.test.ts`

````

### Composite Task Builder

```typescript
Builder.compositeTask(workflowBuilder: WorkflowBuilder)
  .withSplitType('and' | 'xor' | 'or')
  .withJoinType('and' | 'xor' | 'or')
  .withActivities({
    onEnabled: async ({ workflow, mutationCtx }) => {
      await workflow.initialize({ /* payload */ })
    },
    onWorkflowStateChanged: async ({ workflow, mutationCtx }) => {
      // Called when nested workflow state changes
      // Can dynamically initialize additional workflows based on state
    },
    // ... other lifecycle hooks
  })
  .withPolicy(async (ctx) => 'continue' | 'fail' | 'complete')
    // Called when ANY subworkflow transitions to completed/failed/canceled
    // Receives ctx.transition: { prevState, nextState }
    // Returns same values as task policies
  // Default policy (if not specified):
  // - nextState === 'completed': 'complete' if all workflows are finalized, else 'continue'
  // - nextState === 'failed': 'fail' immediately (fail-fast behavior)
  // - nextState === 'canceled': 'complete' if all workflows are finalized, else 'continue'
````

---

## State Transition Policies

Tasks and composite tasks use **state transition policies** to determine how the task should respond when work items (or subworkflows) change state.

### Unified Policy System

Instead of separate policies for completion, failure, and cancellation, Tasquencer uses a single `stateTransition` policy that receives both the previous and next state, allowing for more nuanced control.

**Policy signature:**

```typescript
type TaskStateTransitionPolicy = (ctx: {
  mutationCtx: MutationCtx
  parent: { workflow: { id: Id<'tasquencerWorkflows'>, name: string } }
  task: {
    name: string
    generation: number
    path: string[]
    getStats: () => Promise<{
      total: number
      initialized: number
      started: number
      completed: number
      failed: number
      canceled: number
    }>
  }
  workItem: TaskWorkItemQueriesContext
  transition: {
    prevState: WorkItemState
    nextState: WorkItemState
  }
}) => Promise<'continue' | 'fail' | 'complete'>
```

**Return values:**

- `'continue'`: The work item/workflow changed state, but the task doesn't need to transition
- `'fail'`: The task should fail
- `'complete'`: The task should complete

### Default Policies

**For tasks** (based on work item states):

```typescript
.withPolicy(async ({ task: { getStats }, transition }) => {
  const { nextState } = transition
  const stats = await getStats()

  // Check if all work items are finalized (in a terminal state)
  const allFinalized =
    stats.completed + stats.failed + stats.canceled === stats.total

  if (nextState === 'completed') {
    // Complete task only when ALL work items are finalized
    return allFinalized ? 'complete' : 'continue'
  }

  if (nextState === 'failed') {
    // Fail immediately on first work item failure (fail-fast behavior)
    return 'fail'
  }

  if (nextState === 'canceled') {
    // When a work item is canceled, check if all work items are finalized
    return allFinalized ? 'complete' : 'continue'
  }

  return 'continue'
})
```

**For composite tasks** (based on subworkflow states):

```typescript
.withPolicy(async ({ task: { getStats }, transition }) => {
  const { nextState } = transition
  const stats = await getStats()

  // Check if all workflows are finalized (in a terminal state)
  const allFinalized =
    stats.total > 0 &&
    stats.completed + stats.failed + stats.canceled === stats.total

  if (nextState === 'completed') {
    // Complete task only when ALL subworkflows are finalized
    return allFinalized ? 'complete' : 'continue'
  }

  if (nextState === 'failed') {
    // Fail immediately on first subworkflow failure (fail-fast behavior)
    return 'fail'
  }

  if (nextState === 'canceled') {
    // When a subworkflow is canceled, check if all workflows are finalized
    return allFinalized ? 'complete' : 'continue'
  }

  return 'continue'
})
```

### Custom Policy Examples

**Example 1: Require at least 2 completions**

```typescript
.withPolicy(async ({ task: { getStats }, transition }) => {
  if (transition.nextState === 'completed') {
    const stats = await getStats()
    return stats.completed >= 2 ? 'complete' : 'continue'
  }
  return 'continue'
})
```

**Example 2: Fail-fast on first failure**

```typescript
.withPolicy(async ({ task: { getStats }, transition }) => {
  const { nextState } = transition
  const stats = await getStats()

  if (nextState === 'failed') {
    return 'fail' // Fail immediately on first failure
  }

  if (nextState === 'completed') {
    return stats.total === stats.completed ? 'complete' : 'continue'
  }

  return 'continue'
})
```

**Example 3: Conditional completion based on domain state**

```typescript
.withPolicy(async ({ mutationCtx, parent, task, transition }) => {
  if (transition.nextState === 'completed') {
    const stats = await task.getStats()

    // Use domain function to check business rules
    const order = await OrderDomain.getByWorkflowId(mutationCtx, parent.workflow.id)

    // Only complete task if all work items done AND domain requirements met
    if (stats.total === stats.completed && order.qualityScore >= 80) {
      return 'complete'
    }

    return 'continue'
  }

  return 'continue'
})
```

### Policy Execution Order

1. **Work item/workflow transitions** (e.g., initialized → started → completed)
2. **`onWorkItemStateChanged` activity** runs (can initialize additional work items)
3. **Policy is evaluated** (receives all work items, including newly created ones)
4. **Task transitions** based on policy result

This means policies can react to work items created dynamically in response to other work item state changes.

### Best Practices

✅ **Do:**

- Use policies for orchestration decisions (when should the task complete?)
- Access domain state via domain functions when needed
- Return `'continue'` for intermediate states
- Use `getStats()` to check work item/workflow counts

❌ **Don't:**

- Modify domain state in policies (read-only)
- Use policies for business logic (use activities instead)
- Forget to handle all three terminal states (completed, failed, canceled)
- Assume policies run for every state change (only terminal states)

---
