# Workflow Versioning

Tasquencer provides a comprehensive versioning system that allows multiple versions of the same workflow to coexist in your application. This is essential for production systems where workflows may run for extended periods (days, weeks, or longer) and need to complete on their original schema even as you deploy breaking changes.

## Table of Contents

- [Why Versioning?](#why-versioning)
- [Core Concepts](#core-concepts)
- [Quick Start](#quick-start)
- [Registering Multiple Versions](#registering-multiple-versions)
- [Version-Specific APIs](#version-specific-apis)
- [When You Need Migrations](#when-you-need-migrations)
- [Migration System](#migration-system)
- [Migration Deployment Strategies](#migration-deployment-strategies)
- [Version Isolation](#version-isolation)
- [Querying Versioned Data](#querying-versioned-data)
- [Best Practices](#best-practices)
- [Advanced Patterns](#advanced-patterns)

## Why Versioning?

In traditional workflow systems, deploying schema changes or workflow logic updates can break running workflows. Consider these scenarios:

### Scenario 1: Long-Running Workflows
You have an employee onboarding workflow that runs for 30 days. On day 15, you need to:
- Add a new required field to the workflow payload
- Change the logic in one of the work items
- Modify task dependencies

Without versioning, workflows started before the deployment would fail or behave unexpectedly.

### Scenario 2: Schema Evolution
Your RFP workflow initially had:
```typescript
const rfpPayload = z.object({
  title: z.string(),
  budget: z.number(),
})
```

You need to change it to:
```typescript
const rfpPayload = z.object({
  title: z.string(),
  budget: z.object({
    amount: z.number(),
    currency: z.string(),
  }),
})
```

Running workflows expect the old schema - this breaking change would cause failures.

### Scenario 3: A/B Testing
You want to test a new approval workflow structure with 10% of users while keeping the existing workflow for 90%, then gradually roll out the new version based on results.

**The Tasquencer versioning system solves all of these problems.**

## Core Concepts

### Version Manager
The `VersionManager` is the central orchestrator for workflow versions. It:
- Registers multiple versions of a workflow under a single workflow name
- Tracks deprecated versions
- Defines migrations between workflow versions
- Provides type-safe, version-specific APIs
- Ensures complete isolation between versions

### Version Name
Each version is identified by a string version name (e.g., `'v1'`, `'v2'`, `'2024-11-01'`, `'stable'`, `'experimental'`). This name:
- Is stored with every workflow instance, task, work item, and condition in the database
- Determines which workflow definition is used for execution
- Enables version-specific queries and analytics

### Version Isolation
Every database record includes a `versionName` field:
- Workflow instances know which version they belong to
- Tasks, work items, and conditions inherit the version from their parent workflow
- Stats, audit logs, and time-travel snapshots are version-specific
- Versions are completely isolated - a v1 workflow will always execute using v1 logic

### Version Independence

**Important**: Each workflow version is completely independent. When you register v1 and v2 of a workflow:

- A v2 workflow started fresh has **zero relationship** to any v1 workflow
- v2's structure does not reference, depend on, or inherit from v1's structure
- Starting a v2 workflow simply uses the v2 definition you registered - it knows nothing about v1
- v1 and v2 can have completely different tasks, conditions, and control flows

**The only time v1 and v2 interact is during an explicit migration** - and even then, the relationship is one of data transfer, not structural inheritance. See [Migration System](#migration-system) for details.

## Quick Start

Here's how to set up a versioned workflow:

### Step 1: Define Your Workflow

```typescript
// convex/workflows/vendorOnboarding/workflow.ts
import { Builder, authService } from '../../tasquencer'
import { backgroundCheckTask, onboardingTask } from './tasks'

export const vendorOnboardingWorkflow = Builder.workflow('vendorOnboarding')
  .withActions(vendorOnboardingActions)
  .startCondition('start')
  .task('backgroundCheck', backgroundCheckTask)
  .task('onboarding', onboardingTask)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('backgroundCheck'))
  .connectTask('backgroundCheck', (to) => to.task('onboarding'))
  .connectTask('onboarding', (to) => to.condition('end'))
```

### Step 2: Create a Version Manager

```typescript
// convex/workflows/vendorOnboarding/definition.ts
import { versionManagerFor } from '../../tasquencer'
import { vendorOnboardingWorkflow } from './workflow'

export const vendorOnboardingVersionManager = versionManagerFor('vendorOnboarding')
  .registerVersion('v1', vendorOnboardingWorkflow)
  .build()
```

### Step 3: Export Version-Specific APIs

```typescript
// convex/workflows/vendorOnboarding/api/workflow.ts
import { vendorOnboardingVersionManager } from '../definition'

export const {
  initializeRootWorkflow,
  cancelRootWorkflow,
  initializeWorkflow,
  cancelWorkflow,
  initializeWorkItem,
  startWorkItem,
  completeWorkItem,
  resetWorkItem,
  failWorkItem,
  cancelWorkItem,
  helpers: {
    getWorkflowTaskStates,
    getWorkflowStructure,
    getWorkflowState,
    getWorkItemState,
  },
} = vendorOnboardingVersionManager.apiForVersion('v1')
```

### Step 4: Use the API

```typescript
// From your Convex mutations/actions
import { initializeRootWorkflow } from './workflows/vendorOnboarding/api/workflow'

export const startOnboarding = mutation({
  handler: async (ctx, args) => {
    const workflowId = await initializeRootWorkflow(ctx, {
      vendorName: args.vendorName,
      category: args.category,
    })
    return workflowId
  },
})
```

## Registering Multiple Versions

You can register multiple versions of the same workflow:

```typescript
// convex/workflows/vendorOnboarding/definition.ts
import { versionManagerFor } from '../../tasquencer'
import { vendorOnboardingWorkflowV1 } from './workflow.v1'
import { vendorOnboardingWorkflowV2 } from './workflow.v2'

export const vendorOnboardingVersionManager = versionManagerFor('vendorOnboarding')
  .registerVersion('v1', vendorOnboardingWorkflowV1)
  .registerVersion('v2', vendorOnboardingWorkflowV2)
  .build()
```

Each version can have:
- Different workflow structure (tasks, conditions, flows)
- Different payload schemas
- Different work item implementations
- Different business logic

## Version-Specific APIs

Each version gets its own fully type-safe API:

```typescript
// Export APIs for both versions
export const v1Api = vendorOnboardingVersionManager.apiForVersion('v1')
export const v2Api = vendorOnboardingVersionManager.apiForVersion('v2')

// v1 expects old schema
const workflowIdV1 = await v1Api.initializeRootWorkflow(ctx, {
  vendorName: "ACME Corp",
  budget: 50000,
})

// v2 expects new schema
const workflowIdV2 = await v2Api.initializeRootWorkflow(ctx, {
  vendorName: "ACME Corp",
  budget: {
    amount: 50000,
    currency: "USD",
  },
})
```

TypeScript ensures you can't pass the wrong payload to the wrong version.

## When You Need Migrations

**Migrations are required only when workflow STRUCTURE changes.** Understanding when you need migrations vs when you don't is crucial:

### You NEED Migrations When:

- **Adding or removing tasks** from a workflow
- **Changing control flow** (task connections, splits, joins)
- **Modifying task types** (e.g., changing a task from regular to composite)
- **Restructuring the workflow** (changing the task graph)

### You DON'T Need Migrations When:

- **Changing work item payload schemas** - Handle with compatibility layers or transforms
- **Updating activity logic** - Activities are callbacks, not workflow structure
- **Modifying domain model** - Domain data lives outside workflows
- **Changing business rules** - As long as the workflow structure stays the same

**Example:**

```typescript
// v1: Simple two-step process
const workflowV1 = Builder.workflow('orderFulfillment')
  .startCondition('start')
  .task('validateOrder', validateOrderTask)
  .task('shipOrder', shipOrderTask)
  .endCondition('end')
  .connectCondition('start', to => to.task('validateOrder'))
  .connectTask('validateOrder', to => to.task('shipOrder'))
  .connectTask('shipOrder', to => to.condition('end'))

// v2: Added quality check task - NEEDS MIGRATION
const workflowV2 = Builder.workflow('orderFulfillment')
  .startCondition('start')
  .task('validateOrder', validateOrderTask)
  .task('qualityCheck', qualityCheckTask) // NEW TASK
  .task('shipOrder', shipOrderTask)
  .endCondition('end')
  .connectCondition('start', to => to.task('validateOrder'))
  .connectTask('validateOrder', to => to.task('qualityCheck')) // NEW CONNECTION
  .connectTask('qualityCheck', to => to.task('shipOrder'))     // NEW CONNECTION
  .connectTask('shipOrder', to => to.condition('end'))
```

In this case, v2 adds a new task to the workflow structure, so you need a migration to handle workflows transitioning from v1 to v2.

## Migration System

Tasquencer provides a built-in migration system that allows you to define how workflows should transition between versions when the workflow structure changes.

### How Migration Actually Works

> **Key Insight**: Migration does NOT "continue" a v1 workflow in v2's structure. Instead:
>
> 1. The **v1 workflow is canceled** (with reason: "migration")
> 2. A **brand new v2 workflow is created** from scratch
> 3. The v2 workflow starts from its **start condition** (the beginning)
> 4. The v2 workflow runs in **fast-forward mode**, processing through its own structure
> 5. Task migrators determine whether each v2 task should:
>    - `fastForward` - auto-complete without running activities (for work already done in v1)
>    - `continue` - execute normally (for pending work)
>
> This means the v2 workflow uses **v2's structure entirely**. The v1 structure is only consulted through your task migrators to determine what work was already completed.

### Defining Migrations

Migrations are defined using the `migrate()` builder and registered with the version manager:

```typescript
import { migrate, MigrationMode } from '../../tasquencer'
import { workflowV1 } from './workflow.v1'
import { workflowV2 } from './workflow.v2'

// Define migration from v1 to v2
const migrationV1ToV2 = migrate(workflowV1, workflowV2)
  .withInitializer(async ({ registerScheduled, workflow }) => {
    // Optional: enqueue work that should run once for each migrated workflow.
    await registerScheduled(
      mutationCtx.scheduler.runAfter(
        0,
        internal.notifications.sendAuditEmail,
        { workflowId: workflow.id },
      ),
    )
  })
  .withTaskMigrators({
    // Task path: 'workflowName/taskName'
    'orderFulfillment/validateOrder': async (props) => {
      // This handler is called when validateOrder needs to transition
      // Return the migration mode for this task
      return MigrationMode.continue
    },
    'orderFulfillment/qualityCheck': async (props) => {
      // Handler for the new quality check task
      return MigrationMode.continue
    },
  })
  .build()

// Register migration with version manager
export const versionManager = versionManagerFor('orderFulfillment')
  .registerVersion('v1', workflowV1)
  .registerVersion('v2', workflowV2)
  .withMigration('v1->v2', migrationV1ToV2) // Migration name format: 'fromVersion->toVersion'
  .build()
```

### Migration Builder API

`migrate(fromBuilder, toBuilder)` returns a fluent `MigrationInit` instance:

```ts
const migration = migrate(fromWorkflowBuilder, toWorkflowBuilder)
  .withInitializer(optionalInitializer)
  .withFinalizer(optionalFinalizer)
  .withTaskMigrators({
    'workflowName/taskName': taskMigrator,
    // ...
  })
  .build()
```

You can call `withInitializer`, `withFinalizer`, or `withTaskMigrators` in any order (or omit any of them) before finishing with `.build()`. Each call returns a new immutable builder so migrations stay type-safe.

### Migration Naming Convention

Migration names follow the format `'fromVersion->toVersion'`:
- `'v1->v2'` - Migration from v1 to v2
- `'v2->v3'` - Migration from v2 to v3
- `'stable->beta'` - Migration from stable to beta

The TypeScript type system ensures you use valid version pairs based on your registered versions.

### Task Path Format

Task paths in migration handlers use the format `'workflowName/taskName'`:
- `'orderFulfillment/validateOrder'`
- `'vendorOnboarding/backgroundCheck'`
- `'rfpProcess/reviewProposal'`

For nested workflows (composite tasks), paths include the full hierarchy:
- `'parentWorkflowName/compositeTask/childWorkflow/taskName'`

### Migration Modes

When a migration runs, the new v2 workflow processes through its structure from the start condition. As each task becomes enabled, its migrator is called:

```
v1 Workflow (CANCELED)          v2 Workflow (CREATED NEW)
┌─────────────────────┐         ┌─────────────────────────────────────┐
│ start → A → B → end │         │ start → A → B → C → end             │
│         ↓   ↓       │         │         ↓   ↓   ↓                   │
│      [done][done]   │         │       [ff] [ff] [continue]          │
└─────────────────────┘         └─────────────────────────────────────┘
                                         │
                                Task migrators check domain data
                                to decide: fastForward or continue?
```

Migration handlers return a `MigrationMode` that determines how the task executes:

#### `MigrationMode.continue`

The task enters its normal lifecycle and executes normally:
- Activities (`afterStart`, `afterComplete`) are invoked
- Work items or child workflows are created if needed
- Task runs through its complete lifecycle

**Use when:** The task should execute normally during migration.

```typescript
'orderFulfillment/validateOrder': async (props) => {
  // Task will run normally, executing all activities
  return MigrationMode.continue
}
```

#### `MigrationMode.fastForward`

The task is marked complete without executing activities:
- `afterStart` and `afterComplete` activities are **skipped**
- State transitions happen immediately
- Task completes without running business logic

**Use when:** You can determine from domain data that this task's work is already done, and you want to skip re-execution.

```typescript
'orderFulfillment/shipOrder': async (props) => {
  // Check domain data to see if order is already shipped
  const order = await props.mutationCtx.db.get(props.workItem.orderId)

  if (order.status === 'shipped') {
    // Skip task execution - work is already done
    return MigrationMode.fastForward
  }

  // Otherwise run normally
  return MigrationMode.continue
}
```

**Key Difference:**
- `continue` = Full task execution with activities
- `fastForward` = Skip to completion without activities

#### Fast-Forward Execution Invariants

- **All normal invariants still apply.** Tasks in fast-forward mode must obey the same state rules as production runs—completed parents never spawn new children, downstream tokens only flow after the owning task actually completes, etc.
- **`fastForward` is the only way to auto-complete.** When a migrator returns `MigrationMode.fastForward`, the runtime automatically drives the task through `enabled → started → completed` without firing activities or creating children.
- **`continue` means "you must finish the work."** Returning `MigrationMode.continue` keeps the task in its normal active state. Your migrator can initialize child workflows or work items, but it is responsible for completing (or failing) that work so the task eventually reaches a final state and produces its outgoing tokens. You can detect that a task/work item/workflow activity or action is running as part of a migration replay by checking the `executionMode` prop in activity callbacks:

```typescript
onEnabled: async ({ workItem, executionMode }) => {
  if (executionMode === 'fastForward') {
    // Skip duplicate initialization during migration replay
    return
  }
  await workItem.initialize()
}
```
- **Child initialization requires active parents.** Because invariants hold, attempting to initialize a child workflow/work item while the parent task is already in a final state will throw—migrators must leave the parent active until new work is done.

### Migration Handler Signatures

Migration handlers receive different props depending on the task type:

#### Type Signatures

```ts
type MigrationInitializer = (props: {
  mutationCtx: MutationCtx
  isInternalMutation: boolean
  migratingFromWorkflow: WorkflowInfo
  registerScheduled: RegisterScheduled
  workflow: WorkflowInfo
  audit: AuditCallbackInfo
}) => Promise<void>

type MigrationFinalizer = (props: {
  mutationCtx: MutationCtx
  isInternalMutation: boolean
  migratingFromWorkflow: WorkflowInfo
  workflow: WorkflowInfo
  result: { state: WorkflowState }
  registerScheduled: RegisterScheduled
  audit: AuditCallbackInfo
}) => Promise<void>

type TaskOnMigrate<TWorkItemPayload> = (props: {
  mutationCtx: MutationCtx
  isInternalMutation: boolean
  migratingFromWorkflow: WorkflowInfo
  parent: { workflow: WorkflowInfo }
  task: TaskInfo
  workItem: {
    initialize: ShouldBeOptional<TWorkItemPayload> extends true
      ? (payload?: unknown) => Promise<Id<'tasquencerWorkItems'>>
      : (payload: TWorkItemPayload) => Promise<Id<'tasquencerWorkItems'>>
  }
  registerScheduled: RegisterScheduled
  audit: AuditCallbackInfo
}) => Promise<TaskMigrationMode>

type CompositeTaskOnMigrate<TWorkflowPayload> = (props: {
  mutationCtx: MutationCtx
  isInternalMutation: boolean
  migratingFromWorkflow: WorkflowInfo
  parent: { workflow: WorkflowInfo }
  task: TaskInfo
  workflow: {
    initialize: ShouldBeOptional<TWorkflowPayload> extends true
      ? (payload?: unknown) => Promise<Id<'tasquencerWorkflows'>>
      : (payload: TWorkflowPayload) => Promise<Id<'tasquencerWorkflows'>>
  }
  registerScheduled: RegisterScheduled
  audit: AuditCallbackInfo
}) => Promise<TaskMigrationMode>

type DynamicCompositeTaskOnMigrate<TWorkflowPayloads extends { name: string; payload?: unknown }> = (props: {
  mutationCtx: MutationCtx
  isInternalMutation: boolean
  migratingFromWorkflow: WorkflowInfo
  parent: { workflow: WorkflowInfo }
  task: TaskInfo
  workflow: {
    initialize: {
      [K in TWorkflowPayloads['name']]: (payload?: TWorkflowPayloads['payload']) => Promise<Id<'tasquencerWorkflows'>>
    }
  }
  registerScheduled: RegisterScheduled
  audit: AuditCallbackInfo
}) => Promise<TaskMigrationMode>
```

- `WorkflowInfo` = `{ id: Id<'tasquencerWorkflows'>; name: string }`
- `TaskInfo` = `{ name: string; generation: number; path: string[] }`
- `RegisterScheduled` stores scheduler jobs that should be canceled if the parent element fails.

#### Migration Initializers

Initializers give you a hook right after the new workflow instance is created in fast-forward mode. Use them to seed metadata tables, kick off follow-up jobs, or snapshot audit data. Because you receive `registerScheduled`, any scheduled jobs are automatically canceled if the migration later fails.

#### Migration Finalizers

Finalizers run after the migrated workflow completes (in fast-forward mode). Use them to clean up resources, send notifications, or perform post-migration auditing:

```ts
const migration = migrate(workflowV1, workflowV2)
  .withFinalizer(
    async ({
      mutationCtx,
      migratingFromWorkflow,
      workflow,
      result,
      audit,
    }) => {
      await audit.log('workflow.migration.completed', {
        from: migratingFromWorkflow.id,
        to: workflow.id,
        finalState: result.state,
      })

      // Clean up old workflow data if migration succeeded
      if (result.state === 'completed') {
        await cleanupOldWorkflowData(mutationCtx, migratingFromWorkflow.id)
      }
    },
  )
  .build()
```

```ts
const migration = migrate(workflowV1, workflowV2)
  .withInitializer(
    async ({
      mutationCtx,
      registerScheduled,
      migratingFromWorkflow,
      workflow,
      audit,
    }) => {
      await audit.log('workflow.migrated', {
        from: migratingFromWorkflow.id,
        to: workflow.id,
      })

      await registerScheduled(
        mutationCtx.scheduler.runAfter(
          0,
          internal.notifications.sendMigrationDigest,
          { workflowId: workflow.id },
        ),
      )
    },
  )
  .withTaskMigrators(/* ... */)
  .build()
```

#### `TaskOnMigrate` (work items)

Use task migrators when a task controls a work item. The callback receives:

- `mutationCtx` / `isInternalMutation` for domain access
- `migratingFromWorkflow` describing the canceled source workflow
- `parent.workflow` describing the newly created workflow
- `task` metadata (name, generation, realized path)
- `workItem.initialize(payload?)` to lazily create new work items
- `registerScheduled` to enqueue follow-up jobs tied to the task
- `audit` helpers for traceability

```typescript
'orderFulfillment/validateOrder': async (props) => {
  // Access domain data
  const order = await props.mutationCtx.db
    .query('orders')
    .filter((q) => q.eq(q.field('workflowId'), props.migratingFromWorkflow.id))
    .first()

  // Optionally initialize work item
  if (needsWorkItem) {
    await props.workItem.initialize({ orderId: order!._id })
  }

  // Add audit trail
  await props.audit.log('Migration validated order')

  return MigrationMode.continue
}
```

#### `CompositeTaskOnMigrate` (child workflows)

Composite task migrators have the same shape, but the `workflow.initialize` helper replaces `workItem.initialize`. Use it to spin up child workflows at the correct generation and maintain the parent/child relationship.

```typescript
'fulfillment/qualityControl': async (props) => {
  // Initialize child workflow if needed
  const childWorkflowId = await props.workflow.initialize({
    inspectionType: 'standard',
    priority: 'high',
  })

  await props.audit.log(
    `Initialized quality control workflow: ${childWorkflowId}`,
  )

  return MigrationMode.continue
}
```

### Deprecated Versions

You can mark versions as deprecated when registering them:

```typescript
export const versionManager = versionManagerFor('orderFulfillment')
  .registerVersion('v1', workflowV1)
  .registerVersion('v2', workflowV2)
  .registerVersion('v3', workflowV3)
  .withMigration('v1->v2', migrationV1ToV2)
  .withMigration('v2->v3', migrationV2ToV3)
  .build({
    deprecatedVersions: ['v1', 'v2']  // Mark v1 and v2 as deprecated
  })
```

Attempting to initialize a workflow with a deprecated version will throw a `WorkflowDeprecatedError`.

### Complete Migration Example

The following example demonstrates migrating from v1 (two tasks) to v2 (three tasks). Remember:
- The v1 workflow will be **canceled**
- A new v2 workflow will be **created and started from the beginning**
- Task migrators determine whether each v2 task should fast-forward (skip) or continue (execute)

Here's a complete example:

```typescript
// Define work items with authorization
const orderPolicy = authService.policies.requireScope('order:process:write')

const validateOrderActions = authService.builders.workItemActions
  .initialize(z.object({ orderId: zid('orders') }), orderPolicy, async ({ workItem, mutationCtx }, payload) => {
    const workItemId = await workItem.initialize()
    await initializeOrderWorkItemAuth(mutationCtx, workItemId, { scope: 'order:validate:write', orderId: payload.orderId })
  })
  .start(z.never(), orderPolicy, async ({ workItem }) => { await workItem.start() })
  .complete(z.object({ approved: z.boolean() }), orderPolicy, async ({ workItem }) => { await workItem.complete() })
  .build()

const validateOrderWorkItem = Builder.workItem('validateOrder').withActions(validateOrderActions)
const validateOrderTask = Builder.task(validateOrderWorkItem).withActivities({
  onEnabled: async ({ workItem, parent, mutationCtx }) => {
    const order = await getOrderByWorkflowId(mutationCtx.db, parent.workflow.id)
    await workItem.initialize({ orderId: order._id })
  }
})

// Similar definitions for shipOrderTask and qualityCheckTask...
const shipOrderTask = Builder.task(shipOrderWorkItem).withActivities({ /* ... */ })
const qualityCheckTask = Builder.task(qualityCheckWorkItem).withActivities({ /* ... */ })

// v1: Original workflow
const workflowV1 = Builder.workflow('orderFulfillment')
  .withActions(orderFulfillmentActions)
  .startCondition('start')
  .task('validateOrder', validateOrderTask)
  .task('shipOrder', shipOrderTask)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('validateOrder'))
  .connectTask('validateOrder', (to) => to.task('shipOrder'))
  .connectTask('shipOrder', (to) => to.condition('end'))

// v2: Added quality check task
const workflowV2 = Builder.workflow('orderFulfillment')
  .withActions(orderFulfillmentActions)
  .startCondition('start')
  .task('validateOrder', validateOrderTask)
  .task('qualityCheck', qualityCheckTask)  // NEW TASK
  .task('shipOrder', shipOrderTask)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('validateOrder'))
  .connectTask('validateOrder', (to) => to.task('qualityCheck'))  // NEW CONNECTION
  .connectTask('qualityCheck', (to) => to.task('shipOrder'))      // NEW CONNECTION
  .connectTask('shipOrder', (to) => to.condition('end'))

// Define migration
const migrationV1ToV2 = migrate(workflowV1, workflowV2)
  .withInitializer(async ({ audit, workflow, migratingFromWorkflow }) => {
    await audit.log('workflow.migrated', {
      from: migratingFromWorkflow.id,
      to: workflow.id,
    })
  })
  .withTaskMigrators({
    'orderFulfillment/validateOrder': async () => {
      // Task runs normally during migration
      return MigrationMode.continue
    },
    'orderFulfillment/qualityCheck': async (props) => {
      // New task - check if quality check is needed based on domain data
      const order = await props.mutationCtx.db
        .query('orders')
        .filter((q) => q.eq(q.field('workflowId'), props.migratingFromWorkflow.id))
        .first()

      if (order?.qualityCheckCompleted) {
        return MigrationMode.fastForward // Skip if already done
      }
      return MigrationMode.continue
    },
    'orderFulfillment/shipOrder': async (props) => {
      // Check if shipping is already done
      const order = await props.mutationCtx.db.get(props.task.orderId)
      if (order?.status === 'shipped') {
        return MigrationMode.fastForward
      }
      return MigrationMode.continue
    },
  })
  .build()

// Register everything
export const versionManager = versionManagerFor('orderFulfillment')
  .registerVersion('v1', workflowV1)
  .registerVersion('v2', workflowV2)
  .withMigration('v1->v2', migrationV1ToV2)
  .build({ deprecatedVersions: ['v1'] })
```

## Migration Deployment Strategies

### Blue-Green Deployment

Deploy a new version while keeping the old version running:

```typescript
// Before deployment - only stable exists
export const versionManager = versionManagerFor('orderFulfillment')
  .registerVersion('stable', stableWorkflow)
  .build()

// During deployment - add new version alongside stable
export const versionManager = versionManagerFor('orderFulfillment')
  .registerVersion('stable', stableWorkflow)
  .registerVersion('next', nextWorkflow)
  .withMigration('stable->next', stableToNextMigration)
  .build()

// After validation - mark stable as deprecated
export const versionManager = versionManagerFor('orderFulfillment')
  .registerVersion('stable', stableWorkflow)
  .registerVersion('next', nextWorkflow)
  .withMigration('stable->next', stableToNextMigration)
  .build({ deprecatedVersions: ['stable'] })

// Later - remove old version once all stable workflows complete
export const versionManager = versionManagerFor('orderFulfillment')
  .registerVersion('next', nextWorkflow)
  .build()
```

### Gradual Rollout

Route different customers or segments to different versions:

```typescript
export const v1Api = versionManager.apiForVersion('v1')
export const v2Api = versionManager.apiForVersion('v2')

export const startWorkflow = mutation({
  handler: async (ctx, args) => {
    // Gradual rollout based on customer ID
    const customerId = args.customerId
    const useV2 = (hashCode(customerId) % 100) < 20 // 20% get v2

    if (useV2) {
      return await v2Api.initializeRootWorkflow(ctx, transformPayloadForV2(args))
    } else {
      return await v1Api.initializeRootWorkflow(ctx, args)
    }
  },
})
```

### Feature Flags

Use feature flags to control version selection:

```typescript
export const startWorkflow = mutation({
  handler: async (ctx, args) => {
    const useNewVersion = await ctx.db
      .query('featureFlags')
      .withIndex('by_name', q => q.eq('name', 'vendorOnboarding_v2'))
      .first()

    if (useNewVersion?.enabled) {
      return await v2Api.initializeRootWorkflow(ctx, args)
    } else {
      return await v1Api.initializeRootWorkflow(ctx, args)
    }
  },
})
```

### Compatibility Layer

Create a compatibility layer that adapts old payloads to new schemas:

```typescript
function adaptV1toV2Payload(v1Payload: V1Payload): V2Payload {
  return {
    ...v1Payload,
    budget: {
      amount: v1Payload.budget,
      currency: 'USD', // Default for migrated workflows
    },
  }
}

export const startWorkflow = mutation({
  handler: async (ctx, args) => {
    // Always use v2, but accept both payload formats
    const v2Payload = args.budget?.currency
      ? args as V2Payload
      : adaptV1toV2Payload(args as V1Payload)

    return await v2Api.initializeRootWorkflow(ctx, v2Payload)
  },
})
```

## Version Isolation

Version isolation is enforced at the database level. Every table includes a `versionName` field:

```typescript
// Schema (automatically handled by Tasquencer)
tasquencerWorkflows: defineTable({
  name: v.string(),
  versionName: v.string(), // Version isolation
  executionMode: v.union(v.literal('normal'), v.literal('fastForward')),
  state: v.union(v.literal('initialized'), v.literal('started'), v.literal('completed'), v.literal('failed'), v.literal('canceled')),
  // ...
})

tasquencerTasks: defineTable({
  name: v.string(),
  workflowId: v.id('tasquencerWorkflows'),
  versionName: v.string(), // Inherited from workflow
  executionMode: v.union(v.literal('normal'), v.literal('fastForward')),
  state: v.union(v.literal('disabled'), v.literal('enabled'), v.literal('started'), v.literal('completed'), v.literal('failed'), v.literal('canceled')),
  generation: v.number(),
  // ...
})
```

This ensures:
- **Data Isolation**: v1 and v2 workflows are completely separate database records with no foreign key or logical relationship (unless explicitly migrated)
- **Logic Isolation**: Each workflow executes using its registered version's definition - v2 never uses v1's task graph
- **State Isolation**: Task states, conditions, and execution logs are version-specific
- **Stats Isolation**: Metrics and analytics are tracked per version
- **Migration Isolation**: Even during migration, the new v2 workflow runs entirely on v2's structure; v1's structure is only referenced by migrators to determine what work was already done

## Querying Versioned Data

When querying workflow data, always filter by version:

### Query Workflows by Version

```typescript
export const getV1Workflows = query({
  handler: async (ctx) => {
    return await ctx.db
      .query('tasquencerWorkflows')
      .filter(q =>
        q.and(
          q.eq(q.field('name'), 'vendorOnboarding'),
          q.eq(q.field('versionName'), 'v1')
        )
      )
      .collect()
  },
})
```

### Cross-Version Analytics

```typescript
export const getWorkflowStatsByVersion = query({
  handler: async (ctx) => {
    const allWorkflows = await ctx.db
      .query('tasquencerWorkflows')
      .filter(q => q.eq(q.field('name'), 'vendorOnboarding'))
      .collect()

    const statsByVersion = new Map<string, {completed: number, failed: number}>()

    for (const workflow of allWorkflows) {
      const stats = statsByVersion.get(workflow.versionName) || {completed: 0, failed: 0}
      if (workflow.state === 'completed') stats.completed++
      if (workflow.state === 'failed') stats.failed++
      statsByVersion.set(workflow.versionName, stats)
    }

    return Object.fromEntries(statsByVersion)
  },
})
```

### Migration Tracking

Track which versions have active workflows:

```typescript
export const getActiveVersions = query({
  handler: async (ctx, { workflowName }) => {
    const activeWorkflows = await ctx.db
      .query('tasquencerWorkflows')
      .filter(q =>
        q.and(
          q.eq(q.field('name'), workflowName),
          q.or(
            q.eq(q.field('state'), 'started'),
            q.eq(q.field('state'), 'initialized')
          )
        )
      )
      .collect()

    const versionsWithCount = new Map<string, number>()
    for (const workflow of activeWorkflows) {
      versionsWithCount.set(
        workflow.versionName,
        (versionsWithCount.get(workflow.versionName) || 0) + 1
      )
    }

    return Object.fromEntries(versionsWithCount)
  },
})
```

## Common Misconceptions

### Misconception 1: "v2 continues where v1 left off"

**Reality**: v2 does not continue v1. When you migrate:
- v1 is **canceled** - it stops executing entirely
- v2 is **created fresh** - it starts from its own start condition
- v2 runs through its own structure, using fast-forward mode to quickly advance past completed work

The v1 workflow's execution state is not transferred to v2. Instead, your task migrators query domain data to determine what work was already done.

### Misconception 2: "v2 inherits v1's structure during migration"

**Reality**: v2 uses only its own structure. Consider:

```typescript
// v1: A → B → end
// v2: A → B → C → end (added task C)
```

When migrating a v1 workflow that completed tasks A and B:
- v2 starts from its start condition
- v2's task A migrator returns `fastForward` (already done)
- v2's task B migrator returns `fastForward` (already done)
- v2's task C migrator returns `continue` (new task, needs execution)

The v2 workflow processes through **v2's graph**, not v1's.

### Misconception 3: "Fresh v2 workflows are somehow linked to v1"

**Reality**: Starting a fresh v2 workflow (not migrating) has zero connection to v1:
- `v2Api.initializeRootWorkflow()` creates a standalone v2 workflow
- It does not reference, check, or depend on any v1 workflow
- v1 and v2 are completely separate workflow definitions that happen to share a workflow name

## Best Practices

### 1. Use Semantic Versioning

Use clear version names that convey meaning:

```typescript
// Good
.registerVersion('v1', workflow)
.registerVersion('v2', workflow)
.registerVersion('2024-11-01', workflow) // Date-based
.registerVersion('stable', workflow)
.registerVersion('beta', workflow)

// Avoid
.registerVersion('new', workflow) // Ambiguous
.registerVersion('test', workflow) // Unclear purpose
```

### 2. Keep Old Versions Available

Don't remove old versions until all workflows have completed:

```typescript
// Check before removing a version
export const canRemoveVersion = query({
  handler: async (ctx, { workflowName, versionName }) => {
    const activeWorkflows = await ctx.db
      .query('tasquencerWorkflows')
      .filter(q =>
        q.and(
          q.eq(q.field('name'), workflowName),
          q.eq(q.field('versionName'), versionName),
          q.or(
            q.eq(q.field('state'), 'started'),
            q.eq(q.field('state'), 'initialized')
          )
        )
      )
      .first()

    return activeWorkflows === null
  },
})
```

### 3. Version Work Item Implementations

When workflow structure changes, version the work items too:

```typescript
// v1 work item with authorization
const processOrderV1Policy = authService.policies.requireScope('order:process:write')

const processOrderV1Actions = authService.builders.workItemActions
  .initialize(z.object({ orderId: zid('orders') }), processOrderV1Policy, async ({ workItem }) => {
    await workItem.initialize()
  })
  .start(z.never(), processOrderV1Policy, async ({ workItem }) => {
    await workItem.start()
  })
  .complete(z.never(), processOrderV1Policy, async ({ workItem }) => {
    await workItem.complete()
  })
  .build()

export const processOrderV1WorkItem = Builder.workItem('processOrder')
  .withActions(processOrderV1Actions)

export const processOrderV1Task = Builder.task(processOrderV1WorkItem)
  .withActivities({
    onEnabled: async ({ workItem, parent }) => {
      const order = await getOrderByWorkflowId(parent.workflow.id)
      await workItem.initialize({ orderId: order._id })
    }
  })

// v2 work item - different logic
const processOrderV2Actions = authService.builders.workItemActions
  .initialize(/* ... v2 specific logic ... */)
  .build()

export const processOrderV2WorkItem = Builder.workItem('processOrder')
  .withActions(processOrderV2Actions)

export const processOrderV2Task = Builder.task(processOrderV2WorkItem)

// Use the right version in workflows
const workflowV1 = Builder.workflow('orderFulfillment')
  .task('processOrder', processOrderV1Task)
  // ...

const workflowV2 = Builder.workflow('orderFulfillment')
  .task('processOrder', processOrderV2Task)
  // ...
```

### 4. Document Version Changes

Maintain a changelog for each version:

```typescript
// convex/workflows/vendorOnboarding/CHANGELOG.md
/*
# Version History

## v2 (2024-11-01)
- Breaking: Changed budget from number to {amount, currency} object
- Added: Multi-currency support
- Fixed: Tax calculation for international vendors
- Migration: Use adaptV1toV2Payload() helper

## v1 (2024-10-01)
- Initial release
*/
```

### 5. Test Migrations

Create tests that verify migrations work correctly:

```typescript
test('migration from v1 to v2 completes successfully', async () => {
  // Start a v1 workflow
  const workflowV1Id = await v1Api.initializeRootWorkflow(t, {
    vendorName: 'Test',
    budget: 5000,
  })

  // Migrate to v2
  const workflowV2Id = await migrateWorkflow(t, {
    fromWorkflowId: workflowV1Id,
    toVersion: 'v2',
  })

  // Complete v2 workflow
  await completeAllWorkItems(t, workflowV2Id)

  // Verify migration completed successfully
  const v2State = await v2Api.helpers.getWorkflowState(t, workflowV2Id)
  expect(v2State?.state).toBe('completed')
})

test('v1 and v2 workflows run independently', async () => {
  const workflowV1Id = await v1Api.initializeRootWorkflow(t, {
    vendorName: 'Test',
    budget: 5000,
  })

  const workflowV2Id = await v2Api.initializeRootWorkflow(t, {
    vendorName: 'Test',
    budget: { amount: 5000, currency: 'USD' },
  })

  // Complete both
  await completeAllWorkItems(t, workflowV1Id)
  await completeAllWorkItems(t, workflowV2Id)

  // Verify both completed successfully
  const v1State = await v1Api.helpers.getWorkflowState(t, workflowV1Id)
  const v2State = await v2Api.helpers.getWorkflowState(t, workflowV2Id)

  expect(v1State?.state).toBe('completed')
  expect(v2State?.state).toBe('completed')
})
```

### 6. Monitor Version Performance

Track metrics per version to compare performance:

```typescript
export const getVersionMetrics = query({
  handler: async (ctx, { workflowName, versionName }) => {
    const workflows = await ctx.db
      .query('tasquencerWorkflows')
      .filter(q =>
        q.and(
          q.eq(q.field('name'), workflowName),
          q.eq(q.field('versionName'), versionName)
        )
      )
      .collect()

    const completionTimes = workflows
      .filter(w => w.state === 'completed' && w.completedAt && w.createdAt)
      .map(w => w.completedAt! - w.createdAt!)

    return {
      totalStarted: workflows.length,
      completed: workflows.filter(w => w.state === 'completed').length,
      failed: workflows.filter(w => w.state === 'failed').length,
      avgCompletionTime: completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length,
    }
  },
})
```

## Advanced Patterns

### Dynamic Version Selection

Select versions based on complex business rules:

```typescript
async function selectWorkflowVersion(
  ctx: Context,
  customer: Customer,
  orderValue: number,
): Promise<'v1' | 'v2' | 'v3'> {
  // Premium customers get v3 (advanced features)
  if (customer.tier === 'premium') return 'v3'

  // High-value orders get v2 (enhanced processing)
  if (orderValue > 10000) return 'v2'

  // Standard orders get v1
  return 'v1'
}
```

### Version-Specific Configuration

Maintain different configurations per version:

```typescript
const versionConfigs = {
  v1: {
    approvalThreshold: 5000,
    autoApprove: false,
    requiredChecks: ['financial'],
  },
  v2: {
    approvalThreshold: 10000,
    autoApprove: true,
    requiredChecks: ['financial', 'compliance'],
  },
}

// Use in work items
export const checkApproval = defineWorkItem({
  handler: async (ctx, { versionName, orderValue }) => {
    const config = versionConfigs[versionName]

    if (config.autoApprove && orderValue < config.approvalThreshold) {
      return { approved: true, reason: 'auto-approved' }
    }

    // Trigger manual approval
    return { approved: false, requiresManualReview: true }
  },
})
```

### Conditional Version Deprecation

Gradually deprecate old versions with warnings:

```typescript
export const startWorkflow = mutation({
  handler: async (ctx, args) => {
    const requestedVersion = args.version || 'v1'

    // Warn about deprecated versions
    if (requestedVersion === 'v1') {
      console.warn('v1 is deprecated and will be removed on 2024-12-31')
    }

    // Block truly obsolete versions
    if (requestedVersion === 'v0') {
      throw new Error('v0 is no longer supported. Please use v1 or v2.')
    }

    const api = versionManager.apiForVersion(requestedVersion)
    return await api.initializeRootWorkflow(ctx, args.payload)
  },
})
```

### Version-Aware State Queries

When querying workflow state, version information is always preserved:

```typescript
export const getVersionedWorkflowState = query({
  handler: async (ctx, { workflowId }) => {
    const workflow = await ctx.db.get(workflowId)
    if (!workflow) return null

    // Get version-specific API
    const api = versionManager.apiForVersion(workflow.versionName)

    // Get workflow state and structure using helpers
    const state = await api.helpers.getWorkflowState(ctx, workflowId)
    const taskStates = await api.helpers.getWorkflowTaskStates(ctx, workflowId)
    const structure = await api.helpers.getWorkflowStructure(ctx, workflowId)

    return { state, taskStates, structure }
  },
})
```

## Summary

Tasquencer's versioning system provides:

- **Complete Isolation**: Each version runs independently with its own data and logic
- **Type Safety**: Full TypeScript support for version-specific schemas
- **Flexible Migration**: Support for gradual rollouts, A/B testing, and blue-green deployments
- **Production Ready**: Battle-tested patterns for long-running workflows
- **Future Proof**: Built-in infrastructure for automatic version routing and migration

By using versioning, you can confidently evolve your workflows over time without disrupting running instances, enabling true continuous deployment for workflow-driven applications.
