# Work Item Patterns

> **Prerequisites**: [Workflow Basics](./WORKFLOWS_BASIC.md), [Domain Modeling](./DOMAIN_MODELING.md)
> **Related**: [Authorization](./AUTHORIZATION.md) | [Actions vs Activities](./ACTIONS_ACTIVITIES.md)

This guide covers advanced work item patterns including metadata initialization, shared helper functions, work queues, and assignment strategies.

## Table of Contents

- [Choosing Action Types](#choosing-action-types)
- [Work Item Metadata](#work-item-metadata)
- [Shared Helper Functions](#shared-helper-functions)
- [Assignment Strategies](#assignment-strategies)
- [Work Queues](#work-queues)
- [Dynamic Work Item Initialization](#dynamic-work-item-initialization)
- [Best Practices](#best-practices)

---

## Choosing Action Types

Before implementing work item patterns, understand when to use default vs custom actions:

### Default Actions (Internal Only)

Use when work items are ONLY triggered by activities:

- System notifications
- Auto-triggered cleanup tasks
- Background processing
- Scheduled operations

**Pattern:**

```typescript
const systemWorkItem = Builder.workItem('systemTask').withActivities({
  onInitialized: async ({ workItem }) => {
    // Activities automatically set isInternalMutation=true
    workItem.start({})
  },
  onStarted: async ({ mutationCtx, workItem }) => {
    await processSystem(mutationCtx)
    workItem.complete({})
  },
})
// No .withActions() = default actions (internal only)
```

**Characteristics:**

- Cannot be called from external API
- Automatically enforce `isInternalMutation=true`
- Perfect for system-only work items
- No custom authentication needed

### Custom Actions (User-Facing)

Use when users interact with work items:

- Claimable tasks
- Manual approvals
- User data entry
- Work queues

**Pattern:**

```typescript
// Define a policy that requires a specific scope
const taskWritePolicy = authService.policies.requireScope('task:write')

// Use authService.builders.workItemActions for policy-based authorization
const taskWorkItemActions = authService.builders.workItemActions
  .initialize(
    z.object({ taskId: zid('tasks') }),
    taskWritePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const workItemId = await workItem.initialize()
      await initializeTaskWorkItemMetadata(mutationCtx, workItemId, {
        scope: 'task:write',
        taskId: payload.taskId,
        payload: { type: 'userTask', taskName: 'User Task' },
      })
    },
  )
  .start(z.never(), taskWritePolicy, async ({ mutationCtx, workItem }) => {
    // Helper handles auth, claim, and start
    await startAndClaimWorkItem(mutationCtx, workItem)
  })
  .complete(
    z.object({ result: z.string() }),
    taskWritePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      await recordTaskResult(mutationCtx, workItem.id, payload.result)
    },
  )

export const userWorkItem = Builder.workItem('userTask')
  .withActions(taskWorkItemActions.build())
  .withActivities({
    onCanceled: async ({ mutationCtx, workItem }) => {
      await cleanupWorkItemMetadata(mutationCtx, workItem.id)
    },
  })
```

**Characteristics:**

- Can be called from external API (users)
- Policy-based authorization via `authService.builders.workItemActions`
- Each action specifies a schema, policy, and handler
- Policies handle authentication automatically
- Perfect for user-facing work items

**Important**: Helper functions (like `startAndClaimWorkItem`) are for **custom actions only**. Default actions don't need helpers because they're internal-only.

See [Authorization → Authentication Architecture](./AUTHORIZATION.md#authentication-architecture) for detailed patterns.

---

## Work Item Metadata

### Overview

Work item metadata provides authorization, assignment, and work item-specific data storage. Tasquencer uses a **metadata factory pattern** with one table per aggregate root (not per workflow).

**Key features:**

- **Assignment**: Role/group assigned to the work item
- **Typed Payload**: Discriminated union for work item-specific data
- **Aggregate Link**: Direct connection to aggregate root instance
- **Factory-Generated Helpers**: Type-safe API for all metadata operations
- **Shared Table**: One table serves root workflow + all sub-workflows

### Architecture: One Table Per Aggregate Root

```
Aggregate Root (tasks)
    ↓
Metadata Table (taskWorkItems)  ← Serves ALL task workflow work items
    ↓
Work Items from:
  - Root workflow (taskProcessing)
  - Sub-workflow 1 (detailedAnalysis)
  - Sub-workflow 2 (qualityReview)
  - All other task workflows
```

### Step 1: Define Metadata Table Schema

Create the metadata table definition in your schema file using `defineWorkItemMetadataTable()`:

```typescript
// convex/workflows/taskManagement/schema.ts
import { defineWorkItemMetadataTable } from '@repo/tasquencer'

const taskWorkItems = defineWorkItemMetadataTable('tasks').withPayload(
  v.union(
    // Root workflow work items
    v.object({
      type: v.literal('reviewTask'),
      taskName: v.string(),
      priority: v.union(
        v.literal('low'),
        v.literal('medium'),
        v.literal('high'),
      ),
    }),
    v.object({
      type: v.literal('specialistApproval'),
      taskName: v.string(),
      priority: v.union(
        v.literal('low'),
        v.literal('medium'),
        v.literal('high'),
      ),
      specialty: v.union(v.literal('technical'), v.literal('compliance')),
    }),
    // Sub-workflow work items
    v.object({
      type: v.literal('performAnalysis'),
      taskName: v.string(),
      priority: v.union(
        v.literal('low'),
        v.literal('medium'),
        v.literal('high'),
      ),
    }),
    v.object({
      type: v.literal('dailyCheck'),
      taskName: v.string(),
      priority: v.union(
        v.literal('low'),
        v.literal('medium'),
        v.literal('high'),
      ),
    }),
  ),
)
```

Then export it with the rest of the task workflow tables and merge it into the root schema:

```typescript
// convex/workflows/taskManagement/schema.ts
export default {
  tasks,
  taskResults,
  taskWorkItems,
}

// convex/schema.ts
import taskTables from './workflows/taskManagement/schema'

export default defineSchema({
  ...taskTables,
  // ...other workflow tables
})
```

**Standard fields automatically included:**

- `workItemId: Id<'tasquencerWorkItems'>`
- `workflowName: string`
- `offer: { type: 'human'; requiredScope?: string; requiredGroupId?: string } | { type: 'agent' }`
- `claim?: { type: 'human'; userId?: string; at: number } | { type: 'agent', at: number }`
- `aggregateTableId: Id<'tasks'>` (typed to your aggregate!)
- `payload: { type: '...', ... }` (your discriminated union)

### Step 2: Generate Type-Safe Helpers

Create factory-generated helpers for your metadata table:

```typescript
// convex/workflows/taskManagement/helpers.ts
import { Authorization } from '../tasquencer'
import type { MutationCtx } from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'

export const TaskWorkItemHelpers =
  Authorization.workItemMetadataHelpersForTable('taskWorkItems')

// Helper surface (from Authorization.workItemMetadataHelpersForTable):
// - claimWorkItem(ctx, workItemId, userId)
// - claimWorkItemAsAgent(db, workItemId)
// - releaseWorkItem(db, workItemId)
// - getWorkItemMetadata(db, workItemId)
// - canUserClaimWorkItem(ctx, userId, workItemId)
// - getAvailableWorkItemsForUser(ctx, userId)
// - getAvailableAgentWorkItems(db)
// - getAvailableWorkItemsByWorkflow(ctx, userId, workflowName)
// - getClaimedWorkItemsByUser(db, userId)

// Insert metadata rows via a workflow-specific wrapper.
export async function initializeTaskWorkItemMetadata(
  mutationCtx: MutationCtx,
  metadata: Omit<Doc<'taskWorkItems'>, '_id'>,
) {
  await mutationCtx.db.insert('taskWorkItems', metadata)
}
```

### Step 3: Use Helpers in Work Items

Initialize metadata in the work item's `initialize` action using your workflow-specific wrapper:

```typescript
// convex/workflows/taskManagement/workItems/reviewTask.workItem.ts
import {
  TaskWorkItemHelpers,
  initializeTaskWorkItemMetadata,
} from '../helpers'
import { getRoleByName, getGroupByName } from '../../../authorization'
import { TASK_ROLES, TASK_GROUPS } from '../authorization'

const reviewTaskWorkItem = Builder.workItem('reviewTask').withActions(
  Builder.workItemActions().initialize(
    z.object({
      taskId: zid('tasks'),
      priority: z.enum(['low', 'medium', 'high']),
    }),
    async ({ mutationCtx, workItem }, payload) => {
      // 1. Initialize work item first
      const workItemId = await workItem.initialize()

      // 2. Get scope and group
      const scope = 'task:review:write'
      const groupId = await getGroupByName(mutationCtx, TASK_GROUPS.REVIEW_TEAM)

      // 3. Initialize metadata with typed payload
      await initializeTaskWorkItemMetadata(mutationCtx, {
        workItemId,
        workflowName: 'taskProcessing',
        offer: {
          type: 'human',
          requiredScope: scope,
          requiredGroupId: groupId,
        },
        aggregateTableId: payload.taskId, // Links to task
        payload: {
          type: 'reviewTask', // Discriminator
          taskName: 'Review Task',
          priority: payload.priority, // Type-safe!
        },
      })
    },
  ),
)

// Task passes data to work item
const triageTask = Builder.task(triagePatientWorkItem).withActivities({
  onEnabled: async ({ mutationCtx, workItem, parent }) => {
    const patient = await PatientDomain.getByWorkflowId(
      mutationCtx,
      parent.workflow.id,
    )

    // Work item handles its own metadata initialization
    await workItem.initialize({
      patientId: patient._id,
      severity: patient.severity === 'critical' ? 'critical' : 'urgent',
    })
  },
})
```

**Benefits:**

- ✅ Work item is self-contained (owns its metadata)
- ✅ Full TypeScript type safety from schema to runtime
- ✅ No manual field mapping or boilerplate
- ✅ Same helpers work for root + sub-workflow work items
- ✅ Typed payload replaces separate tables

### Type-Specific Payload Fields

The discriminated union allows different work item types to have their own fields:

```typescript
import { initializeErWorkItemAuth } from '../workItems/helpersAuth'

// Policy for specialist consultations
const specialistPolicy = authService.policies.requireScope('er:specialist:consult')

const specialistConsultActions = authService.builders.workItemActions
  .initialize(
    z.object({
      patientId: zid('erPatients'),
      specialty: z.enum(['cardiologist', 'neurologist']),
    }),
    specialistPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const workItemId = await workItem.initialize()

      // Use scope strings for authorization
      const scope =
        payload.specialty === 'cardiologist'
          ? 'er:specialist:cardiology'
          : 'er:specialist:neurology'

      await initializeErWorkItemAuth(mutationCtx, workItemId, {
        scope,
        patientId: payload.patientId,
        payload: {
          type: 'specialistConsult',
          taskName: `Specialist Consultation (${payload.specialty})`,
          priority: 'urgent',
          specialty: payload.specialty, // Type-specific field!
        },
      })
    },
  )

const specialistConsultWorkItem = Builder.workItem('specialistConsult')
  .withActions(specialistConsultActions.build())
```

**TypeScript inference**: The `payload` field is fully typed based on the `type` discriminator, providing autocomplete and compile-time safety.

---

## Shared Helper Functions

### Why Helper Functions?

Real-world workflows often have repetitive patterns:

- Authenticate user → claim work item → start work item
- Initialize work item → initialize metadata
- Query domain context → initialize work item

**Solution**: Extract these patterns into shared helper functions.

### Pattern 1: Start + Claim Helper

**Problem**: Every work item `start` action needs to:

1. Authenticate the user
2. Claim the work item
3. Start the work item

**Solution**: Create a shared helper:

```typescript
// convex/workflows/myWorkflow/workItems/helpers.ts

import { authComponent } from '../../../auth'
import { assertAuthenticatedUser } from '../exceptions'
import { TaskWorkItemHelpers } from '../helpers'
import { ConstraintViolationError } from '@repo/tasquencer'

export async function startAndClaimWorkItem(
  mutationCtx: MutationCtx,
  workItem: { id: Id<'tasquencerWorkItems'>; start: () => Promise<void> },
): Promise<void> {
  // 1. Authenticate
  const authUser = await authComponent.safeGetAuthUser(mutationCtx)
  assertAuthenticatedUser(authUser, {
    operation: 'startAndClaimWorkItem',
    workItemId: workItem.id,
  })

  // 2. Claim (note: claimWorkItem takes full ctx, not ctx.db)
  const userId = authUser.userId as Id<'users'>
  try {
    await TaskWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
  } catch (error) {
    throw new ConstraintViolationError('WORK_ITEM_CLAIM_FAILED', {
      workItemId: workItem.id,
      reason: error instanceof Error ? error.message : String(error),
    })
  }

  // 3. Start (runs in same transaction - rolls back if claim fails)
  await workItem.start()
}
```

**Usage in work items:**

```typescript
const triageWorkItem = Builder.workItem()
  .initialize(
    z.object({ patientId: z.string() }),
    async ({ mutationCtx }, payload) => {
      return { patientId: payload.patientId as Id<'patients'> }
    },
  )
  .start(async ({ mutationCtx, workItem }) => {
    // One line!
    await startAndClaimWorkItem(mutationCtx, workItem)
  })
  .complete(
    z.object({ triageLevel: z.string() }),
    async ({ mutationCtx, workItem }, payload) => {
      // Update domain state
      await TriageDomain.recordTriageResult(mutationCtx, workItem.id, payload)
    },
  )
```

**Benefits:**

- Single line of code in work item actions
- Consistent authentication + claiming across all work items
- Easy to test helper function in isolation
- Changes to auth/claim logic only need to happen in one place

### Pattern 2: Workflow-Specific Helper Wrapper

While the factory-generated helpers provide all the necessary functionality, you can create thin wrapper functions for common initialization patterns:

```typescript
// convex/workflows/er/workItems/helpersAuth.ts
import type { MutationCtx } from '../../../_generated/server'
import type { Id, Doc } from '../../../_generated/dataModel'

export async function initializeErWorkItemAuth(
  mutationCtx: MutationCtx,
  workItemId: Id<'tasquencerWorkItems'>,
  config: {
    scope: string
    groupId?: string  // Optional group restriction
    patientId: Id<'erPatients'>
    payload: Doc<'erWorkItems'>['payload'] // Fully typed!
  },
): Promise<Id<'erWorkItems'>> {
  return await mutationCtx.db.insert('erWorkItems', {
    workItemId,
    workflowName: 'erPatientJourney', // Baked in for convenience
    offer: {
      type: 'human' as const,
      requiredScope: config.scope,
      ...(config.groupId !== undefined && { requiredGroupId: config.groupId }),
    },
    aggregateTableId: config.patientId,
    payload: config.payload, // Type-safe discriminated union
  })
}
```

**Usage:**

```typescript
// Policy for triage operations
const triagePolicy = authService.policies.requireScope('er:triage:write')

const triageActions = authService.builders.workItemActions
  .initialize(
    z.object({
      patientId: zid('erPatients'),
      severity: z.enum(['routine', 'urgent', 'critical']),
    }),
    triagePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const workItemId = await workItem.initialize()

      // Wrapper reduces boilerplate
      await initializeErWorkItemAuth(mutationCtx, workItemId, {
        scope: 'er:triage:write',
        patientId: payload.patientId,
        payload: {
          type: 'triagePatient',
          taskName: 'Triage Patient',
          priority: payload.severity,
        },
      })
    },
  )

const triageWorkItem = Builder.workItem('triage')
  .withActions(triageActions.build())
```

**When to use wrappers:**

- To bake in `workflowName` for convenience
- To simplify role/group ID resolution
- To add workflow-specific validation
- **Don't** use wrappers to hide the factory helpers - they should complement, not replace

### Pattern 3: Parameterized Work Items with Helpers

**Problem**: Multiple tasks need the same work item type with different metadata.

**Solution**: Use a parameterized work item + metadata helper:

```typescript
// Shared policy for specialist consultations
const specialistPolicy = authService.policies.requireScope('er:specialist:consult')

// Single work item definition with policy-based actions
const specialistConsultActions = authService.builders.workItemActions
  .initialize(
    z.object({
      patientId: zid('erPatients'),
      specialistType: z.enum(['cardiology', 'neurology']),
    }),
    specialistPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const workItemId = await workItem.initialize()
      // Metadata initialized by task's onEnabled (see below)
      return workItemId
    },
  )
  .start(z.never(), specialistPolicy, async ({ mutationCtx, workItem }) => {
    await startAndClaimWorkItem(mutationCtx, workItem)
  })
  .complete(
    z.object({ consultationNotes: z.string() }),
    specialistPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      await ConsultDomain.recordConsultation(mutationCtx, workItem.id, payload)
    },
  )

const specialistConsultWorkItem = Builder.workItem('specialistConsult')
  .withActions(specialistConsultActions.build())

// Multiple tasks, different scopes
const cardiologyConsultTask = Builder.task(
  specialistConsultWorkItem,
).withActivities({
  onEnabled: async ({ mutationCtx, workItem, parent }) => {
    const patient = await getPatientByWorkflowId(
      mutationCtx.db,
      parent.workflow.id,
    )

    const workItemId = await workItem.initialize({
      patientId: patient._id,
      specialistType: 'cardiology',
    })

    // Different scope, same helper
    await initializeErWorkItemAuth(mutationCtx, workItemId, {
      scope: 'er:specialist:cardiology',
      patientId: patient._id,
      payload: {
        type: 'specialistConsult',
        taskName: 'Cardiology Consultation',
        priority: 'urgent',
        specialty: 'cardiologist',
      },
    })
  },
})

const neurologyConsultTask = Builder.task(
  specialistConsultWorkItem,
).withActivities({
  onEnabled: async ({ mutationCtx, workItem, parent }) => {
    const patient = await getPatientByWorkflowId(
      mutationCtx.db,
      parent.workflow.id,
    )

    const workItemId = await workItem.initialize({
      patientId: patient._id,
      specialistType: 'neurology',
    })

    // Different scope, same helper
    await initializeErWorkItemAuth(mutationCtx, workItemId, {
      scope: 'er:specialist:neurology',
      patientId: patient._id,
      payload: {
        type: 'specialistConsult',
        taskName: 'Neurology Consultation',
        priority: 'urgent',
        specialty: 'neurologist',
      },
    })
  },
})
```

**Benefits:**

- Single work item definition for multiple task instances
- Metadata determines routing (role/group)
- Less code duplication
- Easier to maintain

---

## Assignment Strategies

Use the `offer` field when inserting metadata to control who can claim the work. Your workflow-specific helper (see examples above) should bake in the workflow name and aggregate linkage so individual tasks only provide the differences.

### Strategy 1: Scope-Based

Offer jobs to anyone with a specific scope. Priority, task names, and other attributes live in the typed payload.

```typescript
await initializeErWorkItemAuth(mutationCtx, workItemId, {
  scope: 'er:triage:write',
  patientId: payload.patientId,
  payload: {
    type: 'triagePatient',
    taskName: 'Triage Patient',
    priority: 'urgent',
  },
})
```

### Strategy 2: Scope + Group

Restrict by scope **and** group when a scope spans multiple teams.

```typescript
await initializeErWorkItemAuth(mutationCtx, workItemId, {
  scope: 'er:specialist:consult',
  groupId: cardiologyGroupId,  // Only cardiology team can claim
  patientId: payload.patientId,
  payload: {
    type: 'specialistConsult',
    taskName: 'Cardiology Consultation',
    priority: 'urgent',
    specialty: 'cardiologist',
  },
})
```

### Strategy 3: Agent vs Human

Switch the offer to `{ type: 'agent' }` for AI/automation tasks so human queues never see them.

```typescript
await mutationCtx.db.insert('myWorkItems', {
  workItemId,
  workflowName: 'myWorkflow',
  offer: { type: 'agent' },
  aggregateTableId: payload.documentId,
  payload: {
    type: 'aiDraft',
    taskName: 'Draft Response',
  },
})
```

### Strategy 4: Preferred Assignee

Store hints (like `preferredAssigneeId`) in the payload so your UI can highlight who should pick it up. Authorization still flows through `offer`, so other role holders can fill in.

---

## Work Queues

Work queues should always start from the factory helpers. They already enforce role/group authorization. Query for the current user, then filter/enrich as needed.

### Basic Queue

```typescript
export const getMyWorkQueue = query({
  handler: async (ctx) => {
    const authUser = await authComponent.safeGetAuthUser(ctx)
    if (!authUser) return []

    const userId = authUser.userId as Id<'users'>
    // Note: getAvailableWorkItemsForUser takes full ctx (not ctx.db)
    const candidates = await TaskWorkItemHelpers.getAvailableWorkItemsForUser(
      ctx,
      userId,
    )

    const workItems = candidates.filter(
      ({ metadata }) => metadata.workflowName === 'myWorkflow',
    )

    return await Promise.all(
      workItems.map(async ({ metadata, workItem }) => {
        const aggregate = await ctx.db.get(metadata.aggregateTableId)
        return { metadata, workItem, aggregate }
      }),
    )
  },
})
```

### Priority / Payload Filtering

```typescript
const urgentItems = workItems.filter(
  ({ metadata }) =>
    metadata.payload.type === 'triage' &&
    metadata.payload.priority === 'urgent',
)
```

### Claimed vs Claimed-by-Me

- **Unclaimed** queues fall out of `getAvailableWorkItemsForUser` (it only returns enabled + unclaimed items).
- For "My claimed work", call `TaskWorkItemHelpers.getClaimedWorkItemsByUser(ctx.db, userId)`.

### Supervisor / Group Queues

For supervisor views, filter available work items by group membership:

```typescript
// Get all available work items and filter by group
const allItems = await TaskWorkItemHelpers.getAvailableWorkItemsForUser(ctx, userId)
const nursingItems = allItems.filter(
  ({ metadata }) =>
    metadata.offer.type === 'human' &&
    metadata.offer.requiredGroupId === nursingGroupId,
)
```

### Multi-Workflow Dashboards

Combine per-workflow helpers and sort by payload/priority:

```typescript
// Note: getAvailableWorkItemsForUser takes full ctx (not ctx.db)
const erItems = await ErWorkItemHelpers.getAvailableWorkItemsForUser(ctx, userId)
const documentItems = await DocumentWorkItemHelpers.getAvailableWorkItemsForUser(
  ctx,
  userId,
)

// Results from getAvailableWorkItemsForUser are already unclaimed
const all = [...erItems, ...documentItems]
  .sort((a, b) => b.metadata._creationTime - a.metadata._creationTime)
```

## Dynamic Work Item Initialization

### Pattern: Initialize Multiple Work Items

Sometimes you need to initialize multiple work items dynamically based on domain state:

```typescript
const processOrderTask = Builder.task(processOrderItemWorkItem).withActivities({
  onEnabled: async ({ mutationCtx, workItem, parent }) => {
    const order = await getOrderByWorkflowId(mutationCtx.db, parent.workflow.id)

    // Get order items from domain
    const orderItems = await getOrderItems(mutationCtx.db, order._id)

    // Initialize one work item per order item
    for (const item of orderItems) {
      const workItemId = await workItem.initialize({
        orderId: order._id,
        itemId: item._id,
      })

      await initializeOrderWorkItemAuth(mutationCtx, workItemId, {
        scope: 'warehouse:process',
        orderId: order._id,
        payload: {
          type: 'processOrderItem',
          taskName: 'Process Order Item',
          priority: 'routine',
          orderItemId: item._id,
        },
      })
    }
  },
})
```

**Task completion policy:**

```typescript
const processOrderTask = Builder.task(processOrderItemWorkItem)
  .withActivities({
    /* ... */
  })
  .withPolicy(async ({ task: { getStats }, transition }) => {
    const stats = await getStats()

    // Task completes when all work items are completed
    if (stats.completed === stats.total) {
      return 'complete'
    }

    // Keep running
    return 'continue'
  })
```

### Pattern: Dynamic Initialization Based on Results

Initialize additional work items based on previous work item results:

```typescript
const diagnosticsTask = Builder.task(diagnosticTestWorkItem)
  .withActivities({
    onEnabled: async ({ mutationCtx, workItem, parent }) => {
      const patient = await getPatientByWorkflowId(
        mutationCtx.db,
        parent.workflow.id,
      )

      // Initialize initial diagnostic tests
      for (const test of ['bloodWork', 'xray']) {
        const workItemId = await workItem.initialize({
          patientId: patient._id,
          testType: test,
        })

        await initializeErWorkItemAuth(mutationCtx, workItemId, {
          scope: 'er:diagnostics:lab',
          patientId: patient._id,
          payload: {
            type: 'diagnosticTest',
            taskName: `Run ${test}`,
            priority: 'urgent',
          },
        })
      }
    },

    onWorkItemStateChanged: async ({ mutationCtx, workItem, task }) => {
      // When a work item completes, check if we need follow-up tests
      if (workItem.nextState === 'completed') {
        const result = await getDiagnosticResult(mutationCtx, workItem.id)

        if (result.requiresFollowUp) {
          // Dynamically initialize follow-up test
          const followUpWorkItemId = await task.getWorkItem().initialize({
            patientId: result.patientId,
            testType: result.followUpTestType,
          })

          await initializeErWorkItemAuth(mutationCtx, followUpWorkItemId, {
            scope: 'er:diagnostics:lab',
            patientId: result.patientId,
            payload: {
              type: 'diagnosticTest',
              taskName: `Follow-up ${result.followUpTestType}`,
              priority: 'urgent',
            },
          })
        }
      }
    },
  })
  .withPolicy(async ({ task: { getStats }, transition }) => {
    const stats = await getStats()

    // Only complete when all work items are completed
    // (including dynamically initialized ones)
    if (stats.completed === stats.total && stats.total > 0) {
      return 'complete'
    }

    return 'continue'
  })
```

---

## Best Practices

### 1. Always Initialize Metadata

```typescript
// ✅ Good: Metadata initialized
const myTask = Builder.task(myWorkItem).withActivities({
  onEnabled: async ({ mutationCtx, workItem }) => {
    const workItemId = await workItem.initialize()
    await initializeMetadata(mutationCtx, workItemId, {
      /* ... */
    })
  },
})

// ❌ Bad: No metadata (work item won't appear in queues)
const myTask = Builder.task(myWorkItem).withActivities({
  onEnabled: async ({ workItem }) => {
    await workItem.initialize()
  },
})
```

### 2. Use Helper Functions

```typescript
// ✅ Good: Shared helper
await startAndClaimWorkItem(mutationCtx, workItem)

// ❌ Bad: Copy-paste auth + claim logic in each work item
const authUser = await authComponent.safeGetAuthUser(mutationCtx)
assertAuthenticatedUser(authUser, { /* ... */ })
await TaskWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, authUser.userId as Id<'users'>)
await workItem.start()
```

### 3. Type-Safe Scope Constants

```typescript
// ✅ Good: Type-safe scope constant
const ER_SCOPES = {
  TRIAGE_WRITE: 'er:triage:write',
  DIAGNOSTICS_LAB: 'er:diagnostics:lab',
} as const

await initializeErWorkItemAuth(mutationCtx, workItemId, {
  scope: ER_SCOPES.TRIAGE_WRITE, // Autocomplete!
  patientId: patient._id,
  payload: { type: 'triagePatient', taskName: 'Triage', priority: 'urgent' },
})

// ❌ Bad: String literal (typo-prone)
await initializeErWorkItemAuth(mutationCtx, workItemId, {
  scope: 'er:triage:writ', // Typo!
  patientId: patient._id,
  payload: { type: 'triagePatient', taskName: 'Triage', priority: 'urgent' },
})
```

### 4. Link to Aggregates

```typescript
// ✅ Good: aggregateTableId links to domain entity
await initializeDocumentWorkItemAuth(mutationCtx, workItemId, {
  scope: 'document:review:write',
  documentId: document._id,  // Links to aggregate
  payload: { type: 'review', taskName: 'Review Document', priority: 'routine' },
})

// ❌ Bad: No aggregate link (hard to join in queries)
await mutationCtx.db.insert('documentWorkItems', {
  workItemId,
  workflowName: 'documentReview',
  offer: { type: 'human', requiredScope: 'document:review:write' },
  aggregateTableId: undefined as never, // ??
  payload: { type: 'review', taskName: 'Review Document', priority: 'routine' },
})
```

### 5. Enrich Work Queues

```typescript
// ✅ Good: Enrich helper results with domain data
const items = await TaskWorkItemHelpers.getAvailableWorkItemsForUser(ctx, userId)
return await Promise.all(
  items.map(async ({ metadata, workItem }) => ({
    metadata,
    workItem,
    document: await ctx.db.get(metadata.aggregateTableId),
  })),
)

// ❌ Bad: Return raw helper results (UI has no domain context)
return await TaskWorkItemHelpers.getAvailableWorkItemsForUser(ctx, userId)
```

### 6. Handle Empty Queues

```typescript
// ✅ Good: Handle unauthenticated users
const authUser = await authComponent.safeGetAuthUser(ctx)
if (!authUser) return []

// ❌ Bad: Throws error for unauthenticated
const authUser = await authComponent.getAuthUser(ctx)
```

### 7. Sort Queues Meaningfully

```typescript
// ✅ Good: Sort by priority + timestamp
const sortedItems = workItems.sort((a, b) => {
  const priorityOrder = { critical: 0, urgent: 1, routine: 2 }
  const aPriority = priorityOrder[a.priority] ?? 2
  const bPriority = priorityOrder[b.priority] ?? 2

  if (aPriority !== bPriority) {
    return aPriority - bPriority
  }

  return b._creationTime - a._creationTime
})

// ❌ Bad: Random order
return workItems
```

---

## Real-World Example: ER Workflow

See the ER workflow implementation for complete examples:

- **Work Item Helpers**: `examples/er/convex/workflows/er/workItems/helpers.ts`
  - `startAndClaimWorkItem()` - Authenticate, claim, and start
  - `initializeWorkItemWithPatient()` - Fetch patient and initialize work item
  - `transitionPatientStatusForWorkItem()` - Status transitions with rollback support
  - `cleanupErWorkItemOnCancel()` - Cleanup on cancellation/failure
- **Auth Helpers**: `examples/er/convex/workflows/er/workItems/helpersAuth.ts`
  - `initializeErWorkItemAuth()` - Initialize metadata with scope
  - `initializeWorkItemWithPatientAuth()` - Combined patient fetch + auth init
- **Main Helpers**: `examples/er/convex/workflows/er/helpers.ts`
  - `ErWorkItemHelpers` - Factory-generated authorization helpers
- **Work Queues**: `examples/er/convex/workflows/er/api/workItems.ts`
  - `getMyAvailableTasks` - Available work items for current user
  - `getMyClaimedTasks` - Work items claimed by current user
  - `getAllAvailableTasks` - Admin view of all work items
  - `getTasksByPatient` - Work items for a specific patient
- **Parameterized work item**: `examples/er/convex/workflows/er/workItems/specialistConsult.workItem.ts`
- **Multiple tasks using same work item**: Cardiology and Neurology consult tasks

---

## Next Steps

- [Authorization](./AUTHORIZATION.md) - RBAC, roles, and groups
- [Domain Modeling](./DOMAIN_MODELING.md) - Domain functions and aggregate roots
- [Recipes](./RECIPES.md) - Complete examples and patterns
