# Core Concepts

> **Prerequisites**: Basic understanding of workflows and state machines  
> **Related**: [Getting Started](./GETTING_STARTED.md) | [Workflow Basics](./WORKFLOWS_BASIC.md) | [Advanced Workflows](./WORKFLOWS_ADVANCED.md)

This guide explains the foundational concepts and mental models for understanding Tasquencer.

## Table of Contents

- [Four Layers](#four-layers)
- [Mental Model](#mental-model)
  - [State Machines](#state-machines)
  - [Cancellation Semantics](#cancellation-semantics)
  - [Failure Semantics](#failure-semantics)
  - [Preventing Failure Propagation with Policies](#preventing-failure-propagation-with-policies)
  - [YAWL-Extended Petri Net Semantics](#yawl-extended-petri-net-semantics)
  - [When to Use Explicit Conditions](#when-to-use-explicit-conditions)

---

## Core Architecture

### Four Layers

#### 1. Builder Layer (Declarative)

Where you define workflows using a fluent API.

```typescript
const workflow = Builder.workflow('myProcess')
  .startCondition('start')
  .task('step1', taskDef)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('step1'))
  .connectTask('step1', (to) => to.condition('end'))
```

#### 2. Elements Layer (Runtime)

Runtime objects that execute the workflow:

- `Workflow` - Container for tasks/conditions
- `Task` - Executable units with work items (with YAWL split/join)
- `CompositeTask` - Nested workflows (static, single sub-workflow)
- `DynamicCompositeTask` - Nested workflows (dynamic, spawns multiple sub-workflows at runtime)
- `DummyTask` - Routing nodes without work items (for explicit joins/splits)
- `WorkItem` - Atomic work units
- `Condition` - Places that hold tokens (from Petri net foundation)

#### 3. Data Layer (Convex Schema)

Tasquencer uses internal Convex tables to persist workflow state. These are implementation details managed by the library.

#### 4. API Layer (Boundary)

- **Actions**: Type-safe boundary for external calls (your app → Tasquencer)
  - **Default actions**: Automatically generated when you don't define custom actions
    - Enforce `assertIsInternalMutation(isInternalMutation)`
    - Can ONLY be called internally (activities, scheduled functions)
    - Cannot be called from external API
  - **Custom actions**: Developer-defined via `.withActions()`
    - YOU implement authentication logic
    - Can be called externally (user-initiated) or internally (system-triggered)
    - Include `isInternalMutation: boolean` flag to distinguish call sources
    - External calls (`isInternalMutation = false`): Direct user actions requiring full authorization
    - Internal calls (`isInternalMutation = true`): System callbacks from scheduled actions or activities
- **Activities**: Internal callbacks for state sync (Tasquencer → your app)
  - When activities trigger actions (via auto-trigger queue), `isInternalMutation = true` is set automatically
  - Enables activity-triggered operations to bypass user authentication checks
  - Include `isInternalMutation` flag in their context for conditional logic
  - See [Complete Activity Reference](./ACTIONS_ACTIVITIES.md#complete-activity-reference) for all available activities, their capabilities, and when to use each

**Default vs Custom Actions:**
- **Default** (no code): Use for system-only work items, internal operations
- **Custom** (your code): Use for user-facing work items, public API access

See [Authorization → Authentication Architecture](./AUTHORIZATION.md#authentication-architecture) for detailed authorization patterns.

---

## Mental Model

### State Machines

```
Workflow/WorkItem Lifecycle:
  initialized → started → completed
                       → failed
                       → canceled

Task Lifecycle:
  disabled → enabled → started → completed
                              → failed
                              → canceled
          ↑________________________|
              (reset on completion)

Condition:
  marking: number (token count, 0 = no tokens)
```

**Important: Tasquencer is NOT a simple state machine.**

Unlike traditional state machines where only one state is active at a time, **Tasquencer workflows can have multiple tasks in the `started` state simultaneously**. This is a fundamental characteristic of workflow engines based on Petri nets.

**Example**: In an RFP workflow, `legalReview`, `securityReview`, and `techReview` can all be `started` in parallel. This is by design and essential for modeling real-world parallel workflows.

**Implications**:
- Don't assume only one task is active when querying task states
- UI components must handle multiple active tasks
- Task states show which tasks are currently active, not a single "current step"

See [Workflow State in UIs](./WORKFLOW_STATE_UI.md) for guidance on handling multiple active tasks in user interfaces.

### Cancellation Semantics

**Core principle: Cancellation only propagates downwards, never upwards.**

When entities are canceled:

1. **Work Item Cancellation**:
   - Work item transitions to `canceled` state
   - Parent task's **policy is called** to decide: `continue`, `complete`, or `fail`
   - Task does NOT automatically become canceled
   - **Default policy** (automatic): `complete` if all work items finalized, else `continue`

2. **Workflow Cancellation**:
   - All active tasks are canceled (without calling their policies)
   - Task cancellation cascades to all child work items/workflows
   - Parent composite task's **policy is called** to decide what to do
   - Composite task does NOT automatically become canceled

3. **Task Cancellation**:
   - All work items are canceled (without calling task policy)
   - Used during workflow cancellation for clean shutdown

**Example flow:**

```
User calls cancelWorkItem() → WorkItem.cancel()
  ↓
  onCanceled activity runs
  ↓
  Task.workItemStateChanged() → Task.policy() called
  ↓
  Policy decides: 'continue', 'complete', or 'fail'

User calls cancelWorkflow() → Workflow.cancel()
  ↓
  All active tasks canceled (policy NOT called)
  ↓
  Task cancellation cascades to work items (policy NOT called)
  ↓
  onCanceled activities run for cleanup
  ↓
  If workflow has parent composite task:
    CompositeTask.workflowStateChanged() → CompositeTask.policy() called
  ↓
  Policy decides: 'continue', 'complete', or 'fail'
```

**Why this design?**

- **Flexibility**: Parent entities can gracefully handle child failures
- **No automatic failure cascades**: One canceled work item doesn't kill the entire workflow
- **Clean shutdown**: Workflow cancellation bypasses policies for deterministic cleanup
- **Business logic control**: Policies let you implement domain-specific cancellation behavior

### Top-Down Command vs. Bottom-Up Signal

To master cancellation, it's crucial to understand the difference between a **top-down command** (canceling a whole workflow) and a **bottom-up signal** (canceling a single work item). While a parent task ultimately uses its policy to react in both cases, the internal mechanics are fundamentally different.

#### Case 1: Top-Down Command (`workflow.cancel()`)

Think of this as a deterministic **teardown command**. When a workflow is told to cancel, its primary responsibility is to shut down its entire internal subnetwork cleanly and predictably.

*   **Internal Responsibility:** It executes an unstoppable, cascading cancellation of all its active tasks and work items.
*   **Policy Rule:** To ensure the shutdown is deterministic, **all policies *within* the canceled workflow are bypassed.** They do not get a vote.
*   **External Signal:** Only after the internal teardown is complete does the workflow transition to `canceled` and notify its parent `CompositeTask`. The parent's policy is then invoked to decide how to proceed.

**Event Sequence:**
1.  `workflow.cancel()` is called.
2.  The workflow immediately cancels all its active (`enabled` or `started`) tasks. **Task policies are NOT called.**
3.  Each task cascades cancellation to its child work items. `onCanceled` activities run for cleanup, but policies are bypassed.
4.  The entire workflow transitions to `canceled`.
5.  The parent `CompositeTask`'s **policy is executed** to decide whether to `continue`, `complete`, or `fail`.

#### Case 2: Bottom-Up Signal (`workItem.cancel()`)

Think of this as a **state change signal** from an atomic unit of work. A work item has no subnetwork to manage. It simply notifies its parent of its new state.

*   **Internal Responsibility:** None. A work item is a leaf node.
*   **Policy Rule:** The parent `Task`'s **policy is always invoked.** It has the authority and context to decide if this single cancellation is significant.
*   **External Signal:** The work item transitions to `canceled`, and the parent task immediately evaluates the situation via its policy.

**Event Sequence:**
1.  `workItem.cancel()` is called (e.g., via the API).
2.  The work item transitions to `canceled` and its `onCanceled` activity runs.
3.  The parent `Task` is notified of the state change.
4.  The parent `Task`'s **policy is executed**, and its return value (`'continue'`, `'complete'`, or `'fail'`) determines the fate of the task.

### The Principle of Isomorphic Behavior

From the perspective of a parent `Task` or `CompositeTask`, its children have the same "shape." It treats them as black boxes that report state changes. Whether a `WorkItem` cancels or a sub-`Workflow` cancels, the parent uses the same mechanism—**its policy**—to react. The key difference is the internal work the child had to do to reach that canceled state.

### Summary Table

| Aspect | `workflow.cancel()` (Top-Down) | `workItem.cancel()` (Bottom-Up) |
| :--- | :--- | :--- |
| **Nature** | A direct **command** to terminate. | A **signal** or state change notification. |
| **Scope** | An entire workflow and all its children. | A single, atomic work item. |
| **Policy Execution**| **Bypassed** *within* the canceled workflow. | **Invoked** by the parent task. |
| **Purpose**| Unstoppable, clean shutdown of a process. | Flexible, localized cancellation that allows the parent process to react gracefully. |
| **Analogy** | A manager commanding a department shutdown. | An employee reporting they cannot complete a task. |

### Failure Semantics

**Important:** This section describes **business exceptions** - expected failure modes that are explicitly modeled in the workflow using `workItem.fail()` or similar mechanisms. These are distinct from **code exceptions** (`throw new Error()`) which cause transaction rollback and are handled by Convex's retry mechanism. See the [Exception Handling](#exception-handling) section for the full distinction.

**Core principle: Failure propagates both downwards (cleanup) and upwards (escalation).**

When entities fail:

1. **Work Item Failure**:
   - Work item transitions to `failed` state
   - Parent task's **policy is called** to decide: `continue`, `complete`, or `fail`
   - **Default policy** (automatic, built-in): Returns `'fail'` immediately (teardown behavior)
   - If policy returns `'fail'`:
     - Task transitions to `failed`
     - Task cancels all other work items (without calling policy)
     - Workflow's `fail()` method is called
     - Propagation continues upward

2. **Workflow Failure**:
   - All active tasks are canceled (without calling their policies)
   - All enabled tasks are disabled
   - Task cancellation cascades to work items (without calling policies)
   - Workflow transitions to `failed` state
   - If workflow has parent composite task:
     - CompositeTask.workflowStateChanged() is called
     - CompositeTask's **policy is called** to decide what to do
     - **Default policy** (automatic, built-in): Returns `'fail'` immediately
     - If policy returns `'fail'`, propagation continues to parent workflow

3. **Composite Task Failure**:
   - Sub-workflow's failure calls composite task's policy
   - If policy returns `'fail'`:
     - Composite task transitions to `failed`
     - Parent workflow's `fail()` is called
     - Cycle continues upward through the workflow hierarchy

**Example flow:**

```
User calls failWorkItem() → WorkItem.fail()
  ↓
  onFailed activity runs
  ↓
  Task.workItemStateChanged() → Task.policy() called
  ↓
  Default policy returns 'fail'
  ↓
  Task.fail() → Task transitions to 'failed'
  ↓
  Task.afterFail() → Cancels all other work items (policy NOT called)
  ↓
  Workflow.fail() is called
  ↓
  Workflow cancels/disables all active/enabled tasks (policies NOT called)
  ↓
  Workflow transitions to 'failed'
  ↓
  onFailed activity runs
  ↓
  If workflow has parent composite task:
    CompositeTask.workflowStateChanged() → CompositeTask.policy() called
    ↓
    Default policy returns 'fail'
    ↓
    CompositeTask.fail() → Composite task transitions to 'failed'
    ↓
    Parent Workflow.fail() is called
    ↓
    Cycle continues upward through workflow hierarchy
```

**State tracking:**

When a work item fails and default policies execute:

- **Originating work item**: `failed` ✓
- **Sibling work items** (same task): `canceled` ✓
- **Originating task**: `failed` ✓
- **Originating workflow**: `failed` ✓
- **Sibling tasks** (same workflow): `canceled` or `disabled` ✓
- **Their work items/workflows**: `canceled` ✓
- **Parent composite task** (if exists): `failed` or based on policy ✓
- **Continues upward** through the hierarchy ✓

**Why this design?**

- **Fail-fast by default**: Failures immediately escalate to prevent cascading issues
- **Correct state tracking**: Failed entities are marked as `failed`, canceled cleanup is marked as `canceled`
- **Policy control**: You can override default teardown behavior for graceful degradation
- **Business exceptions vs code exceptions**: Workflow failures represent business-level exceptions (e.g., approval rejected, validation failed), NOT code-level exceptions
  - Code exceptions are handled by Convex transaction rollback
  - Business exceptions persist in the database for audit and recovery

**Important distinction:**

```typescript
// ✓ Business exception - tracked in workflow state
await workItem.fail({ reason: 'Approval rejected by manager' })
// → Work item state: 'failed'
// → Task policy decides what to do (default: fail task)
// → Workflow eventually fails (default: fail workflow)
// → All states persist in database

// ✓ Code exception - rolls back entire transaction
throw new Error('Database connection lost')
// → Entire Convex mutation is rolled back
// → No state changes persist
// → Convex handles retries automatically
```

### Lateral Cleanup and Upward Propagation

The default failure behavior in Tasquencer is "fail-fast." When a task fails, the system assumes the entire workflow is in an invalid state and initiates a shutdown of that process level. This process involves two distinct actions: **upward propagation** of the `failed` state and **lateral cleanup** via `canceled` states.

#### The Domino Effect of a Task Failure

When a task (the "originating task") enters the `failed` state (typically because its policy returned `'fail'`), the following cascade is triggered:

1.  **Signal Parent Workflow:** The originating task immediately notifies its parent `Workflow` that a failure has occurred.
2.  **Parent Workflow Begins to Fail:** The parent `Workflow` starts its own failure transition.
3.  **Initiate Lateral Cleanup:** The workflow's first action is to stop all other ongoing work. It identifies all **sibling tasks** (other tasks at the same level that are currently `enabled` or `started`).
4.  **Siblings are CANCELED:** The workflow calls `cancel()` on all sibling tasks.
    *   **This is a critical distinction:** Sibling tasks are transitioned to `canceled`, not `failed`. They did not fail themselves; they are being stopped as a consequence of the originating failure.
    *   Their `onCanceled` activities will run, providing a hook for their specific cleanup logic. Their `onFailed` activities will *not* run.
5.  **Parent Workflow Fails:** Once all lateral cleanup is complete, the `Workflow` itself transitions to the `failed` state.
6.  **Execute Workflow `onFailed`:** The `Workflow`'s own `onFailed` activity is now executed. This is the highest-level hook for handling the failure at this process level.
7.  **Continue Propagation:** If this `Workflow` is a child of a `CompositeTask`, the cycle continues upward: the `CompositeTask` is notified, its policy runs, and so on.

#### Summary of States During Propagation

| Element | State Transition | Key Actions / Notes |
| :--- | :--- | :--- |
| **Originating `WorkItem`** | `started` -> `failed` | Its `onFailed` activity runs. Parent task policy is invoked. |
| **Originating `Task`** | `started` -> `failed` | Its `onFailed` activity runs. Signals parent workflow to fail. |
| **Sibling `Tasks`** | `started` -> `canceled` | Their `onCanceled` activities run. They are cleaned up, not failed. |
| **Parent `Workflow`** | `started` -> `failed` | Its `onFailed` activity runs. The entire process level is now failed. |

This behavior ensures that you can place specific compensation logic in the correct activity hooks: `onFailed` for the element that caused the failure, and `onCanceled` for the elements that were cleaned up as a result.

### Preventing Failure Propagation with Policies

**Key insight: Policies provide full control to stop failure propagation at any level.**

While the default behavior is fail-fast (failures propagate upward through the entire hierarchy), you can override this at any level using custom policies:

**Pattern: Graceful degradation**

```typescript
// Task policy that prevents failure propagation
const resilientTask = Builder.task(reviewWorkItem).withPolicy(async (ctx) => {
  if (ctx.transition.nextState === 'failed') {
    // Log the failure for monitoring
    console.log('Work item failed, but continuing task execution')

    // Return 'continue' instead of 'fail' - stops propagation!
    return 'continue'
  }

  // Default behavior for other states
  const stats = await ctx.task.getStats()
  const allFinalized =
    stats.completed + stats.failed + stats.canceled === stats.total

  if (ctx.transition.nextState === 'completed') {
    return allFinalized ? 'complete' : 'continue'
  }

  if (ctx.transition.nextState === 'canceled') {
    return allFinalized ? 'complete' : 'continue'
  }

  return 'continue'
})
```

**What happens when policy returns 'continue' on failure:**

```
Work item fails → WorkItem.fail()
  ↓
  onFailed activity runs (cleanup, logging)
  ↓
  Task.workItemStateChanged() → Task.policy() called
  ↓
  Policy returns 'continue' ← STOPS PROPAGATION HERE
  ↓
  Task stays in 'started' state (does NOT fail)
  ↓
  Other work items continue executing normally
  ↓
  Workflow stays in 'started' state (does NOT fail)
  ↓
  When all work items finalize → Task completes normally
```

**Real-world use cases:**

1. **Retry logic**: Let some work items fail, retry or spawn new ones

   ```typescript
   .withPolicy(async (ctx) => {
     if (ctx.transition.nextState === 'failed') {
       const stats = await ctx.task.getStats()
       if (stats.failed < 3) {
         // Less than 3 failures, keep trying
         return 'continue'
       }
       // Too many failures, give up
       return 'fail'
     }
     // ... other states
   })
   ```

2. **Optional tasks**: Some failures are acceptable

   ```typescript
   .withPolicy(async (ctx) => {
     if (ctx.transition.nextState === 'failed') {
       const stats = await ctx.task.getStats()
       // Complete if at least one work item succeeded
       if (stats.completed > 0) {
         return 'complete'
       }
       return 'continue'
     }
     // ... other states
   })
   ```

3. **Multi-level stopping**: Prevent failure at composite task level
   ```typescript
   const resilientCompositeTask = Builder.compositeTask(subWorkflow).withPolicy(
     async (ctx) => {
       if (ctx.transition.nextState === 'failed') {
         // Sub-workflow failed, but don't fail parent
         console.log('Sub-workflow failed, marking as complete')
         return 'complete' // or 'continue' to wait for other sub-workflows
       }
       // ... other states
     },
   )
   ```

**Key rules:**

- ✅ Policies are called at EVERY level (task → composite task → parent composite task, etc.)
- ✅ ANY policy can return `'continue'` or `'complete'` to stop propagation
- ✅ Failure only propagates if policy returns `'fail'`
- ✅ You can have different policies at different levels (e.g., fail fast for critical tasks, graceful degradation for optional tasks)
- ⚠️ Policies are NOT called during workflow cancellation (bypass for clean shutdown)
- ⚠️ Policies are NOT called for non-originating tasks when workflow fails (they're canceled for cleanup)

**Complete example: Selective failure propagation**

```typescript
const workflow = Builder.workflow('selectiveFailure')
  .startCondition('start')
  .task(
    'critical',
    Builder.task(criticalWorkItem),
    // Default policy - fail immediately on any work item failure
  )
  .task(
    'optional',
    Builder.task(optionalWorkItem).withPolicy(async (ctx) => {
      if (ctx.transition.nextState === 'failed') {
        // Optional task - don't propagate failures
        return 'continue'
      }
      const stats = await ctx.task.getStats()
      const allFinalized =
        stats.completed + stats.failed + stats.canceled === stats.total
      return allFinalized ? 'complete' : 'continue'
    }),
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('critical').task('optional'))
  .connectTask('critical', (to) => to.condition('end'))
  .connectTask('optional', (to) => to.condition('end'))
```

In this example:

- If `critical` task's work item fails → Task fails → Workflow fails → `optional` task canceled
- If `optional` task's work item fails → Policy returns `'continue'` → Task continues → Workflow continues
- This gives you fine-grained control over which failures are fatal vs recoverable

### YAWL-Extended Petri Net Semantics

Tasquencer is based on **YAWL (Yet Another Workflow Language)**, which extends Petri nets for real-world workflows:

**Petri Net Foundation:**

- **Conditions** = Places (hold tokens)
- **Tasks** = Transitions (consume/produce tokens)
- **Enabling**: A task is enabled when its input conditions have tokens AND its join is satisfied
- **Firing**: Enabled tasks can start, consuming input tokens and producing output tokens

**YAWL Extensions (not in pure Petri nets):**

- **Split types** (AND/XOR/OR) on tasks control how output tokens are produced
- **Join types** (AND/XOR/OR) on tasks control how input tokens are consumed
- Pure Petri nets don't have these task-level routing behaviors

**Join Type Semantics:**

| Join Type | Firing Condition | Use Case |
|-----------|-----------------|----------|
| **AND-join** | Waits for **ALL** input branches | Static parallel paths that all must complete |
| **XOR-join** | Fires when **ANY** single input arrives | Exclusive choice - first branch wins |
| **OR-join** | Waits for **ALL** dynamically-selected branches | Dynamic parallel paths (synchronized merge join) |

**Critical: OR-join is NOT "fire on any branch"** - that's XOR-join behavior. OR-join is a **synchronized merge join** that waits for all branches that were dynamically fired. Think of it as "Dynamic AND-join":
- OR-split: Dynamically select which branches to fire (1 or more)
- OR-join: Wait for ALL selected branches to complete (synchronized)

The "OR" in OR-join refers to the dynamic selection at the split, not to the join semantics (which are synchronization/merge).

```
[c1: 1 token] ──→ [Task A] ──→ [c2: 0 tokens]
                    enabled         disabled
                  (with join/split)
```

**Bipartite Graph Structure:**

YAWL is a **bipartite graph**, meaning the workflow alternates between conditions and tasks:

- ✅ **Conditions → Tasks**: Direct connections allowed
- ✅ **Tasks → Conditions**: Direct connections allowed
- ✅ **Tasks → Tasks**: Allowed, but **implicitly creates a condition** between them
- ❌ **Conditions → Conditions**: **Not allowed** (would violate bipartite structure)

```typescript
// Valid: condition → task
.connectCondition('start', (to) => to.task('A'))

// Valid: task → condition
.connectTask('A', (to) => to.condition('end'))

// Valid: task → task (implicit condition created automatically)
.connectTask('A', (to) => to.task('B'))
// Internally becomes: A → [implicit_condition] → B
// The implicit condition is named automatically: 'A__to__B'

// Invalid: condition → condition (compiler error)
.connectCondition('c1', (to) => to.condition('c2')) // ❌ No such method!
```

**Important: Implicit conditions are internal implementation details.**

- Implicit conditions exist in the database (`tasquencerConditions` table) for engine operation
- They do NOT appear in `getWorkflowTaskStates()` - only tasks are exposed to your code
- You cannot reference implicit conditions in your code
- Naming like `'A__to__B'` is for internal debugging only
- Think of them as "invisible routing nodes" that just make the bipartite graph work

**Why bipartite?**

- Ensures clean separation between state (conditions) and actions (tasks)
- Prevents ambiguous token flows
- Maintains Petri net semantics
- Makes workflow analysis tractable (OR-join, deadlock detection, etc.)

### When to Use Explicit Conditions

**Critical insight: Explicit conditions are rarely needed. Prefer task-to-task connections.**

In the vast majority of cases (~95% based on test coverage), you should connect tasks directly to tasks, which automatically creates implicit conditions. Explicit conditions are only needed for specific advanced patterns.

**Required explicit conditions:**

- ✅ **`startCondition()`** - Every workflow MUST have exactly one start condition
- ✅ **`endCondition()`** - Every workflow MUST have exactly one end condition

**When explicit conditions ARE needed (rare cases):**

- ✅ **Deferred choice pattern** - When multiple tasks need to be enabled simultaneously and compete for the same token
- ✅ **Complex OR-join scenarios** - When you need fine-grained control over OR-join cancellation regions
- ✅ **Multiple paths converging** - When many tasks need to merge to a single point before continuing
- ✅ **Explicit synchronization points** - When you want to name and reference a specific synchronization point

**When explicit conditions are NOT needed (majority of cases):**

- ❌ Simple sequential flows - Use task-to-task connections
- ❌ AND/XOR/OR splits - Tasks handle splits automatically
- ❌ Most routing decisions - Use task splits with routing functions
- ❌ Simple branching - Connect tasks directly

**Example: Prefer implicit conditions**

```typescript
// ❌ VERBOSE: Using explicit conditions everywhere
const workflow = Builder.workflow('verbose')
  .startCondition('start')
  .task('validate', validateTask)
  .condition('afterValidate')
  .task('process', processTask)
  .condition('afterProcess')
  .task('complete', completeTask)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('validate'))
  .connectTask('validate', (to) => to.condition('afterValidate'))
  .connectCondition('afterValidate', (to) => to.task('process'))
  .connectTask('process', (to) => to.condition('afterProcess'))
  .connectCondition('afterProcess', (to) => to.task('complete'))
  .connectTask('complete', (to) => to.condition('end'))

// ✅ CLEAN: Using implicit conditions
const workflow = Builder.workflow('clean')
  .startCondition('start')
  .task('validate', validateTask)
  .task('process', processTask)
  .task('complete', completeTask)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('validate'))
  .connectTask('validate', (to) => to.task('process'))
  .connectTask('process', (to) => to.task('complete'))
  .connectTask('complete', (to) => to.condition('end'))
// Implicit conditions created: 'validate__to__process', 'process__to__complete'
```

**Example: When explicit conditions ARE needed - Deferred choice**

```typescript
// Deferred choice: Two tasks compete for the same token
// Both tasks are enabled, but starting one disables the other
const workflow = Builder.workflow('deferredChoice')
  .startCondition('start')
  .task('optionA', taskA)
  .task('optionB', taskB)
  .condition('merge') // ✅ Explicit condition needed for merge point
  .endCondition('end')
  .connectCondition('start', (to) => to.task('optionA').task('optionB')) // AND split from start
  .connectTask('optionA', (to) => to.condition('merge'))
  .connectTask('optionB', (to) => to.condition('merge'))
  .connectCondition('merge', (to) => to.task('complete'))
  .connectTask('complete', (to) => to.condition('end'))
```

**Key insight from the test suite:**

- Most workflow patterns use only start/end conditions
- Complex patterns rarely need more than 1-2 explicit intermediate conditions
- Simple workflows (the majority of use cases) use only start/end conditions

**Key takeaway:** Start simple with task-to-task connections. Only add explicit conditions when you encounter a specific pattern that requires them (like deferred choice). The system will guide you through type errors if an explicit condition is actually needed.

---
