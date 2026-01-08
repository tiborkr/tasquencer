# Actions vs Activities

> **Prerequisites**: [Workflow Basics](./WORKFLOWS_BASIC.md), [Domain Modeling](./DOMAIN_MODELING.md)  
> **Related**: [Getting Started](./GETTING_STARTED.md) | [External Communication](./EXTERNAL_IO.md)

This guide explains the critical distinction between actions (external boundary) and activities (internal callbacks), including work item access patterns.

## Table of Contents

- [Actions vs Activities](#actions-vs-activities)
  - [Actions (Boundary Layer)](#actions-boundary-layer)
  - [Activities (Internal Callbacks)](#activities-internal-callbacks)
  - [Complete Activity Reference](#complete-activity-reference)
  - [When to Use Which Activity](#when-to-use-which-activity)
- [Critical: Child Element Access Patterns in Task & CompositeTask Activities](#critical-child-element-access-patterns-in-task--compositetask-activities)

---

> **All Actions and Activities Are Optional**
>
> You don't need to define custom actions or activities. Tasquencer provides defaults:
> - **Default actions** call the corresponding transition method with no additional logic
> - **Default activities** are no-ops
>
> Only define custom actions when you need:
> - User-facing APIs with authorization
> - Custom business logic before/after transitions
>
> Only define activities when you need:
> - Side effects on state transitions
> - Auto-trigger patterns (e.g., auto-start on initialize)

## Actions vs Activities

### Actions (Boundary Layer)

**When to use**: External interactions (your app → Tasquencer)

Actions are strongly-typed entry points (like tRPC procedures) that:

- Validate input schemas (Zod)
- Can authorize users
- Serve as system boundaries
- Should use domain functions for data access

```typescript
// Domain functions
const MyDomain = {
  async createTask(
    ctx: { db: DatabaseWriter },
    data: { userId: string; workItemId: Id<'tasquencerWorkItems'> },
  ) {
    return await ctx.db.insert('myDomainTable', {
      userId: data.userId,
      workItemId: data.workItemId,
      status: 'pending',
    })
  },

  async updateTask(
    ctx: { db: DatabaseWriter },
    workItemId: Id<'tasquencerWorkItems'>,
    updates: { result?: string; status?: string },
  ) {
    const task = await ctx.db
      .query('myDomainTable')
      .withIndex('by_work_item', (q) => q.eq('workItemId', workItemId))
      .unique()
    if (!task) throw new Error('Task not found')
    await ctx.db.patch(task._id, updates)
  },
}

// Actions use domain functions
const myDomainWritePolicy = authService.policies.requireScope('myDomain:write')

const myActions = authService.builders.workItemActions
  .initialize(
    z.object({ userId: z.string() }),
    myDomainWritePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const workItemId = await workItem.initialize()

      // Use domain function
      await MyDomain.createTask(mutationCtx, {
        userId: payload.userId,
        workItemId,
      })
    },
  )
  .complete(
    z.object({ result: z.string() }),
    myDomainWritePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      // Use domain function to update
      await MyDomain.updateTask(mutationCtx, workItem.id, {
        result: payload.result,
        status: 'completed',
      })

      // Engine automatically completes the work item
    },
  )
  .build()
```

**Key points:**

- Type-safe (Zod schemas)
- Called by external code
- Engine ensures state transitions happen automatically
- Call workItem/workflow methods only when you need the ID
- Always use domain functions for data access
- Sync domain state → workflow state

#### Default vs Custom Actions

Tasquencer distinguishes between **default actions** (internal-only) and **custom actions** (public-facing):

**Default Actions (Internal Only):**
- Created when you DON'T define an action for a work item operation
- Automatically include `assertIsInternalMutation(isInternalMutation)`
- Can ONLY be called by activities (auto-trigger queue) or scheduled functions
- Cannot be called from external API (will throw `NotInternalMutationError`)
- Perfect for: Activity-triggered operations, auto-transitions, system-only work items

**Custom Actions (Public Facing):**
- Created when you DO define an action with `.initialize()`, `.complete()`, etc.
- **⚠️ SECURITY CRITICAL**: YOU MUST implement authentication and authorization logic
- Exposed as public API mutations - accessible to any authenticated user without additional checks
- Can be called from external API (user-initiated) or internally (activities, scheduled functions)
- Activities automatically set `isInternalMutation=true` when triggering actions
- Perfect for: User-facing operations, work items users can claim/start/complete

**When to use each:**

> **⚠️ SECURITY WARNING: Custom Actions Are Public APIs**
>
> When you create custom actions, they are **exposed as public mutations** in your Convex API.
> This means any authenticated user can potentially call them unless you implement proper
> authorization checks.
>
> **YOU MUST**:
> - Verify user identity (authentication)
> - Check user permissions (authorization)
> - Validate the user can access the specific work item/workflow
> - Consider using `isInternalMutation` to skip checks for internal calls
>
> **Failing to implement authorization can lead to**:
> - Unauthorized users completing work items they don't own
> - Privilege escalation attacks
> - Data breaches through workflow manipulation

```typescript
// Example 1: Default action - internal only
// Good for: System work items, auto-triggered operations
const notificationWorkItem = Builder.workItem('sendNotification')
  .withActivities({
    onInitialized: async ({ workItem }) => {
      // Auto-trigger start (this sets isInternalMutation=true internally)
      workItem.start({})
    },
    onStarted: async ({ mutationCtx, workItem }) => {
      await sendNotification(mutationCtx)
      // Auto-trigger complete (this sets isInternalMutation=true internally)
      workItem.complete({})
    },
  })
// No .withActions() = default actions with assertIsInternalMutation

// Example 2: Custom action - public facing
// Good for: User tasks, approvals, manual operations
// ⚠️ SECURITY CRITICAL: Custom actions expose public APIs
const reviewWritePolicy = authService.policies.requireScope('review:write')

const reviewActions = authService.builders.workItemActions
  .complete(
    z.object({ approved: z.boolean() }),
    reviewWritePolicy,
    async ({ mutationCtx, workItem, isInternalMutation }, payload) => {
      // ⚠️ SECURITY REQUIRED: Check authorization for external calls
      if (!isInternalMutation) {
        // External call from user - MUST verify identity and permissions
        const authUser = await authComponent.safeGetAuthUser(mutationCtx)
        assertAuthenticatedUser(authUser, { operation: 'complete' })
      }
      // Internal callbacks (from activities or scheduled actions) can bypass user auth
      // The initial action that scheduled them was already authorized
      // This is safe because internal API variants can only be called from server-side code

      // Business logic runs regardless of call source
      await MyDomain.updateReview(mutationCtx, workItem.id, payload)
    },
  )
  .build()

const reviewWorkItem = Builder.workItem('review').withActions(reviewActions)
```

**Important**: When activities trigger work item operations via the auto-trigger queue (e.g., calling `workItem.start()` or `workItem.complete()` inside an activity), Tasquencer automatically sets `isInternalMutation=true`. This means:
- Default actions will succeed (they require `isInternalMutation=true`)
- Custom actions see `isInternalMutation=true` and can skip external authentication

#### isInternalMutation Flag (Custom Actions)

**Note**: This pattern is ONLY relevant for **custom actions**. Default actions automatically assert `isInternalMutation=true` and cannot be called externally.

All custom action contexts include an `isInternalMutation: boolean` flag that indicates the call source:

- `false`: Direct call from external API (public mutation) - typically user-initiated
- `true`: Internal callback from scheduled action, activity auto-trigger, or system operation

**Use case**: Enable different authorization strategies for user actions vs system callbacks.

```typescript
const myDomainWritePolicy = authService.policies.requireScope('myDomain:write')

const myActions = authService.builders.workItemActions
  .complete(
    z.object({ result: z.string() }),
    myDomainWritePolicy,
    async ({ mutationCtx, workItem, isInternalMutation }, payload) => {
      // ⚠️ SECURITY CRITICAL: This check is REQUIRED for custom actions
      // Custom actions are exposed as public APIs - you MUST authenticate external calls
      // Default actions automatically assert isInternalMutation=true and are internal-only

      // REQUIRED: Check authorization for external calls
      if (!isInternalMutation) {
        // External call from user - MUST verify identity and permissions
        const authUser = await authComponent.safeGetAuthUser(mutationCtx)
        assertAuthenticatedUser(authUser, {
          operation: 'completeWorkItem',
          workItemId: workItem.id,
        })
      }
      // Internal callbacks (from activities or scheduled actions) can bypass user auth
      // The initial action that scheduled them was already authorized
      // This is safe because internal API variants can only be called from server-side code

      // Business logic executes regardless of call source
      await MyDomain.complete(mutationCtx, workItem.id, payload.result)
    },
  )
  .build()

const myWorkItem = Builder.workItem('myWorkItem').withActions(myActions)
```

See [Authorization → Internal vs External Mutations](./AUTHORIZATION.md#internal-vs-external-mutations) for detailed patterns.

#### Reset Action

The `reset` action allows a work item to transition from `started` back to `initialized`, enabling retry scenarios without failing the work item.

**State transition:** `started` → `initialized`

**Use cases:**
- Retry a work item from the beginning after a recoverable error
- Manual intervention to restart work
- Undo a premature start

**Example:**

```typescript
const retryablePolicy = authService.policies.requireScope('retryable:write')

const retryableActions = authService.builders.workItemActions
  .reset(
    z.object({ reason: z.string() }),
    retryablePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      // Log the reset reason
      await MyDomain.logReset(mutationCtx, workItem.id, payload.reason)
      await workItem.reset()
    },
  )
  .build()

const retryableWorkItem = Builder.workItem('retryable')
  .withActions(retryableActions)
  .withActivities({
    onReset: async ({ mutationCtx, workItem }) => {
      // Cleanup any partial work
      await MyDomain.cleanupPartialWork(mutationCtx, workItem.id)
    },
  })
```

**Key behaviors:**
- Only valid from `started` state (throws error from other states)
- Cancels any scheduled functions registered for the work item
- Triggers `onReset` activity callback after state change
- Work item can be started again after reset
- Stats are updated to reflect the transition

### Activities (Internal Callbacks)

**When to use**: State synchronization (Tasquencer → your app)

Activities should also use domain functions for all data access:

```typescript
// Domain functions
const MyDomain = {
  async getContextByWorkflowId(
    ctx: { db: DatabaseReader },
    workflowId: Id<'tasquencerWorkflows'>,
  ) {
    const context = await ctx.db
      .query('contexts')
      .withIndex('by_workflow', (q) => q.eq('workflowId', workflowId))
      .unique()
    if (!context) throw new Error('Context not found')
    return context
  },

  async updateProgress(
    ctx: { db: DatabaseWriter },
    workflowId: Id<'tasquencerWorkflows'>,
    taskName: string,
  ) {
    // Update progress tracking
    const context = await MyDomain.getContextByWorkflowId(ctx, workflowId)
    await ctx.db.patch(context._id, {
      lastCompletedTask: taskName,
      updatedAt: Date.now(),
    })
  },

  async getWorkItemResult(
    ctx: { db: DatabaseReader },
    workItemId: Id<'tasquencerWorkItems'>,
  ) {
    const result = await ctx.db
      .query('results')
      .withIndex('by_work_item', (q) => q.eq('workItemId', workItemId))
      .unique()
    if (!result) throw new Error('Result not found')
    return result
  },
}

// Activities use domain functions
const myTask = Builder.task(myWorkItem).withActivities({
  onEnabled: async ({ mutationCtx, workItem, parent }) => {
    // Called automatically when task becomes enabled

    // Use domain function to get context
    const context = await MyDomain.getContextByWorkflowId(
      mutationCtx,
      parent.workflow.id,
    )
    await workItem.initialize({ userId: context.userId })
  },

  onWorkItemStateChanged: async ({ mutationCtx, workItem, task, parent }) => {
    // Called when ANY work item state changes
    // Runs BEFORE the task's completion policy is evaluated
    // Good for:
    // - Updating aggregated state
    // - Triggering side effects
    // - Dynamically initializing new work items based on results

    if (workItem.nextState === 'completed') {
      // Use domain function to update progress
      await MyDomain.updateProgress(mutationCtx, parent.workflow.id, task.name)

      // Dynamic initialization example:
      const result = await MyDomain.getWorkItemResult(mutationCtx, workItem.id)
      if (result.needsFollowUp) {
        // Initialize another work item dynamically (same type as current task)!
        await workItem.initialize({
          followUpFor: workItem.id,
        })
        // Task won't complete yet - completion policy will see the new work item
      }
    }
  },
})
```

**Key points:**

- No schemas (internal)
- Called automatically by Tasquencer
- Always use domain functions for data access
- Sync workflow state → domain state
- Cannot be called externally
- Can dynamically initialize work items/workflows based on state changes

#### Complete Activity Reference

The following table shows all available activities across element types with their capabilities:

| Activity | Workflow | Task | CompositeTask | WorkItem | When It Fires | `registerScheduled` | Child Access |
|----------|----------|------|---------------|----------|---------------|---------------------|--------------|
| `onInitialized` | ✅ | - | - | ✅ | Element created | ✅ | N/A |
| `onDisabled` | - | ✅ | ✅ | - | Task disabled by condition | ❌ | Query only* |
| `onEnabled` | - | ✅ | ✅ | - | Task enabled by condition | ✅ | Can create** |
| `onStarted` | ✅ | ✅ | ✅ | ✅ | Element started | ✅ | Can create** |
| `onCompleted` | ✅ | ✅ | ✅ | ✅ | Element completed | ❌ | Query only* |
| `onFailed` | ✅ | ✅ | ✅ | ✅ | Element failed | ❌ | Query only* |
| `onCanceled` | ✅ | ✅ | ✅ | ✅ | Element canceled | ❌ | Query only* |
| `onReset` | - | - | - | ✅ | Work item reset to initialized | ❌ | N/A |
| `onWorkItemStateChanged` | - | ✅ | - | - | Any work item state change | ✅ | Individual work item*** |
| `onWorkflowStateChanged` | - | - | ✅ | - | Any sub-workflow state change | ✅ | Individual workflow*** |

**Legend:**
- *Query only: Only `getAllWorkItemIds()` or `getAllWorkflowIds()` available
- **Can create: Has `workItem.initialize()` or `workflow.initialize()`
- ***Individual element: Access to specific element that changed via `id`, `prevState`, `nextState`

#### `registerScheduled` availability

The `registerScheduled` helper is only included in activity contexts that run while the element is **actively progressing**:

- ✅ **Active lifecycle**: `onInitialized`, `onEnabled`, `onStarted`, `onWorkItemStateChanged`, `onWorkflowStateChanged`
- ❌ **Teardown lifecycle**: `onCompleted`, `onFailed`, `onCanceled`, `onDisabled`, `onReset`

Teardown callbacks execute while Tasquencer is cleaning up the element, so any work registered there would be canceled immediately. When you need a job to outlive teardown work, call `mutationCtx.scheduler.runAfter(...)` directly instead.

#### When to Use Which Activity

Use this decision guide to choose the right activity:

**Need to create child elements?**
- Tasks/CompositeTasks: Use `onEnabled` or `onStarted`
- These have `workItem.initialize()` or `workflow.initialize()`

**Need to react to individual child state changes?**
- Tasks: Use `onWorkItemStateChanged` - receives specific work item with `id`, `prevState`, `nextState`
- CompositeTasks: Use `onWorkflowStateChanged` - receives specific workflow with `id`, `prevState`, `nextState`

**Need to schedule external work tied to element lifecycle?**
- Use active lifecycle activities (`onInitialized`, `onEnabled`, `onStarted`, state change callbacks)
- These have `registerScheduled` which auto-cancels if element fails/cancels

**Need cleanup when element completes/fails/cancels?**
- Use teardown activities (`onCompleted`, `onFailed`, `onCanceled`)
- Use direct `scheduler.runAfter()` (not `registerScheduled`)
- For Tasks/CompositeTasks: Only `getAllWorkItemIds()`/`getAllWorkflowIds()` available

**Need to sync workflow state → domain state?**
- Use the appropriate activity matching the state transition
- Example: `onStarted` to mark domain entity as "in progress"
- Example: `onCompleted` to mark domain entity as "done"

**Need to dynamically create more children based on results?**
- Use `onWorkItemStateChanged` or `onWorkflowStateChanged`
- These fire BEFORE completion policies evaluate
- Can call `workItem.initialize()` or `workflow.initialize()`

### Critical: Child Element Access Patterns in Task & CompositeTask Activities

**Important distinction: Task and CompositeTask activities have different access patterns than Workflow and WorkItem activities.**

Task and CompositeTask activities manage **multiple children** (work items or sub-workflows), so they follow a special access pattern:

#### Access Pattern Rules

**Tasks managing Work Items:**

| Activity | Child Access Pattern |
|----------|---------------------|
| `onEnabled`, `onStarted` | ✅ **Create**: `workItem.initialize(payload)` |
| `onWorkItemStateChanged` | ✅ **Individual**: `workItem.id`, `workItem.prevState`, `workItem.nextState` + can create more |
| `onCompleted`, `onFailed`, `onCanceled`, `onDisabled` | ⚠️ **Query only**: `workItem.getAllWorkItemIds()` |

**CompositeTasks managing Sub-Workflows:**

| Activity | Child Access Pattern |
|----------|---------------------|
| `onEnabled`, `onStarted` | ✅ **Create**: `workflow.initialize(payload)` |
| `onWorkflowStateChanged` | ✅ **Individual**: `workflow.id`, `workflow.prevState`, `workflow.nextState` + can create more |
| `onCompleted`, `onFailed`, `onCanceled`, `onDisabled` | ⚠️ **Query only**: `workflow.getAllWorkflowIds()` |

**Why this design?**

Tasks and composite tasks manage **multiple** children. Most activities operate at the aggregate level (all children), while state change callbacks handle individual children as they transition. This pattern enables:

1. **Dynamic child creation** during active lifecycle (`onEnabled`, `onStarted`)
2. **Individual child tracking** with state change callbacks
3. **Aggregate operations** during teardown (cleanup all children)

**Correct examples:**

```typescript
// ✅ CORRECT: Task activities accessing ALL work items
const myTask = Builder.task(myWorkItem).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    // ✅ Can initialize - creating new work items
    const context = await MyDomain.getContext(mutationCtx, parent.workflow.id)
    await workItem.initialize({ userId: context.userId })
  },

  onCompleted: async ({ workItem, mutationCtx, parent }) => {
    // ✅ Access ALL work items, not individual ones
    const workItemIds = await workItem.getAllWorkItemIds()

    // Update domain state for all completed work items
    for (const id of workItemIds) {
      await MyDomain.markCompleted(mutationCtx, id)
    }
  },

  onCanceled: async ({ workItem, mutationCtx, parent }) => {
    // ✅ Access ALL work items for cleanup
    const workItemIds = await workItem.getAllWorkItemIds()

    for (const id of workItemIds) {
      await MyDomain.cleanup(mutationCtx, id)
    }
  },

  onWorkItemStateChanged: async ({ workItem, task, mutationCtx }) => {
    // ✅ Access the SPECIFIC work item that changed state
    if (workItem.nextState === 'completed') {
      const result = await MyDomain.getResult(mutationCtx, workItem.id)
      await MyDomain.updateProgress(mutationCtx, result)
    }
  },
})

// ❌ INCORRECT: Trying to access single workItem.id in onCompleted
const wrongTask = Builder.task(myWorkItem).withActivities({
  onCompleted: async ({ workItem, mutationCtx }) => {
    // ❌ ERROR: workItem.id does not exist in onCompleted context!
    await MyDomain.updateRecord(mutationCtx, workItem.id, { status: 'done' })
  },
})

// ✅ CORRECT: CompositeTask activities accessing ALL workflows
const myCompositeTask = Builder.compositeTask(subWorkflow).withActivities({
  onEnabled: async ({ workflow, mutationCtx, parent }) => {
    // ✅ Can initialize - creating new sub-workflows
    const sections = await MyDomain.getSections(mutationCtx, parent.workflow.id)
    for (const section of sections) {
      await workflow.initialize({ sectionId: section._id })
    }
  },

  onCompleted: async ({ workflow, mutationCtx, parent }) => {
    // ✅ Access ALL sub-workflows, not individual ones
    const workflowIds = await workflow.getAllWorkflowIds()

    // Aggregate results from all sub-workflows
    for (const id of workflowIds) {
      await MyDomain.aggregateResults(mutationCtx, id)
    }
  },

  onWorkflowStateChanged: async ({ workflow, task, mutationCtx }) => {
    // ✅ Access the SPECIFIC workflow that changed state
    if (workflow.nextState === 'completed') {
      await MyDomain.markSubWorkflowComplete(mutationCtx, workflow.id)
    }
  },
})
```

**Key takeaway:** If you need to access individual work items/workflows in task activities, use `onWorkItemStateChanged` or `onWorkflowStateChanged`. Other activities only have access to the collective via `getAllWorkItemIds()` or `getAllWorkflowIds()`.

### Decision Tree: Actions or Activities?

```
Do you need type-safe external API?
  ├─ YES → Use Actions
  │         (Example: User completing a task from UI)
  │
  └─ NO → Is this an internal state transition?
            ├─ YES → Use Activities
            │         (Example: Auto-initializing work items when enabled)
            │
            └─ NO → You probably need Actions
```

---
