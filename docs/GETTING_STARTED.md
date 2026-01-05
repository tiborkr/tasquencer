# Getting Started with Tasquencer

> **Prerequisites**: Understanding of Convex, TypeScript, and workflow concepts
> **Related**: [Core Concepts](./CORE_CONCEPTS.md) | [Domain Modeling](./DOMAIN_MODELING.md) | [Workflow Basics](./WORKFLOWS_BASIC.md) | [Versioning](./VERSIONING.md)

This guide walks you through the development process for building Tasquencer workflows.

> **Note on Versioning**: Tasquencer supports workflow versioning, allowing multiple versions of the same workflow to coexist. This is essential for long-running workflows that need to complete on their original schema even as you deploy breaking changes. See the [Versioning Guide](./VERSIONING.md) for comprehensive details on version management, migration strategies, and best practices.

## Table of Contents

- [Development Process Requirements](#development-process-requirements)
- [Step 1: Design Your Domain Model](#step-1-design-your-domain-model)
- [Step 2: Design Workflow Schema](#step-2-design-workflow-schema)
- [Step 3: Implement Domain Functions](#step-3-implement-domain-functions)
- [Step 3.5: Test Domain Functions](#step-35-test-domain-functions)
- [Step 4: Design Work Items](#step-4-design-work-items)
- [Step 5: Design Workflow Topology](#step-5-design-workflow-topology)
- [Step 6: Generate API and Wire to Your App](#step-6-generate-api-and-wire-to-your-app)
- [Step 6.5: Write Detailed Workflow Tests](#step-65-write-detailed-workflow-tests)
- [Step 7: Run Typecheck](#step-7-run-typecheck)
- [Development Sequence Summary](#development-sequence-summary)
- [Quick Start Examples](#quick-start-examples)

---

## Getting Started: Development Approach

Building workflows with Tasquencer follows a specific sequence. **Don't start with the workflow - start with your domain.**

### Development Process Requirements

**Type safety and testing are mandatory throughout development:**

1. **Run `npm run dev:convex:once` regularly** to generate correct types
   - Run after schema changes
   - Run after adding new workflows/work items
   - Run before writing tests
   - Ensures TypeScript has latest generated API types

2. **After writing the domain layer, write tests and run them with `npm run test:once`**
   - Domain layer must be thoroughly tested
   - Test all domain functions (create, read, update, delete)
   - Test business logic and validation rules
   - Ensure test coverage before moving to workflow implementation

3. **After the workflow is implemented, workflow tests must be written**
   - Workflow tests must test the expected behavior
   - Workflow tests must be detailed:
     - Test all paths through the workflow (happy path, error paths, edge cases)
     - Test work item state transitions
     - Test task policies
     - Test control flow (AND/XOR/OR splits and joins)
     - Test cancellation and failure scenarios
   - Run `npm run test:once` to verify implementation

4. **Use `npm run typecheck` continuously to check the implementation**
   - Run typecheck after significant changes
   - **No usage of `any` is allowed**
   - **Expectation: typecheck will pass with zero errors**
   - Fix all type errors before proceeding

**Development checklist for each workflow:**

- [ ] Run `npm run dev:convex:once` after schema changes
- [ ] Write domain layer (schema, domain functions)
- [ ] Write domain layer tests
- [ ] Run `npm run test:once` and ensure all tests pass
- [ ] Implement workflow (work items, tasks, topology)
- [ ] Run `npm run dev:convex:once` to generate API types
- [ ] Write detailed workflow tests
- [ ] Run `npm run test:once` and ensure all tests pass
- [ ] Run `npm run typecheck` and ensure zero errors
- [ ] Fix any type errors (no `any` allowed)

### Step 1: Design Your Domain Model

**Start here.** Based on your business requirements, identify your domain entities and their relationships.

**Questions to ask:**

- What are the main business entities? (e.g., Order, Document, Patient, Project)
- What are the child entities? (e.g., Order Items, Document Pages, Lab Tests)
- What data needs to be tracked for each step in the process?
- Which entities represent the "aggregate root" (the main entity that owns the process)?

**Example: Order Processing**

```typescript
// Domain entities identified:
// - Order (aggregate root) - the main business entity
// - Order Item (child entity) - can have its own review/processing workflow
// - Review (work item data) - tracks individual review tasks
// - Comment (side data) - not part of workflow lifecycle
```

### Step 2: Design Workflow Schema

**IMPORTANT: Create a dedicated schema file for your workflow.**

Instead of adding tables to the central `convex/schema.ts`, create a workflow-specific schema file at `convex/workflows/{workflowName}/schema.ts`. This keeps your domain models organized and modular.

**Rules:**

1. **Aggregate root** → Add `workflowId: v.id('tasquencerWorkflows')` (required)
2. **Child entities with subworkflows** → Add `workflowId: v.optional(v.id('tasquencerWorkflows'))`
3. **Work item metadata** → Use `defineWorkItemMetadataTable()` with typed payload
4. **Side data entities** → No workflow references needed

**Example: Create Order Processing Workflow Schema**

```bash
# Create workflow directory
mkdir -p convex/workflows/orderProcessing
touch convex/workflows/orderProcessing/schema.ts
```

```typescript
// convex/workflows/orderProcessing/schema.ts
import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { defineWorkItemMetadataTable } from '@repo/tasquencer'

// Aggregate root - always has workflow
const orders = defineTable({
  title: v.string(),
  customerId: v.string(),
  status: v.string(), // domain status (e.g., 'draft', 'submitted')
  workflowId: v.id('tasquencerWorkflows'), // Required - 1:1 with workflow
})
  .index('by_workflow_id', ['workflowId'])
  .index('by_customer', ['customerId'])

// Child entity - may have subworkflow
const orderItems = defineTable({
  orderId: v.id('orders'),
  title: v.string(),
  quantity: v.number(),
  workflowId: v.optional(v.id('tasquencerWorkflows')), // Optional - for subworkflows
})
  .index('by_order', ['orderId'])
  .index('by_workflow_id', ['workflowId'])

// Work item metadata table with typed payload
const orderWorkItems = defineWorkItemMetadataTable('orders').withPayload(
  v.union(
    v.object({
      type: v.literal('itemReview'),
      itemId: v.id('orderItems'),
      itemName: v.string(),
    }),
    v.object({
      type: v.literal('qualityCheck'),
      notes: v.optional(v.string()),
    }),
  ),
)

// Side data - not part of workflow
const comments = defineTable({
  orderId: v.id('orders'),
  userId: v.string(),
  text: v.string(),
  createdAt: v.number(),
  // No workflowId or workItemId - this is side data
}).index('by_order', ['orderId'])

// Export all tables as default
export default {
  orders,
  orderItems,
  orderWorkItems,
  comments,
}
```

**Then import into central schema:**

```typescript
// convex/schema.ts
import { defineSchema } from 'convex/server'
import { schema as tasquencerTables } from '@repo/tasquencer'
import orderTables from './workflows/orderProcessing/schema'
// ... other imports

export default defineSchema({
  ...tasquencerTables,
  ...orderTables,
  // ... other workflow tables
})
```

**Key decisions:**

- Order is aggregate root → gets required `workflowId`
- Order Item can have subworkflow → gets optional `workflowId`
- Work item metadata → use typed payload pattern (modern approach)
- Comment is side operation → no workflow references
- All order tables live in `convex/workflows/orderProcessing/schema.ts`

**After creating the schema, run:**

```bash
npm run dev:convex:once
```

This generates TypeScript types for your new tables.

### Step 3: Implement Domain Functions

Create domain functions for all data access. These will be used by work item actions and activities.

**Important: Run `npm run dev:convex:once` after schema changes to generate types.**

```typescript
// convex/workflows/orderProcessing/db.ts
import type { DatabaseReader, DatabaseWriter } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'

/**
 * Insert a new order record
 */
export async function insertOrder(
  db: DatabaseWriter,
  order: Omit<Doc<'orders'>, '_id' | '_creationTime'>,
): Promise<Id<'orders'>> {
  return await db.insert('orders', order)
}

/**
 * Get order by workflow ID
 */
export async function getOrderByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<'tasquencerWorkflows'>,
): Promise<Doc<'orders'> | null> {
  return await db
    .query('orders')
    .withIndex('by_workflow_id', (q) => q.eq('workflowId', workflowId))
    .unique()
}

/**
 * Update order status
 */
export async function updateOrderStatus(
  db: DatabaseWriter,
  orderId: Id<'orders'>,
  status: string,
): Promise<void> {
  await db.patch(orderId, { status })
}

/**
 * Insert a new order item
 */
export async function insertOrderItem(
  db: DatabaseWriter,
  item: Omit<Doc<'orderItems'>, '_id' | '_creationTime'>,
): Promise<Id<'orderItems'>> {
  return await db.insert('orderItems', item)
}

/**
 * Create a review record
 */
export async function insertReview(
  db: DatabaseWriter,
  review: {
    itemId: Id<'orderItems'>
    reviewerName: string
    workItemId: Id<'tasquencerWorkItems'>
  },
): Promise<Id<'reviews'>> {
  return await db.insert('reviews', {
    ...review,
    comments: '',
  })
}

/**
 * Update review by work item ID
 */
export async function updateReviewByWorkItemId(
  db: DatabaseWriter,
  workItemId: Id<'tasquencerWorkItems'>,
  updates: { comments?: string; approved?: boolean },
): Promise<void> {
  const review = await db
    .query('reviews')
    .withIndex('by_work_item', (q) => q.eq('workItemId', workItemId))
    .unique()
  if (!review) throw new Error('Review not found')
  await db.patch(review._id, updates)
}

/**
 * Add a comment (side operation - not part of workflow)
 */
export async function insertComment(
  db: DatabaseWriter,
  comment: {
    orderId: Id<'orders'>
    userId: string
    text: string
  },
): Promise<Id<'comments'>> {
  return await db.insert('comments', {
    ...comment,
    createdAt: Date.now(),
  })
}
```

### Step 3.5: Organize API Functions

There are two patterns for organizing API functions. Choose based on your workflow complexity:

#### Option A: Single `api.ts` File (Simple Workflows)

For simple workflows with few endpoints, use a single `api.ts` file:

```typescript
// convex/workflows/greeting/api.ts
import { v } from 'convex/values'
import { mutation, query } from '../../_generated/server'
import { greetingVersionManager } from './definition'
import { getGreetingByWorkflowId, listGreetings } from './db'
import { GreetingWorkItemHelpers } from './helpers'
import { assertUserHasScope } from '../../authorization'

// Export version manager API
export const {
  initializeRootWorkflow,
  initializeWorkItem,
  startWorkItem,
  completeWorkItem,
  helpers: { getWorkflowTaskStates },
} = greetingVersionManager.apiForVersion('v1')

// Custom queries
export const getGreeting = query({
  args: { workflowId: v.id('tasquencerWorkflows') },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'greeting:staff')
    return await getGreetingByWorkflowId(ctx.db, args.workflowId)
  },
})

export const getGreetings = query({
  args: {},
  handler: async (ctx) => {
    await assertUserHasScope(ctx, 'greeting:staff')
    return await listGreetings(ctx.db)
  },
})

// Work queue query
export const getGreetingWorkQueue = query({
  args: {},
  handler: async (ctx) => {
    await assertUserHasScope(ctx, 'greeting:staff')
    // ... build work queue
  },
})
```

This creates a simple API structure:
- `api.workflows.greeting.api.initializeRootWorkflow`
- `api.workflows.greeting.api.getGreeting`
- `api.workflows.greeting.api.getGreetingWorkQueue`

#### Option B: `api/` Folder (Complex Workflows)

For complex workflows with many endpoints, organize into submodules:

```typescript
// convex/workflows/orderProcessing/api/orders.ts
import { v } from 'convex/values'
import { mutation, query } from '../../../_generated/server'

export const listOrders = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('orders').collect()
  },
})

// convex/workflows/orderProcessing/api/workItems.ts
export const getWorkQueueTasks = query({
  args: {},
  handler: async (ctx) => {
    // Build work queue
  },
})

// convex/workflows/orderProcessing/api/workflow.ts
import { orderVersionManager } from '../definition'

export const {
  initializeRootWorkflow,
  cancelRootWorkflow,
  startWorkItem,
  completeWorkItem,
} = orderVersionManager.apiForVersion('v1')
```

This creates a namespaced API structure:
- `api.workflows.orderProcessing.api.orders.listOrders`
- `api.workflows.orderProcessing.api.workItems.getWorkQueueTasks`
- `api.workflows.orderProcessing.api.workflow.initializeRootWorkflow`

**Important:** Do NOT mix both patterns in the same workflow - choose one and be consistent.

**Version manager setup** (same for both patterns):

```typescript
// convex/workflows/orderProcessing/definition.ts
import { versionManagerFor } from '../../tasquencer'
import { orderWorkflow } from './workflow'

export const orderVersionManager = versionManagerFor('orderProcessing')
  .registerVersion('v1', orderWorkflow)
  .build()
```

**Recommended file structure (Option B):**

```
convex/workflows/orderProcessing/
├── api/                      ← API submodules folder
│   ├── orders.ts            ← Order CRUD operations
│   ├── items.ts             ← Item queries
│   ├── workItems.ts         ← Work item and queue operations
│   └── workflow.ts          ← Workflow control (apiFor exports)
├── db.ts                    ← Domain functions
├── workItems/
│   ├── editItem.workItem.ts
│   └── reviewItem.workItem.ts
├── workflows/
│   └── order.workflow.ts
├── definition.ts
├── helpers.ts               ← Work item helpers
└── schema.ts                ← Workflow-specific tables
```

**When to use each pattern:**

| Pattern | Use When |
|---------|----------|
| Single `api.ts` | Simple workflows, < 10 endpoints, single concern |
| `api/` folder | Complex workflows, many endpoints, multiple concerns |

### Step 3.6: Test Domain Functions

**Domain layer must be thoroughly tested before proceeding to workflow implementation.**

Write comprehensive tests for all domain functions:

```typescript
// convex/workflows/orderProcessing/__tests__/db.test.ts
import { convexTest } from 'convex-test'
import { expect, test, describe } from 'vitest'
import { insertOrder, getOrderByWorkflowId, updateOrderStatus } from '../db'
import schema from '../../../schema'

describe('Order domain functions', () => {
  test('insertOrder() should create order with correct data', async () => {
    const t = convexTest(schema)

    const workflowId = await t.run(async (ctx) => {
      return await ctx.db.insert('tasquencerWorkflows', {
        name: 'orderProcessing',
        state: 'initialized',
        // ... other required fields
      })
    })

    const orderId = await t.run(async (ctx) => {
      return await insertOrder(ctx.db, {
        title: 'Test Order',
        customerId: 'customer-123',
        workflowId,
        status: 'draft',
      })
    })

    const order = await t.run(async (ctx) => {
      return await ctx.db.get(orderId)
    })

    expect(order).toBeDefined()
    expect(order?.title).toBe('Test Order')
    expect(order?.status).toBe('draft')
    expect(order?.workflowId).toBe(workflowId)
  })

  test('getOrderByWorkflowId() should retrieve order', async () => {
    const t = convexTest(schema)

    const { workflowId, orderId } = await t.run(async (ctx) => {
      const wfId = await ctx.db.insert('tasquencerWorkflows', {
        name: 'orderProcessing',
        state: 'initialized',
        // ... other required fields
      })

      const oId = await insertOrder(ctx.db, {
        title: 'Test Order',
        customerId: 'customer-123',
        workflowId: wfId,
        status: 'draft',
      })

      return { workflowId: wfId, orderId: oId }
    })

    const order = await t.run(async (ctx) => {
      return await getOrderByWorkflowId(ctx.db, workflowId)
    })

    expect(order?._id).toBe(orderId)
    expect(order?.title).toBe('Test Order')
  })

  test('getOrderByWorkflowId() should return null when order not found', async () => {
    const t = convexTest(schema)

    const fakeWorkflowId = await t.run(async (ctx) => {
      return await ctx.db.insert('tasquencerWorkflows', {
        name: 'orderProcessing',
        state: 'initialized',
        // ... other required fields
      })
    })

    const order = await t.run(async (ctx) => {
      return await getOrderByWorkflowId(ctx.db, fakeWorkflowId)
    })

    expect(order).toBeNull()
  })

  test('updateOrderStatus() should update status', async () => {
    const t = convexTest(schema)

    const orderId = await t.run(async (ctx) => {
      const wfId = await ctx.db.insert('tasquencerWorkflows', {
        name: 'orderProcessing',
        state: 'initialized',
      })
      return await insertOrder(ctx.db, {
        title: 'Test Order',
        customerId: 'customer-123',
        workflowId: wfId,
        status: 'draft',
      })
    })

    await t.run(async (ctx) => {
      await updateOrderStatus(ctx.db, orderId, 'approved')
    })

    const order = await t.run(async (ctx) => {
      return await ctx.db.get(orderId)
    })

    expect(order?.status).toBe('approved')
  })
})
```

**Run tests:**

```bash
npm run test:once
```

**All domain tests must pass before proceeding to workflow implementation.**

### Step 4: Design Work Items

> **⚠️ SECURITY CRITICAL: Custom Actions Expose Public APIs**
>
> Before implementing work items, understand that custom actions create publicly-accessible
> mutations. You MUST implement authentication and authorization for any actions that can
> be called by users. Use authorization policies to protect actions.

Now define your work items - the atomic units of work. **You'll primarily interact with data through work item actions and activities.**

**For each work item, define:**

1. **Actions** - External API (start, complete, fail) with authorization policies
2. **Activities** - Internal callbacks (onEnabled, onCompleted, onCanceled, etc.)

**Note:** Work item initialization happens in the task's `onEnabled` activity, NOT in work item actions.

```typescript
// convex/workflows/orderProcessing/workItems/reviewItem.workItem.ts
import { Builder } from '../../../tasquencer'
import { z } from 'zod/v3'
import { authService } from '../../../authorization'
import { updateReviewByWorkItemId } from '../db'
import { initializeOrderWorkItemAuth } from './authHelpers'
import { OrderWorkItemHelpers } from '../helpers'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'

// Define authorization policy
const reviewWritePolicy = authService.policies.requireScope('order:review:write')

// Define work item actions with authorization
const reviewItemActions = authService.builders.workItemActions
  .start(z.never(), reviewWritePolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')

    // Claim work item for user
    await OrderWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({
      comments: z.string(),
      approved: z.boolean(),
    }),
    reviewWritePolicy,
    async ({ mutationCtx, workItem, parent }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_NOT_AUTHENTICATED')

      // Verify user has claimed this work item
      const metadata = await OrderWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id,
      )
      const claimedBy = isHumanClaim(metadata?.claim)
        ? metadata.claim.userId
        : null
      if (!claimedBy || claimedBy !== userId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }

      // Update domain data
      await updateReviewByWorkItemId(mutationCtx.db, workItem.id, {
        comments: payload.comments,
        approved: payload.approved,
      })
    },
  )

// Create work item with actions
export const reviewItemWorkItem = Builder.workItem(
  'reviewItem',
).withActions(reviewItemActions.build())

// Create task with lifecycle activities
export const reviewItemTask = Builder.task(
  reviewItemWorkItem,
).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    // Get parent context
    const order = await getOrderByWorkflowId(mutationCtx.db, parent.workflow.id)
    invariant(order, 'ORDER_NOT_FOUND')

    // Initialize the work item
    const workItemId = await workItem.initialize()

    // Initialize work item metadata with authorization
    await initializeOrderWorkItemAuth(mutationCtx, workItemId, {
      scope: 'order:review:write',
      orderId: order._id,
      payload: {
        type: 'reviewItem',
        taskName: 'Review Order Item',
        priority: 'routine',
      },
    })
  },
})
```

**Key pattern:** Authorization is handled by policies (`reviewWritePolicy`) passed to each action. The policy is checked before the handler executes.

### Step 4.5: Choose Action Type (Default vs Custom)

**Before implementing work items, understand the security implications of custom actions:**

Custom actions create **public API mutations**. Any action you define with `.withActions()` becomes callable - authorization is enforced by policies.

**Use Default Actions (No Code) when:**

- Work item is triggered ONLY by activities
- No user interaction needed
- System/background processing only
- Example: Sending notifications, logging events, cleanup tasks

**Use Custom Actions (Your Code) when:**

- Work item can be started/completed by users
- Users can claim work items from queues
- Example: User approvals, manual data entry, reviews

**Example: Default Action (System Only)**

```typescript
// No custom actions needed - activities trigger everything
const notificationWorkItem = Builder.workItem(
  'sendNotification',
).withActivities({
  onInitialized: async ({ workItem }) => {
    // Auto-trigger start
    await workItem.start({})
  },
  onStarted: async ({ workItem, mutationCtx }) => {
    await sendNotification(mutationCtx)
    // Auto-trigger complete
    await workItem.complete({})
  },
})
// No .withActions() = uses default actions (internal only)
```

**Example: Custom Action (User-Facing)**

```typescript
// Custom actions with authorization policies
const approvalWritePolicy = authService.policies.requireScope('order:approve:write')

const approvalActions = authService.builders.workItemActions
  .start(z.never(), approvalWritePolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    invariant(authUser.userId, 'USER_NOT_AUTHENTICATED')

    // Claim work item for user
    await OrderWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      authUser.userId,
    )
    await workItem.start()
  })
  .complete(
    z.object({ approved: z.boolean(), reason: z.string().optional() }),
    approvalWritePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      await updateApprovalByWorkItemId(mutationCtx.db, workItem.id, payload)
    },
  )

const approvalWorkItem = Builder.workItem('approval').withActions(
  approvalActions.build(),
)
```

**Key difference:** Authorization policies (`approvalWritePolicy`) are passed as the second argument to each action. The policy is checked before the handler executes.

See [Authorization → Authentication Architecture](./AUTHORIZATION.md#authentication-architecture) for detailed patterns.

### Step 4.6: Set Up Authorization (Optional)

If your workflow requires role-based access control (RBAC), set up roles, groups, and work item assignments.

**Create role/group constants:**

```typescript
// convex/workflows/myWorkflow/authorization.ts
export const MY_WORKFLOW_ROLES = {
  REVIEWER: 'reviewer',
  APPROVER: 'approver',
  ADMIN: 'admin',
} as const

export const MY_WORKFLOW_GROUPS = {
  ALL_STAFF: 'all_staff',
  REVIEW_TEAM: 'review_team',
  APPROVAL_TEAM: 'approval_team',
} as const

export type MyWorkflowRole =
  (typeof MY_WORKFLOW_ROLES)[keyof typeof MY_WORKFLOW_ROLES]
export type MyWorkflowGroup =
  (typeof MY_WORKFLOW_GROUPS)[keyof typeof MY_WORKFLOW_GROUPS]
```

**Define role permissions:**

```typescript
// convex/workflows/myWorkflow/roles.ts
import type { WorkflowRolesDefinition } from '../../authorization/core'

export const myWorkflowRoles: WorkflowRolesDefinition = {
  workflowName: 'myWorkflow',
  roles: [
    {
      name: 'reviewer',
      description: 'Can review and provide feedback',
      canClaimWorkAssignedTo: ['reviewer'],
      canViewWorkAssignedTo: ['reviewer'],
    },
    {
      name: 'approver',
      description: 'Can approve or reject',
      canClaimWorkAssignedTo: ['approver', 'admin'], // Admin can help
      canViewWorkAssignedTo: ['approver', 'admin'],
    },
  ],
}
```

**Initialize metadata in task activities:**

Create a workflow-local helper (e.g., `convex/workflows/myWorkflow/workItems/authHelpers.ts`) that inserts rows into your metadata table. Import that helper when wiring up tasks:

```typescript
// convex/workflows/myWorkflow/workItems/authHelpers.ts
import type { MutationCtx } from '../../../_generated/server'
import type { Doc, Id } from '../../../_generated/dataModel'

export async function initializeMyWorkflowWorkItemAuth(
  mutationCtx: MutationCtx,
  workItemId: Id<'tasquencerWorkItems'>,
  config: {
    scope: string
    groupId?: string
    contextId: Id<'myContextTable'>
    payload: Doc<'myWorkflowWorkItems'>['payload']
  },
): Promise<Id<'myWorkflowWorkItems'>> {
  return await mutationCtx.db.insert('myWorkflowWorkItems', {
    workItemId,
    workflowName: 'myWorkflow',
    offer: {
      type: 'human' as const,
      requiredScope: config.scope,
      ...(config.groupId !== undefined && { requiredGroupId: config.groupId }),
    },
    aggregateTableId: config.contextId,
    payload: config.payload,
  })
}
```

**Use in task activities:**

```typescript
import { initializeMyWorkflowWorkItemAuth } from './authHelpers'

const reviewTask = Builder.task(reviewWorkItem).withActivities({
  onEnabled: async ({ mutationCtx, workItem, parent }) => {
    const context = await getContextByWorkflowId(
      mutationCtx.db,
      parent.workflow.id,
    )
    invariant(context, 'CONTEXT_NOT_FOUND')

    // Initialize work item (no payload needed)
    const workItemId = await workItem.initialize()

    // Initialize metadata with authorization
    await initializeMyWorkflowWorkItemAuth(mutationCtx, workItemId, {
      scope: 'myWorkflow:review:write',
      contextId: context._id,
      payload: {
        type: 'reviewTask',
        taskName: 'Review Task',
        priority: 'routine',
      },
    })
  },
})
```

**Use helper functions (recommended):**

```typescript
// convex/workflows/myWorkflow/workItems/helpers.ts
import { MyWorkItemHelpers } from '../helpers'
import { authComponent } from '../../../auth'
import invariant from 'tiny-invariant'

export async function startAndClaimWorkItem(
  mutationCtx: MutationCtx,
  workItem: { id: Id<'tasquencerWorkItems'>; start: () => Promise<void> },
): Promise<void> {
  const authUser = await authComponent.getAuthUser(mutationCtx)
  invariant(authUser.userId, 'USER_NOT_AUTHENTICATED')

  await MyWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, authUser.userId)
  await workItem.start()
}

// Use in work item actions
const reviewWritePolicy = authService.policies.requireScope('myWorkflow:review:write')

const reviewActions = authService.builders.workItemActions
  .start(z.never(), reviewWritePolicy, async ({ mutationCtx, workItem }) => {
    await startAndClaimWorkItem(mutationCtx, workItem)
  })
  .complete(
    z.object({ approved: z.boolean() }),
    reviewWritePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      await updateReviewByWorkItemId(mutationCtx.db, workItem.id, payload)
    },
  )

const reviewWorkItem = Builder.workItem('review').withActions(
  reviewActions.build(),
)
```

See [Authorization](./AUTHORIZATION.md) and [Work Item Patterns](./WORK_ITEM_PATTERNS.md) for complete details.

### Step 5: Design Workflow Topology

**Only now** do you design the actual workflow structure - the sequence of tasks, conditions, and control flow.

**Important: Run `npm run dev:convex:once` after defining workflows to generate API types.**

**Questions to ask:**

- What are the main steps in the process?
- Which steps can happen in parallel?
- What are the decision points?
- Are there any loops or retries?
- Do any steps need nested workflows?

**Critical YAWL requirement:**

- ⚠️ **Every workflow MUST have exactly one start condition and exactly one end condition**
- Multiple start/end conditions will cause runtime errors
- Use `.startCondition('start')` and `.endCondition('end')` - required for all workflows

```typescript
// convex/workflows/orderProcessing/workflows/order.workflow.ts
import { Builder } from '../../../tasquencer'
import { z } from 'zod/v3'
import { insertOrder } from '../db'
import { reviewItemTask } from '../workItems/reviewItem.workItem'
import { approveTask } from '../workItems/approve.workItem'

// Define workflow initialization actions
const orderWorkflowActions = Builder.workflowActions().initialize(
  z.object({ title: z.string(), customerId: z.string() }),
  async ({ mutationCtx, workflow }, payload) => {
    const workflowId = await workflow.initialize()

    // Create aggregate root using domain function
    await insertOrder(mutationCtx.db, {
      workflowId,
      title: payload.title,
      customerId: payload.customerId,
      status: 'draft',
    })
  },
)

// Build the workflow topology
export const orderWorkflow = Builder.workflow('orderProcessing')
  .withActions(orderWorkflowActions)
  .startCondition('start') // ⚠️ Required - exactly one start condition
  .task('review', reviewItemTask)
  .task('approve', approveTask)
  .endCondition('end') // ⚠️ Required - exactly one end condition
  .connectCondition('start', (to) => to.task('review'))
  .connectTask('review', (to) => to.task('approve'))
  .connectTask('approve', (to) => to.condition('end'))
```

**Note:** Task definitions (like `reviewItemTask`) include their `onEnabled` activities which handle work item initialization. See Step 4 for the full pattern.

### Step 6: Generate API and Wire to Your App

**Run `npm run dev:convex:once` to generate the API types before exporting.**

```typescript
// Export type-safe API (both external and internal variants)
export const {
  // External API (for users) - sets isInternalMutation=false
  initializeRootWorkflow,
  startWorkItem,
  completeWorkItem,
  failWorkItem,
  cancelWorkItem,

  // Internal API (for scheduled functions) - sets isInternalMutation=true
  internalInitializeRootWorkflow,
  internalStartWorkItem,
  internalCompleteWorkItem,
  internalFailWorkItem,
  internalCancelWorkItem,

  helpers: { getWorkflowTaskStates, getWorkflowState },
} = orderVersionManager.apiForVersion('v1')

// Use external API in user-facing mutations
export const createOrder = mutation({
  args: { title: v.string(), customerId: v.string() },
  handler: async (ctx, args) => {
    // Initialize workflow via external API
    const workflowId = await ctx.runMutation(initializeRootWorkflow, {
      payload: {
        title: args.title,
        customerId: args.customerId,
      },
    })

    return workflowId
  },
})

// ❌ WRONG: Don't inspect workflow state for business logic
export const addOrderCommentWrong = mutation({
  args: { orderId: v.id('orders'), comment: v.string() },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId)

    // ❌ Don't use workflow state for business logic!
    const workflowState = await getWorkflowState(ctx.db, order.workflowId)
    if (workflowState !== 'started') {
      throw new Error('Cannot comment - order workflow is not active')
    }

    await insertComment(ctx.db, { ... })
  },
})

// ✅ RIGHT: Use domain state for business logic
export const addOrderComment = mutation({
  args: { orderId: v.id('orders'), comment: v.string() },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId)

    // ✅ Check domain state instead
    if (order.status !== 'in_review') {
      throw new Error('Cannot comment - order is not in review')
    }

    await insertComment(ctx.db, {
      orderId: args.orderId,
      userId: await getAuthUserId(ctx),
      text: args.comment,
    })
  },
})

// ✅ EXCEPTION: UI queries can use workflow state helpers
export const getOrderForDisplay = query({
  args: { orderId: v.id('orders') },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId)

    // ✅ OK: UI layer can check workflow state for display purposes
    const workflowState = await getWorkflowState(ctx.db, order.workflowId)
    const taskStates = await getWorkflowTaskStates(ctx.db, {
      workflowName: 'orderProcessing',
      workflowId: order.workflowId,
    })

    return {
      order,
      workflowState, // For UI: show progress indicators
      taskStates, // For UI: enable/disable buttons
    }
  },
})
```

### Step 6.5: Write Detailed Workflow Tests

**Workflow tests must be written after workflow implementation and must test expected behavior in detail.**

Write comprehensive tests for all workflow paths:

```typescript
// convex/workflows/__tests__/orderProcessing.test.ts
import { convexTest } from 'convex-test'
import { expect, test, describe } from 'vitest'
import { api } from '../_generated/api'
import schema from '../schema'

describe('Order Processing Workflow', () => {
  test('happy path: initialize → review → approve → complete', async () => {
    const t = convexTest(schema)

    // Initialize workflow
    const workflowId = await t.mutation(api.orderProcessing.initializeRootWorkflow, {
      payload: {
        title: 'Test Order',
        customerId: 'customer-123',
      },
    })

    // Verify workflow initialized
    let workflowState = await t.run(async (ctx) => {
      return await api.orderProcessing.helpers.getWorkflowState(ctx.db, workflowId)
    })
    expect(workflowState).toBe('initialized')

    // Get task states
    let taskStates = await t.run(async (ctx) => {
      return await api.orderProcessing.helpers.getWorkflowTaskStates(ctx.db, {
        workflowName: 'orderProcessing',
        workflowId,
      })
    })
    expect(taskStates.review).toBe('enabled')

    // Get work item ID
    const reviewWorkItemId = await t.run(async (ctx) => {
      const workItems = await ctx.db
        .query('tasquencerWorkItems')
        .filter((q) => q.eq(q.field('taskName'), 'review'))
        .collect()
      return workItems[0]._id
    })

    // Complete review
    await t.mutation(api.orderProcessing.completeWorkItem, {
      workItemId: reviewWorkItemId,
      args: {
        name: 'reviewItem',
        payload: {
          comments: 'Looks good',
          approved: true,
        },
      },
    })

    // Verify workflow completed
    workflowState = await t.run(async (ctx) => {
      return await api.orderProcessing.helpers.getWorkflowState(ctx.db, workflowId)
    })
    expect(workflowState).toBe('completed')

    // Verify domain state synchronized
    const order = await t.run(async (ctx) => {
      const orders = await ctx.db
        .query('orders')
        .filter((q) => q.eq(q.field('workflowId'), workflowId))
        .collect()
      return orders[0]
    })
    expect(order.status).toBe('approved')
  })

  test('failure path: review rejected → workflow fails', async () => {
    const t = convexTest(schema)

    const workflowId = await t.mutation(api.orderProcessing.initializeRootWorkflow, {
      payload: {
        title: 'Test Order',
        customerId: 'customer-123',
      },
    })

    const reviewWorkItemId = await t.run(async (ctx) => {
      const workItems = await ctx.db
        .query('tasquencerWorkItems')
        .filter((q) => q.eq(q.field('taskName'), 'review'))
        .collect()
      return workItems[0]._id
    })

    // Fail review
    await t.mutation(api.orderProcessing.failWorkItem, {
      workItemId: reviewWorkItemId,
      args: {
        name: 'reviewItem',
        payload: {
          reason: 'Does not meet requirements',
        },
      },
    })

    // Verify workflow failed
    const workflowState = await t.run(async (ctx) => {
      return await api.orderProcessing.helpers.getWorkflowState(ctx.db, workflowId)
    })
    expect(workflowState).toBe('failed')
  })

  test('cancellation: cancel workflow cancels all tasks', async () => {
    const t = convexTest(schema)

    const workflowId = await t.mutation(api.orderProcessing.initializeRootWorkflow, {
      payload: {
        title: 'Test Order',
        customerId: 'customer-123',
      },
    })

    // Cancel workflow
    await t.mutation(api.orderProcessing.cancelRootWorkflow, {
      workflowId,
    })

    // Verify workflow canceled
    const workflowState = await t.run(async (ctx) => {
      return await api.orderProcessing.helpers.getWorkflowState(ctx.db, workflowId)
    })
    expect(workflowState).toBe('canceled')

    // Verify all tasks canceled
    const taskStates = await t.run(async (ctx) => {
      return await api.orderProcessing.helpers.getWorkflowState(ctx.db, {
        workflowName: 'orderProcessing',
        workflowId,
      })
    })
    expect(taskStates.review).toBe('canceled')
  })

  test('AND split: parallel tasks execute concurrently', async () => {
    // Test AND split behavior
    // ... detailed test implementation ...
  })

  test('XOR split: only one path executes', async () => {
    // Test XOR split with routing
    // ... detailed test implementation ...
  })

  test('OR join: task completes when any input arrives', async () => {
    // Test OR join behavior
    // ... detailed test implementation ...
  })

  test('task policy: custom completion logic', async () => {
    // Test custom task policies
    // ... detailed test implementation ...
  })

  test('composite task: subworkflow execution', async () => {
    // Test nested workflows
    // ... detailed test implementation ...
  })

  test('activity callbacks: onEnabled, onStarted, onCompleted', async () => {
    // Test activity lifecycle
    // ... detailed test implementation ...
  })
})
```

**Test requirements:**

- ✅ Test happy path (complete workflow execution)
- ✅ Test failure scenarios (work item failures, task policies)
- ✅ Test cancellation (workflow, work item, cascading cancellation)
- ✅ Test all control flow patterns used (AND/XOR/OR splits and joins)
- ✅ Test custom task policies
- ✅ Test composite tasks and subworkflows
- ✅ Test activity callbacks (onEnabled, onStarted, onCompleted, etc.)
- ✅ Test domain state synchronization
- ✅ Test edge cases and error conditions

**Run workflow tests:**

```bash
npm run test:once
```

**All workflow tests must pass before considering the implementation complete.**

### Step 7: Run Typecheck

**Final verification: ensure no type errors and no usage of `any`.**

```bash
npm run typecheck
```

**Requirements:**

- ✅ Zero type errors
- ✅ No usage of `any` type
- ✅ All generated types are correct
- ✅ All domain functions are properly typed
- ✅ All workflow APIs are type-safe

**Fix any type errors before deploying or merging.**

**Critical rule: Use domain state, not workflow state**

- ❌ **Don't** inspect workflow state for business logic in mutations
- ✅ **Do** use domain object state (e.g., `rfp.status`) for business decisions
- ✅ **Exception**: UI queries can use `getWorkflowState`, `getWorkItemState`, `getWorkflowTaskStates` for display purposes only

**Why this matters:**

- Domain state is the source of truth for business rules
- Workflow state is orchestration state, not business state
- Mixing them creates tight coupling and makes logic hard to understand
- UI needs workflow state to show progress, enable buttons, etc. - this is the only valid use case

### Development Sequence Summary

```
1. Domain Model Design
   ↓ Identify entities and relationships

2. Workflow Schema Design
   ↓ Create convex/workflows/{workflowName}/schema.ts
   ↓ Define aggregate roots, child entities, work item metadata
   ↓ Import into central convex/schema.ts
   ↓ Run: npm run dev:convex:once

3. Domain Functions
   ↓ Implement all data access in convex/workflows/{workflowName}/domain/

3.5. Domain Testing
   ↓ Write comprehensive domain tests
   ↓ Run: npm run test:once
   ↓ All tests must pass

4. Work Items (Actions + Activities)
   ↓ Define external API and internal callbacks
   ↓ Use domain functions for all data access

5. Workflow Topology
   ↓ Connect tasks, conditions, control flow
   ↓ Run: npm run dev:convex:once

6. API Integration
   ↓ Export and use in your app

6.5. Workflow Testing
   ↓ Write detailed workflow tests (happy path, failures, edge cases)
   ↓ Test all control flow patterns (AND/XOR/OR splits/joins)
   ↓ Test cancellation and failure scenarios
   ↓ Test task policies and activities
   ↓ Run: npm run test:once
   ↓ All tests must pass

7. Type Checking
   ↓ Run: npm run typecheck
   ↓ Fix all type errors
   ↓ No usage of 'any' allowed
   ↓ Zero errors required
```

**Key principles:**

- ✅ Start with domain, not workflow
- ✅ Run `npm run dev:convex:once` regularly to generate types
- ✅ Domain layer must be thoroughly tested before workflows
- ✅ Workflow tests must be detailed and comprehensive
- ✅ Run `npm run typecheck` continuously - zero errors required
- ✅ No usage of `any` type allowed
- ✅ Determine workflow references based on entity relationships
- ✅ Create surrogate entities for work item-specific data
- ✅ Implement domain functions before work items
- ✅ Work items are your primary data interaction points
- ✅ Design workflow topology last
- ✅ **Every workflow MUST have exactly one start and one end condition**
- ✅ **Use domain state for business logic, not workflow state**
- ✅ **Exception**: UI queries can inspect workflow state for display purposes only

---

## Quick Start

### 0. Set Up Domain Layer

**Always start by defining your domain schema and functions.**

```typescript
// convex/workflows/documentApproval/db.ts
import type { DatabaseReader, DatabaseWriter } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'

export async function insertDocument(
  db: DatabaseWriter,
  doc: Omit<Doc<'documents'>, '_id' | '_creationTime'>,
): Promise<Id<'documents'>> {
  return await db.insert('documents', doc)
}

export async function getDocumentByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<'tasquencerWorkflows'>,
): Promise<Doc<'documents'> | null> {
  return await db
    .query('documents')
    .withIndex('by_workflow_id', (q) => q.eq('workflowId', workflowId))
    .unique()
}

export async function updateDocumentStatus(
  db: DatabaseWriter,
  documentId: Id<'documents'>,
  status: string,
): Promise<void> {
  await db.patch(documentId, { status })
}
```

### 1. Define a Work Item

Work items are the atomic units of work. Define what they can do via **actions with authorization policies**.

```typescript
// convex/workflows/documentApproval/workItems/reviewDocument.workItem.ts
import { Builder } from '../../../tasquencer'
import { z } from 'zod/v3'
import { authService } from '../../../authorization'
import { updateDocumentStatus, getDocumentByWorkflowId } from '../db'
import { initializeDocumentWorkItemAuth } from './authHelpers'
import { DocumentWorkItemHelpers } from '../helpers'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'

// Define authorization policy
const reviewWritePolicy = authService.policies.requireScope('document:review:write')

// Define work item actions with authorization
const reviewDocumentActions = authService.builders.workItemActions
  .start(z.never(), reviewWritePolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    invariant(authUser.userId, 'USER_NOT_AUTHENTICATED')

    await DocumentWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, authUser.userId)
    await workItem.start()
  })
  .complete(
    z.object({ approved: z.boolean() }),
    reviewWritePolicy,
    async ({ mutationCtx, workItem, parent }, { approved }) => {
      const doc = await getDocumentByWorkflowId(mutationCtx.db, parent.workflow.id)
      invariant(doc, 'DOCUMENT_NOT_FOUND')

      await updateDocumentStatus(
        mutationCtx.db,
        doc._id,
        approved ? 'approved' : 'rejected',
      )
    },
  )

// Create the work item
export const reviewDocumentWorkItem = Builder.workItem(
  'reviewDocument',
).withActions(reviewDocumentActions.build())

// Create the task with initialization in onEnabled
export const reviewDocumentTask = Builder.task(
  reviewDocumentWorkItem,
).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    const doc = await getDocumentByWorkflowId(mutationCtx.db, parent.workflow.id)
    invariant(doc, 'DOCUMENT_NOT_FOUND')

    // Initialize work item
    const workItemId = await workItem.initialize()

    // Initialize work item metadata with authorization
    await initializeDocumentWorkItemAuth(mutationCtx, workItemId, {
      scope: 'document:review:write',
      documentId: doc._id,
      payload: {
        type: 'reviewDocument',
        taskName: 'Review Document',
      },
    })
  },
})
```

### 2. Build a Workflow

Workflows connect tasks via conditions.

```typescript
// convex/workflows/documentApproval/workflows/documentApproval.workflow.ts
import { Builder } from '../../../tasquencer'
import { z } from 'zod/v3'
import { insertDocument } from '../db'
import { reviewDocumentTask } from '../workItems/reviewDocument.workItem'

const documentApprovalActions = Builder.workflowActions().initialize(
  z.object({ title: z.string() }),
  async ({ mutationCtx, workflow }, payload) => {
    const workflowId = await workflow.initialize()

    await insertDocument(mutationCtx.db, {
      workflowId,
      title: payload.title,
      status: 'pending',
    })
  },
)

export const documentApprovalWorkflow = Builder.workflow('documentApproval')
  .withActions(documentApprovalActions)
  .startCondition('start')
  .task('review', reviewDocumentTask)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('review'))
  .connectTask('review', (to) => to.condition('end'))
```

### 3. Register Workflow Version and Generate Type-Safe API

```typescript
// convex/workflows/documentApproval/definition.ts
import { versionManagerFor } from '../../tasquencer'
import { documentApprovalWorkflow } from './workflow'

export const documentApprovalVersionManager = versionManagerFor('documentApproval')
  .registerVersion('v1', documentApprovalWorkflow)
  .build()

// convex/workflows/documentApproval/api/workflow.ts
import { documentApprovalVersionManager } from '../definition'

export const {
  // Workflow operations
  initializeRootWorkflow,
  cancelRootWorkflow,
  initializeWorkflow,
  cancelWorkflow,

  // Work item operations
  initializeWorkItem,
  startWorkItem,
  completeWorkItem,
  failWorkItem,
  cancelWorkItem,

  // Helpers for reading state
  helpers: {
    getWorkflowTaskStates,
    getWorkflowState,
    getWorkItemState,
    safeGetWorkflowState,
    safeGetWorkItemState,
  },
} = documentApprovalVersionManager.apiForVersion('v1')

// Create a query wrapper to control access
export const getDocumentApprovalTaskStates = query({
  args: { workflowId: v.id('tasquencerWorkflows') },
  handler: async (ctx, args) => {
    // Type-safe! Returns { review: TaskState, notify: TaskState }
    return await getWorkflowTaskStates(ctx.db, {
      workflowName: 'documentApproval',
      workflowId: args.workflowId,
    })
  },
})
```

**Type safety guarantees:**

The version manager API provides **both compile-time and runtime validation**:

- ✅ TypeScript ensures correct work item/workflow names at build time
- ✅ Zod schemas validate payloads at runtime
- ✅ Wrong names or invalid payloads are caught immediately
- ✅ Each version has its own type-safe API

**State helpers:**

The version manager API provides state check helpers, but **use them only for UI queries, not business logic**:

```typescript
// Get workflow state (throws if not found)
const workflowState = await getWorkflowState(ctx.db, workflowId)
// Returns: 'initialized' | 'started' | 'completed' | 'failed' | 'canceled'

// Get workflow state safely (returns undefined if not found)
const workflowState = await safeGetWorkflowState(ctx.db, workflowId)
// Returns: WorkflowState | undefined

// Get work item state (throws if not found)
const workItemState = await getWorkItemState(ctx.db, workItemId)
// Returns: 'initialized' | 'started' | 'completed' | 'failed' | 'canceled'

// Get work item state safely (returns undefined if not found)
const workItemState = await safeGetWorkItemState(ctx.db, workItemId)
// Returns: WorkItemState | undefined
```

**⚠️ Important: Use domain state for business logic, not workflow state**

```typescript
// ❌ WRONG: Don't use workflow state for business logic
export const addDocumentCommentWrong = mutation({
  args: { documentId: v.id('documents'), comment: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId)

    // ❌ Don't check workflow state for business decisions!
    const workflowState = await getWorkflowState(ctx.db, doc.workflowId)
    if (workflowState !== 'started') {
      throw new Error('Cannot comment - workflow not active')
    }

    await insertDocumentComment(ctx.db, { ... })
  },
})

// ✅ RIGHT: Use domain state for business logic
export const addDocumentComment = mutation({
  args: { documentId: v.id('documents'), comment: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId)

    // ✅ Check domain state instead
    if (doc.status !== 'in_review') {
      throw new Error('Cannot comment - document is not in review')
    }

    await insertDocumentComment(ctx.db, {
      documentId: args.documentId,
      comment: args.comment,
      userId: await getAuthUserId(ctx),
    })
  },
})
```

**✅ Exception: UI queries can use workflow state helpers**

The **only** valid use case for these helpers is in queries for UI display purposes:

```typescript
// ✅ OK: UI query uses workflow state for display
export const getDocumentForDisplay = query({
  args: { documentId: v.id('documents') },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId)

    // ✅ OK for UI: Show workflow progress indicators
    const workflowState = await getWorkflowState(ctx.db, doc.workflowId)
    const taskStates = await getWorkflowTaskStates(ctx.db, {
      workflowName: 'documentReview',
      workflowId: doc.workflowId,
    })

    return {
      doc,
      workflowState, // UI: "In Progress", "Completed" badge
      taskStates, // UI: Enable/disable "Submit Review" button
    }
  },
})
```

**Use case: Conditional actions in regular mutations**

When you need to allow certain operations only based on workflow/work item state:

```typescript
// Example: Allow document comments only when review is in progress
export const addDocumentComment = mutation({
  args: {
    documentId: v.id('documents'),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    // Get the document and its workflow
    const doc = await ctx.db.get(args.documentId)

    // Check workflow state using helper
    const workflowState = await getWorkflowState(ctx.db, doc.workflowId)

    if (workflowState !== 'started') {
      throw new Error(
        'Cannot comment on document - review workflow is not active',
      )
    }

    // Add comment
    await insertDocumentComment(ctx.db, {
      documentId: args.documentId,
      comment: args.comment,
      userId: await getAuthUserId(ctx),
    })
  },
})

// Example: Allow editing only when work item is in specific state
export const updateReviewNotes = mutation({
  args: {
    workItemId: v.id('tasquencerWorkItems'),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    // Check work item state
    const workItemState = await getWorkItemState(ctx.db, args.workItemId)

    if (workItemState !== 'started') {
      throw new Error('Cannot update notes - review is not in progress')
    }

    // Update notes
    await updateReviewNotesByWorkItemId(ctx.db, args.workItemId, args.notes)
  },
})
```

### 4. Use in Your App

```typescript
// Start a workflow
const workflowId = await ctx.runMutation(
  api.workflows.documentApproval.api.initializeRootWorkflow,
  { payload: { title: 'My Document' } }, // Type-safe!
)

// Complete a work item
await ctx.runMutation(api.workflows.documentApproval.api.completeWorkItem, {
  workItemId: reviewWorkItemId,
  args: {
    name: 'reviewDocument',
    payload: { approved: true }, // Type-safe!
  },
})
```

---

## Quick Start Examples
