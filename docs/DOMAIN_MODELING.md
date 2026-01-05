# Domain Data Modeling

> **Prerequisites**: Understanding of database schema design and DDD concepts  
> **Related**: [Getting Started](./GETTING_STARTED.md) | [Workflow Basics](./WORKFLOWS_BASIC.md) | [Actions vs Activities](./ACTIONS_ACTIVITIES.md)

This guide explains how to design your domain data model for Tasquencer workflows.

## Table of Contents

- [Core Principles](#core-principles)
  - [1. Aggregate Root Pattern](#1-aggregate-root-pattern)
  - [2. Subworkflow Relationships](#2-subworkflow-relationships)
  - [3. Work Item Data Storage](#3-work-item-data-storage)
  - [4. Domain-Driven Design](#4-domain-driven-design)
  - [5. Data Access Rules](#5-data-access-rules)
  - [6. Index Strategy](#6-index-strategy)
  - [7. Synchronization Boundaries](#7-synchronization-boundaries)
  - [8. Root Workflow ID Pattern](#8-root-workflow-id-pattern)
  - [9. Domain Services for State Transitions](#9-domain-services-for-state-transitions)
  - [10. Shared Helper Functions](#10-shared-helper-functions)
  - [11. Performance & Indexing](#11-performance--indexing)
- [Complete Example](#complete-example)
- [Key Takeaways](#key-takeaways)

---

## Domain Data Modeling

Tasquencer separates **orchestration state** (workflows, tasks, work items) from **domain state** (your business data). Understanding how to model domain data is crucial for building maintainable workflows.

## Schema File Organization

**IMPORTANT: Each workflow maintains its own schema file.**

Instead of defining all tables in a monolithic `convex/schema.ts`, Tasquencer workflows organize domain tables by workflow:

```
convex/
├── schema.ts                          # Central schema (imports all workflows)
├── tasquencer.ts                      # Tasquencer initialization
├── workflows/
│   ├── orderProcessing/
│   │   ├── schema.ts                 # Order workflow tables
│   │   ├── definition.ts             # Workflow version manager
│   │   ├── helpers.ts                # Work item metadata helpers
│   │   ├── db.ts                     # Database function exports (barrel)
│   │   ├── db/                       # Database functions
│   │   │   ├── orders.ts
│   │   │   └── items.ts
│   │   ├── domain/services/          # Domain services
│   │   ├── workItems/                # Work item definitions
│   │   ├── workflows/                # Workflow definitions
│   │   └── api/                      # Query/mutation endpoints
│   └── approvalFlow/
│       └── ...                       # Same structure
```

### Workflow Schema Pattern

Each workflow's `schema.ts` exports a default object containing all workflow-specific tables:

```typescript
// convex/workflows/orderProcessing/schema.ts
import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { defineWorkItemMetadataTable } from '@repo/tasquencer'

// Aggregate root
const orders = defineTable({
  title: v.string(),
  customerName: v.string(),
  status: v.string(),
  dueDate: v.number(),
  workflowId: v.id('tasquencerWorkflows'),
})
  .index('by_workflow_id', ['workflowId'])
  .index('by_status', ['status'])

// Child entities
const orderItems = defineTable({
  orderId: v.id('orders'),
  title: v.string(),
  quantity: v.number(),
  workflowId: v.optional(v.id('tasquencerWorkflows')),
})
  .index('by_order_id', ['orderId'])
  .index('by_workflow_id', ['workflowId'])

// Work item metadata table
const orderWorkItems = defineWorkItemMetadataTable('orders').withPayload(
  v.union(
    v.object({
      type: v.literal('item'),
      itemId: v.id('orderItems'),
      itemName: v.string(),
    }),
    v.object({
      type: v.literal('qualityCheck'),
      notes: v.optional(v.string()),
    }),
  ),
)

// Export all tables as default
export default {
  orders,
  orderItems,
  orderWorkItems,
}
```

### Central Schema Merges All Workflows

The central `convex/schema.ts` imports and merges all workflow schemas:

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from 'convex/server'
import { schema as tasquencerTables } from '@repo/tasquencer'
import orderTables from './workflows/orderProcessing/schema'
import approvalTables from './workflows/approvalFlow/schema'

const users = defineTable({
  // Custom user fields (optional)
})

export default defineSchema({
  users,
  ...tasquencerTables,
  ...orderTables,
  ...approvalTables,
})
```

### Benefits of This Pattern

- **Modularity**: Each workflow is self-contained with its own schema
- **Clear Ownership**: Easy to see which tables belong to which workflow
- **Better Navigation**: Workflow-related tables are co-located with workflow code
- **Scalability**: Add new workflows without bloating central schema
- **Domain Boundaries**: Natural separation aligns with domain-driven design
- **Easier Refactoring**: Changes to one workflow's schema don't affect others

### Creating a New Workflow Schema

When creating a new workflow, start by creating its schema file:

```bash
# Create workflow directory structure
mkdir -p convex/workflows/myWorkflow
touch convex/workflows/myWorkflow/schema.ts
```

```typescript
// convex/workflows/myWorkflow/schema.ts
import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { defineWorkItemMetadataTable } from '@repo/tasquencer'

const myAggregates = defineTable({
  name: v.string(),
  workflowId: v.id('tasquencerWorkflows'),
}).index('by_workflow_id', ['workflowId'])

const myWorkItems = defineWorkItemMetadataTable('myAggregates').withPayload(
  v.union(
    v.object({
      type: v.literal('myTask'),
      taskName: v.string(),
    }),
  ),
)

export default {
  myAggregates,
  myWorkItems,
}
```

Then import it in `convex/schema.ts`:

```typescript
// convex/schema.ts
import myWorkflowTables from './workflows/myWorkflow/schema'

export default defineSchema({
  // ... other tables
  ...myWorkflowTables,
})
```

**IMPORTANT**: After schema changes, run `npm run dev:convex:once` to regenerate types.

### Core Principles

#### 1. Aggregate Root Pattern

**Workflows should have a 1:1 relationship with aggregate roots.**

```typescript
// convex/workflows/orderProcessing/schema.ts
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

// Aggregate root
const orders = defineTable({
  title: v.string(),
  customerId: v.string(),
  status: v.string(),
  dueDate: v.number(),
  workflowId: v.id('tasquencerWorkflows'), // 1:1 relationship
}).index('by_workflow', ['workflowId'])

// Child entities (1:N with aggregate root)
const orderItems = defineTable({
  orderId: v.id('orders'),
  title: v.string(),
  quantity: v.number(),
  workflowId: v.optional(v.id('tasquencerWorkflows')), // For subworkflows
})
  .index('by_order', ['orderId'])
  .index('by_workflow', ['workflowId'])

// Work item data
const reviews = defineTable({
  itemId: v.id('orderItems'),
  reviewerName: v.string(),
  comments: v.string(),
  workItemId: v.id('tasquencerWorkItems'), // Link to work item
}).index('by_work_item', ['workItemId'])

export default {
  orders,
  orderItems,
  reviews,
}
```

**Why 1:1 with aggregate root?**

- Workflow lifecycle matches business entity lifecycle
- Clear ownership and boundaries
- Easy to query workflow state for a business entity
- Natural cancellation scope (cancel order → cancel workflow)

#### 2. Subworkflow Relationships

**Composite tasks/subworkflows should relate 1:1 to child entities of the aggregate root.**

```typescript
// Order workflow (aggregate root)
const orderWorkflow = Builder.workflow('order').withActions(
  Builder.workflowActions().initialize(
    z.object({ title: v.string(), customerId: v.string() }),
    async ({ mutationCtx, workflow }, payload) => {
      const workflowId = await workflow.initialize()

      // Create aggregate root
      await OrderDomain.create(mutationCtx, {
        title: payload.title,
        customerId: payload.customerId,
        workflowId,
      })
    },
  ),
)

// Item review subworkflow (child entity)
const itemReviewWorkflow = Builder.workflow('itemReview').withActions(
  Builder.workflowActions().initialize(
    z.object({ orderId: v.id('orders'), itemTitle: v.string() }),
    async ({ mutationCtx, workflow }, payload) => {
      const workflowId = await workflow.initialize()

      // Create child entity (1:N with Order)
      await OrderDomain.createItem(mutationCtx, {
        orderId: payload.orderId,
        title: payload.itemTitle,
        workflowId, // 1:1 with subworkflow
      })
    },
  ),
)

// Parent workflow uses composite task
const orderWorkflow = Builder.workflow('order').compositeTask(
  'reviewItems',
  Builder.compositeTask(itemReviewWorkflow).withActivities({
    onEnabled: async ({ workflow, mutationCtx, parent }) => {
      // Get parent aggregate root
      const order = await OrderDomain.getByWorkflowId(
        mutationCtx,
        parent.workflow.id,
      )

      // Initialize subworkflow for each item
      for (const item of order.items) {
        await workflow.initialize({
          orderId: order._id,
          itemTitle: item.title,
        })
      }
    },
  }),
)
```

**Key pattern:**

```
Aggregate Root (Order) ←1:1→ Root Workflow
        ↓ 1:N
Child Entity (Item) ←1:1→ Subworkflow
        ↓ 1:N
Work Item Data (Review) ←1:1→ Work Item
```

#### 3. Work Item Data Storage

**Tasquencer provides a 3-tiered approach to storing work item data.**

The modern architecture uses **one metadata table per aggregate root** with a typed payload field, eliminating the need for separate "surrogate tables" in most cases.

##### Tier 1: Core Domain Tables (Always Required)

Your aggregate roots and their child entities. These are non-negotiable and exist independently of workflows.

```typescript
// convex/workflows/taskManagement/schema.ts
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

// Aggregate root
const tasks = defineTable({
  name: v.string(),
  createdDate: v.number(),
  status: v.string(),
  workflowId: v.id('tasquencerWorkflows'),
}).index('by_workflow', ['workflowId'])

// Child entities
const taskResults = defineTable({
  taskId: v.id('tasks'),
  resultType: v.string(),
  data: v.string(),
}).index('by_task', ['taskId'])

export default {
  tasks,
  taskResults,
}
```

##### Tier 2: Typed Metadata Payload (Default - 95% of Cases)

Use the metadata table's typed `payload` field for work item-specific data. One table per aggregate root serves **all work items** across root workflow and sub-workflows.

```typescript
// convex/workflows/taskManagement/schema.ts - ONE table for entire aggregate root hierarchy
import { defineWorkItemMetadataTable } from '@repo/tasquencer'

const taskWorkItems = defineWorkItemMetadataTable('tasks').withPayload(
  v.union(
    // Root workflow work items
    v.object({
      type: v.literal('reviewTask'),
      taskName: v.string(),
      priority: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    }),
    v.object({
      type: v.literal('approvalRequest'),
      taskName: v.string(),
      priority: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
      approverType: v.union(v.literal('manager'), v.literal('specialist')),
    }),
    // Sub-workflow work items (same table!)
    v.object({
      type: v.literal('performAnalysis'),
      taskName: v.string(),
      priority: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    }),
  ),
)

export default {
  // ... other tables
  taskWorkItems,
}

// In a separate file (e.g., convex/workflows/taskManagement/helpers.ts)
import { Authorization } from '../../tasquencer'
import type { MutationCtx } from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'

export const TaskWorkItemHelpers =
  Authorization.workItemMetadataHelpersForTable('taskWorkItems')

export async function initializeTaskWorkItemMetadata(
  mutationCtx: MutationCtx,
  metadata: Omit<Doc<'taskWorkItems'>, '_id'>,
) {
  await mutationCtx.db.insert('taskWorkItems', metadata)
}
```

**Using the payload in work items:**

```typescript
// Root workflow work item
const reviewWorkItem = Builder.workItem('review').withActions(
  Builder.workItemActions().initialize(
    z.object({ taskId: zid('tasks'), priorityLevel: z.string() }),
    async ({ mutationCtx, workItem }, payload) => {
      const workItemId = await workItem.initialize()

      // Store work item data in typed payload
      await initializeTaskWorkItemMetadata(mutationCtx, {
        workItemId,
        workflowName: 'taskProcessing',
        offer: {
          type: 'human',
          requiredScope: 'task:review:write',
        },
        aggregateTableId: payload.taskId,  // Links to task
        payload: {
          type: 'reviewTask',
          taskName: 'Review Task',
          priority: payload.priorityLevel === 'urgent' ? 'high' : 'medium',
        },
      })
    },
  ),
)

// Sub-workflow work item (same table, same helpers!)
const analysisWorkItem = Builder.workItem('analysis').withActions(
  Builder.workItemActions().initialize(
    z.object({ taskId: zid('tasks') }),
    async ({ mutationCtx, workItem }, payload) => {
      const workItemId = await workItem.initialize()

      await initializeTaskWorkItemMetadata(mutationCtx, {
        workItemId,
        workflowName: 'detailedAnalysis',  // Sub-workflow
        offer: {
          type: 'human',
          requiredScope: 'task:analysis:write',
        },
        aggregateTableId: payload.taskId,  // Same task
        payload: {
          type: 'performAnalysis',
          taskName: 'Perform Analysis',
          priority: 'medium',
        },
      })
    },
  ),
)
```

**Benefits of typed payload:**

- ✅ No separate tables for 1:1 work item data
- ✅ Type-safe discriminated union
- ✅ All work items queryable by aggregate (`getWorkItemsForTask`)
- ✅ 2-way joins (task ↔ work items) instead of 3-way
- ✅ Single source of truth for all work metadata
- ✅ Shared across root + all sub-workflows

##### Tier 3: Process Entity Tables (Rare - <5% of Cases)

Create separate tables **only when** data must span multiple work items or requires complex aggregation that the typed payload cannot support.

**Note**: Most auditing needs are handled by the `@convex/audit` layer, so separate audit tables are rarely needed.

```typescript
// Rare case: Complex cross-work-item reporting
taskProcessingMetrics: defineTable({
  taskId: v.id('tasks'),
  totalProcessingTime: v.number(),
  completedStages: v.array(v.string()),
  averageStageTime: v.number(),
}).index('by_task', ['taskId']),
```

**Key Architecture Principle:**

```
One Metadata Table Per Aggregate Root (Not Per Workflow!)

tasks table
    ↓ (aggregate)
taskWorkItems table  ← ALL task work items (root + sub-workflows)
    ↓ (links to)
- reviewTask work items
- approvalRequest work items
- performAnalysis work items (sub-workflow)
- qualityCheck work items (sub-workflow)
- ALL other task work items
```


#### 4. Domain-Driven Design

**Use lightweight DDD with domain functions for all data access.**

There are two valid patterns for organizing domain functions:

**Pattern A: Domain Object (namespace-like)**
```typescript
// convex/workflows/orderProcessing/domain/order.ts
export const OrderDomain = {
  async create(ctx, data) { ... },
  async getByWorkflowId(ctx, workflowId) { ... },
}
```

**Pattern B: Individual Functions (used in examples)**
```typescript
// convex/workflows/orderProcessing/db/orders.ts
export async function insertOrder(db, order) { ... }
export async function getOrderByWorkflowId(db, workflowId) { ... }

// Re-export from barrel file (db.ts)
export { insertOrder, getOrderByWorkflowId } from './db/orders'
```

Both patterns achieve the same goal. The examples use Pattern B with a `db/` folder and barrel file. Choose what fits your team's preferences.

**Example using Pattern A (Domain Object):**

```typescript
// convex/workflows/orderProcessing/domain/order.ts

export const OrderDomain = {
  // Aggregate root operations
  async create(
    ctx: { db: DatabaseWriter },
    data: {
      title: string
      customerId: string
      workflowId: Id<'tasquencerWorkflows'>
    },
  ) {
    return await ctx.db.insert('orders', {
      title: data.title,
      customerId: data.customerId,
      workflowId: data.workflowId,
      status: 'draft',
      dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
    })
  },

  async getByWorkflowId(
    ctx: { db: DatabaseReader },
    workflowId: Id<'tasquencerWorkflows'>,
  ) {
    const order = await ctx.db
      .query('orders')
      .withIndex('by_workflow', (q) => q.eq('workflowId', workflowId))
      .unique()

    if (!order) throw new Error('Order not found for workflow')
    return order
  },

  async getByWorkItemId(
    ctx: { db: DatabaseReader },
    workItemId: Id<'tasquencerWorkItems'>,
  ) {
    const review = await ctx.db
      .query('reviews')
      .withIndex('by_work_item', (q) => q.eq('workItemId', workItemId))
      .unique()

    if (!review) throw new Error('Review not found for work item')

    const item = await ctx.db.get(review.itemId)
    if (!item) throw new Error('Item not found')

    return await ctx.db.get(item.orderId)
  },

  // Child entity operations
  async createItem(
    ctx: { db: DatabaseWriter },
    data: {
      orderId: Id<'orders'>
      title: string
      workflowId: Id<'tasquencerWorkflows'>
    },
  ) {
    return await ctx.db.insert('orderItems', {
      orderId: data.orderId,
      title: data.title,
      quantity: 1,
      workflowId: data.workflowId,
    })
  },

  // Work item operations
  async createApproval(
    ctx: { db: DatabaseWriter },
    data: {
      itemId: Id<'orderItems'>
      assignedTo: string
      workItemId: Id<'tasquencerWorkItems'>
      status: string
      comments: string
    },
  ) {
    return await ctx.db.insert('reviews', data)
  },

  async updateApproval(
    ctx: { db: DatabaseWriter },
    workItemId: Id<'tasquencerWorkItems'>,
    updates: { comments?: string; status?: string },
  ) {
    const review = await ctx.db
      .query('reviews')
      .withIndex('by_work_item', (q) => q.eq('workItemId', workItemId))
      .unique()

    if (!review) throw new Error('Review not found')

    await ctx.db.patch(review._id, updates)
  },
}
```

**Why domain functions?**

- ✅ Encapsulates business logic and data access
- ✅ Reusable across activities, actions, queries, and mutations
- ✅ Type-safe with consistent error handling
- ✅ Easy to test in isolation
- ✅ Clear boundaries between orchestration and domain
- ✅ Makes refactoring easier (single source of truth for queries)

## API Organization Pattern

**CRITICAL: Avoid `api.ts` at workflow root**

When organizing your workflow's API functions, **do NOT create `api.ts` at the same level as an `api/` folder** - this causes a TypeScript "Type instantiation is excessively deep and possibly infinite" error.

**❌ Wrong - Causes TypeScript Error:**
```
workflows/orderProcessing/
├── api.ts          ← Conflicts with api/ folder!
└── api/
    ├── orders.ts
    └── items.ts
```

**✅ Correct - Recommended workflow structure:**
```
workflows/orderProcessing/
├── schema.ts                 ← Workflow-specific schema
├── definition.ts             ← Workflow definition
├── api/                      ← Submodules for domain APIs
│   ├── orders.ts            ← Order operations
│   ├── items.ts             ← Item operations
│   ├── workItems.ts         ← Work queue operations
│   └── workflow.ts          ← Workflow control (version manager API)
├── domain/                   ← Domain services and helpers
│   ├── services/
│   │   ├── authorizationService.ts
│   │   └── orderViewService.ts
│   └── helpers.ts           ← Work item metadata helpers
└── workItems/                ← Work item definitions
    ├── itemReview.ts
    └── qualityApproval.ts
```

**This creates clean namespacing:**

```typescript
// Domain APIs are namespaced by module
api.workflows.orderProcessing.api.orders.listOrders
api.workflows.orderProcessing.api.items.listItems
api.workflows.orderProcessing.api.workItems.getWorkQueueTasks

// Workflow control from version manager
api.workflows.orderProcessing.api.workflow.initializeRootWorkflow
api.workflows.orderProcessing.api.workflow.startWorkItem
```

**Benefits:**
- ✅ No TypeScript "excessively deep" errors
- ✅ Clear module organization by domain concern
- ✅ Easy to find related API functions
- ✅ Scales well as API grows
- ✅ Follows standard module patterns

**What belongs in domain functions:**

Domain functions can range from simple data access wrappers to complex business logic, depending on your needs:

- **Always**: Database queries, inserts, updates, deletes
- **Often**: Business rule validation (e.g., "can't approve without reviewing first")
- **Sometimes**: Computed fields, aggregations, complex domain logic

**Context parameter (minimal responsibility principle):**

Start with minimal context and only escalate when needed:

1. **Read-only operations**: `ctx: { db: DatabaseReader }`
   ```typescript
   async getById(ctx: { db: DatabaseReader }, id: Id<'documents'>) {
     return await ctx.db.get(id)
   }
   ```

2. **Write operations**: `ctx: { db: DatabaseWriter }`
   ```typescript
   async create(ctx: { db: DatabaseWriter }, data: NewDocument) {
     return await ctx.db.insert('documents', data)
   }
   ```

3. **Needs scheduler**: `ctx: { db: DatabaseWriter; scheduler: Scheduler }`
   ```typescript
   async scheduleReminder(
     ctx: { db: DatabaseWriter; scheduler: Scheduler },
     documentId: Id<'documents'>,
   ) {
     const doc = await ctx.db.get(documentId)
     await ctx.scheduler.runAfter(86400000, api.sendReminder, { documentId })
   }
   ```

4. **Needs multiple Convex features**: `ctx: MutationCtx`
   ```typescript
   async complexOperation(ctx: MutationCtx, data: ComplexData) {
     // Uses db, scheduler, storage, etc.
   }
   ```

**Guideline**: Start with `{ db }` and only add what you need. This keeps domain functions focused and testable.

**Actions as boundaries:**

Workflow and work item actions are strongly-typed boundaries (like tRPC procedures):

- They validate input schemas (Zod)
- They can authorize users
- They are entry points to the system
- Most domain interactions should go through them

However, not everything needs to be a work item action. For example:

- Document review workflow → Create work items for approvals ✓
- Users commenting on the document → Use regular Convex mutations ✓ (no need for work items per comment)

#### 5. Data Access Rules

**Activities, actions, and route functions MUST use domain functions, NOT direct DB access.**

```typescript
// ❌ WRONG: Direct DB access in activities
const reviewTask = Builder.task(reviewWorkItem).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    // Direct DB access - hard to maintain, no business logic encapsulation
    const rfp = await mutationCtx.db
      .query('rfps')
      .withIndex('by_workflow', (q) => q.eq('workflowId', parent.workflow.id))
      .unique()

    await workItem.initialize({ rfpId: rfp._id })
  },
})

// ✅ RIGHT: Use domain functions
const reviewTask = Builder.task(reviewWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Domain function handles query logic and business rules
      const rfp = await RfpDomain.getByWorkflowId(
        mutationCtx,
        parent.workflow.id,
      )
      await workItem.initialize({ rfpId: rfp._id })
    },
  })

  // ❌ WRONG: Direct DB access in route function
  .connectTask('decide', (to) =>
    to
      .task('approve')
      .task('reject')
      .route(async ({ mutationCtx, route, parent }) => {
        const rfp = await mutationCtx.db
          .query('rfps')
          .withIndex('by_workflow', (q) =>
            q.eq('workflowId', parent.workflow.id),
          )
          .unique()

        return rfp.score > 80 ? route.toTask('approve') : route.toTask('reject')
      }),
  )

  // ✅ RIGHT: Use domain functions in routing
  .connectTask('decide', (to) =>
    to
      .task('approve')
      .task('reject')
      .route(async ({ mutationCtx, route, parent }) => {
        const rfp = await RfpDomain.getByWorkflowId(
          mutationCtx,
          parent.workflow.id,
        )
        return rfp.score > 80 ? route.toTask('approve') : route.toTask('reject')
      }),
  )
```

#### 6. Index Strategy

**Always index on workflowId and workItemId for efficient lookups.**

```typescript
// convex/workflows/rfp/schema.ts - Schema with proper indexes
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const rfps = defineTable({
  // ... fields
  workflowId: v.id('tasquencerWorkflows'),
}).index('by_workflow', ['workflowId']) // Essential!

const rfpSections = defineTable({
  // ... fields
  rfpId: v.id('rfps'),
  workflowId: v.optional(v.id('tasquencerWorkflows')), // Optional is fine
})
  .index('by_rfp', ['rfpId'])
  .index('by_workflow', ['workflowId']) // Convex indexes optional fields efficiently

const reviews = defineTable({
  // ... fields
  sectionId: v.id('rfpSections'),
  workItemId: v.id('tasquencerWorkItems'),
})
  .index('by_section', ['sectionId'])
  .index('by_work_item', ['workItemId']) // Essential!

export default {
  rfps,
  rfpSections,
  reviews,
}
```

**Why these indexes?**

- Activities frequently query domain data by workflowId/workItemId
- Without indexes, queries become O(n) scans
- Convex queries require indexes for efficient lookups
- Convex can index optional fields efficiently

**When to use optional workflowId:**

- **Prefer required** (`v.id('tasquencerWorkflows')`): When entity is always created via workflow actions
- **Use optional** (`v.optional(v.id('tasquencerWorkflows'))`): When entity can exist independently or be created outside workflows
- Ideally, everything goes through Tasquencer actions to avoid optional fields, but your mileage may vary

#### 7. Synchronization Boundaries

**Domain state syncs happen in activities and actions. Not all domain interactions need to go through workflows.**

```typescript
// Activities: Workflow state → Domain state
const reviewTask = Builder.task(reviewWorkItem).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    const rfp = await RfpDomain.getByWorkflowId(mutationCtx, parent.workflow.id)
    await workItem.initialize({ sectionId: rfp.sections[0]._id })
  },

  onWorkItemStateChanged: async ({ workItem, mutationCtx }) => {
    // Sync state changes to domain for the specific work item that changed
    if (workItem.nextState === 'completed') {
      await RfpDomain.updateApproval(mutationCtx, workItem.id, {
        status: 'completed',
      })
    }

    if (workItem.nextState === 'canceled') {
      await RfpDomain.updateApproval(mutationCtx, workItem.id, {
        status: 'canceled',
      })
    }
  },
})

// Actions: External input → Domain state → Workflow state
const reviewActions = Builder.workItemActions().complete(
  z.object({ approved: boolean; comments: string }),
  async ({ mutationCtx, workItem }, payload) => {
    // Update domain state using domain function
    await RfpDomain.updateApproval(mutationCtx, workItem.id, {
      comments: payload.comments,
      status: payload.approved ? 'approved' : 'rejected',
    })

    // Workflow state updated automatically by engine
  },
)

// Regular mutations for non-workflow operations
// Example: Users commenting on documents (no work item needed)
export const addComment = mutation({
  args: { documentId: v.id('documents'), comment: v.string() },
  handler: async (ctx, args) => {
    // Use domain function here too
    await DocumentDomain.addComment(ctx, {
      documentId: args.documentId,
      comment: args.comment,
      userId: await getAuthUserId(ctx),
    })
  },
})
```

**When to use actions vs regular mutations:**

- **Actions**: Workflow/work item lifecycle events (initialize, start, complete, fail, cancel)
- **Regular mutations**: Side operations that don't affect workflow state (comments, likes, file uploads, etc.)

**Important: Use domain state, not workflow state**

⚠️ **Critical rule**: Never inspect workflow state for business logic decisions. Always use domain state instead.

```typescript
// ❌ WRONG: Using workflow state for business logic
export const addCommentWrong = mutation({
  args: { documentId: v.id('documents'), comment: v.string() },
  handler: async (ctx, args) => {
    const doc = await DocumentDomain.getById(ctx, args.documentId)

    // ❌ Don't check workflow state for business decisions!
    const workflowState = await getWorkflowState(ctx.db, doc.workflowId)
    if (workflowState !== 'started') {
      throw new Error('Cannot comment - workflow is not active')
    }

    await DocumentDomain.addComment(ctx, { /* ... */ })
  },
})

// ✅ RIGHT: Use domain state for business logic
export const addComment = mutation({
  args: { documentId: v.id('documents'), comment: v.string() },
  handler: async (ctx, args) => {
    const doc = await DocumentDomain.getById(ctx, args.documentId)

    // ✅ Check domain state instead
    if (doc.status !== 'in_review') {
      throw new Error('Cannot comment - document is not in review')
    }

    await DocumentDomain.addComment(ctx, {
      documentId: args.documentId,
      comment: args.comment,
      userId: await getAuthUserId(ctx),
    })
  },
})
```

**Why?**

- Domain state (`doc.status`) is the source of truth for business rules
- Workflow state is orchestration state, not business state
- Mixing them creates tight coupling between orchestration and business logic
- Domain state should be updated in activities to stay synchronized

**The only exception: UI queries**

Workflow state helpers (`getWorkflowState`, `getWorkItemState`, `getWorkflowTaskStates`) should **only** be used in queries for UI display purposes:

```typescript
// ✅ EXCEPTION: UI queries can inspect workflow state
export const getDocumentForDisplay = query({
  args: { documentId: v.id('documents') },
  handler: async (ctx, args) => {
    const doc = await DocumentDomain.getById(ctx, args.documentId)

    // ✅ OK for UI: Show workflow progress
    const workflowState = await getWorkflowState(ctx.db, doc.workflowId)
    const taskStates = await getWorkflowTaskStates(ctx.db, {
      workflowName: 'documentReview',
      workflowId: doc.workflowId,
    })

    return {
      doc,
      workflowState, // UI: progress bar, status badges
      taskStates, // UI: enable/disable action buttons
    }
  },
})
```

#### 8. Root Workflow ID Pattern

**When working with nested workflows, you often need to filter domain data by the root workflow, not the current subworkflow.**

Tasquencer provides built-in helpers for this common pattern. Export them from your tasquencer setup file:

```typescript
// convex/tasquencer.ts
import type { DataModel } from "./_generated/dataModel";
import { Tasquencer } from "@repo/tasquencer";
import { components } from "./_generated/api";

export const { Builder, Authorization, versionManagerFor, helpers } =
  Tasquencer.initialize<DataModel>(
    components.tasquencerAudit,
    components.tasquencerAuthorization
  ).build();
```

**Available helpers:**

- `helpers.getRootWorkflowId(db, workflowId)` - Get root workflow ID from a workflow
- `helpers.getRootWorkflowIdForWorkItem(db, workItemId)` - Get root workflow ID from a work item
- `helpers.getWorkflowIdForWorkItem(db, workItemId)` - Get direct parent workflow ID for a work item

```typescript
// Usage: Query aggregate root from nested workflow
import { helpers } from "../../../tasquencer";

export async function getPatientByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<"tasquencerWorkflows">
): Promise<Doc<"patients"> | null> {
  const rootWorkflowId = await helpers.getRootWorkflowId(db, workflowId);
  return await db
    .query("patients")
    .withIndex("by_workflow_id", (q) => q.eq("workflowId", rootWorkflowId))
    .unique();
}
```

**Why this matters:**

```
Root Workflow (ER Patient Journey) - workflowId: wf_root
  ├─ Task: Diagnostics
  │   └─ Composite Task: Run Tests
  │       └─ Sub-workflow: Blood Test - workflowId: wf_sub1
  │           └─ Task: Collect Sample
  │               └─ Work Item: wi_123
  └─ Task: Treatment
      └─ Work Item: wi_456
```

**Problem without root workflow pattern:**

```typescript
// ❌ Wrong: Queries for patient using sub-workflow ID
const bloodTestTask = Builder.task(collectSampleWorkItem).withActivities({
  onEnabled: async ({ mutationCtx, workItem, parent }) => {
    // parent.workflow.id is wf_sub1 (blood test subworkflow)
    // This query will FAIL - patient is linked to wf_root, not wf_sub1
    const patient = await mutationCtx.db
      .query('patients')
      .withIndex('by_workflow_id', (q) =>
        q.eq('workflowId', parent.workflow.id),
      ) // wf_sub1 ❌
      .unique()

    // patient is null! 😱
  },
})
```

**Solution with root workflow pattern:**

```typescript
// ✅ Correct: Use built-in helper
const bloodTestTask = Builder.task(collectSampleWorkItem).withActivities({
  onEnabled: async ({ mutationCtx, workItem, parent }) => {
    // Get patient using helper (works for both root and nested workflows)
    const patient = await getPatientByWorkflowId(
      mutationCtx.db,
      parent.workflow.id,
    )
    // getPatientByWorkflowId uses helpers.getRootWorkflowId() internally ✅

    await workItem.initialize({ patientId: patient._id })
  },
})
```

**Best practice: Bake root workflow lookup into domain functions**

```typescript
import { helpers } from "../../../tasquencer";

// ✅ Domain functions use built-in helpers internally
export async function getPatientByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<"tasquencerWorkflows">
): Promise<Doc<"patients">> {
  const rootWorkflowId = await helpers.getRootWorkflowId(db, workflowId);
  const patient = await db
    .query("patients")
    .withIndex("by_workflow_id", (q) => q.eq("workflowId", rootWorkflowId))
    .unique();

  if (!patient) {
    throw new Error("Patient not found");
  }

  return patient;
}

// Usage: No need to think about root vs nested
const myTask = Builder.task(myWorkItem).withActivities({
  onEnabled: async ({ mutationCtx, parent }) => {
    // Works for any workflow depth!
    const patient = await getPatientByWorkflowId(
      mutationCtx.db,
      parent.workflow.id,
    )
  },
})
```

**When to use root workflow ID:**

- ✅ Querying aggregate roots (e.g., patients, orders, RFPs)
- ✅ Filtering domain data across nested workflows
- ✅ Building work queues that span entire workflow hierarchies

**When to use current workflow ID:**

- ✅ Querying child entities specific to the current subworkflow
- ✅ Creating 1:1 relationships with subworkflows (e.g., section → section review subworkflow)

#### 9. Domain Services for State Transitions

**For complex state transitions that affect multiple entities, use domain services instead of putting logic in activities.**

**Problem: Complex state transition in activity**

```typescript
// ❌ Bad: Complex multi-entity update in activity
const dischargeTask = Builder.task(dischargeWorkItem).withActivities({
  onWorkItemStateChanged: async ({ mutationCtx, workItem }) => {
    if (workItem.nextState === 'completed') {
      // Too much logic in activity! 😱
      const patient = await ctx.db.get(workItem.payload.patientId)
      await ctx.db.patch(patient._id, { status: 'discharged' })

      const admission = await ctx.db
        .query('admissions')
        .withIndex('by_patient', (q) => q.eq('patientId', patient._id))
        .unique()
      await ctx.db.patch(admission._id, {
        dischargedAt: Date.now(),
        status: 'closed',
      })

      // Send notification
      await ctx.scheduler.runAfter(0, internal.notifications.send, {
        patientId: patient._id,
        type: 'discharge_complete',
      })
    }
  },
})
```

**Solution: Extract to domain service**

```typescript
// ✅ Good: Domain service coordinates state transition
export const PatientStatusService = {
  async dischargePatient(
    ctx: { db: DatabaseWriter; scheduler: Scheduler },
    patientId: Id<'patients'>,
  ): Promise<void> {
    // 1. Get entities
    const patient = await ctx.db.get(patientId)
    if (!patient) {
      throw new EntityNotFoundError('Patient', { patientId })
    }

    const admission = await ctx.db
      .query('admissions')
      .withIndex('by_patient', (q) => q.eq('patientId', patientId))
      .unique()

    if (!admission) {
      throw new EntityNotFoundError('Admission', { patientId })
    }

    // 2. Update patient
    await ctx.db.patch(patient._id, { status: 'discharged' })

    // 3. Update admission
    await ctx.db.patch(admission._id, {
      dischargedAt: Date.now(),
      status: 'closed',
    })

    // 4. Schedule notification
    await ctx.scheduler.runAfter(0, internal.notifications.send, {
      patientId: patient._id,
      type: 'discharge_complete',
    })
  },
}

// Activity becomes simple
const dischargeTask = Builder.task(dischargeWorkItem).withActivities({
  onWorkItemStateChanged: async ({ mutationCtx, workItem }) => {
    if (workItem.nextState === 'completed') {
      // One line! 🎉
      await PatientStatusService.dischargePatient(
        mutationCtx,
        workItem.payload.patientId,
      )
    }
  },
})
```

**When to use domain services:**

- ✅ State transitions affecting multiple entities
- ✅ Complex business logic with multiple steps
- ✅ Logic that needs to be reused across multiple activities/actions
- ✅ Operations that coordinate external side effects (notifications, webhooks)

**When to use simple domain functions:**

- ✅ Single-entity CRUD operations
- ✅ Simple queries
- ✅ Straightforward data transformations

**Real-world example from ER workflow:**

```typescript
// convex/workflows/er/domain/services/statusTransitionService.ts
export const StatusTransitionService = {
  async transitionToAwaitingDischarge(
    ctx: { db: DatabaseWriter },
    patientId: Id<'patients'>,
  ): Promise<void> {
    // Get patient
    const patient = await ctx.db.get(patientId)
    assertPatientExists(patient, patientId)

    // Get admission
    const admission = await ctx.db
      .query('admissions')
      .withIndex('by_patient', (q) => q.eq('patientId', patientId))
      .unique()
    assertAdmissionExists(admission, patientId)

    // Update both
    await ctx.db.patch(patient._id, { status: 'awaiting_discharge' })
    await ctx.db.patch(admission._id, { status: 'ready_for_discharge' })
  },
}
```

#### 10. Shared Helper Functions

**Extract common patterns into shared helper functions to reduce boilerplate.**

**Pattern: Authentication + Claim + Start**

Instead of repeating auth/claim logic in every work item:

```typescript
// convex/workflows/myWorkflow/workItems/helpers.ts

export async function startAndClaimWorkItem(
  mutationCtx: MutationCtx,
  workItem: { id: Id<'tasquencerWorkItems'>; start: () => Promise<void> },
): Promise<void> {
  const authUser = await authComponent.safeGetAuthUser(mutationCtx)
  assertAuthenticatedUser(authUser, {
    operation: 'startAndClaimWorkItem',
    workItemId: workItem.id,
  })

  const userId = authUser.userId as Id<'users'>
  await MyWorkItemHelpers.claimWorkItem(mutationCtx.db, workItem.id, userId)
  await workItem.start()
}

// Usage in every work item
const myWorkItem = Builder.workItem()
  .start(async ({ mutationCtx, workItem }) => {
    await startAndClaimWorkItem(mutationCtx, workItem)
  })
```

**Pattern: Workflow-specific metadata initialization**

```typescript
// convex/workflows/myWorkflow/workItems/helpers.ts

export async function initializeMyWorkflowMetadata(
  mutationCtx: MutationCtx,
  workItemId: Id<'tasquencerWorkItems'>,
  config: {
    role: MyWorkflowRole
    group: MyWorkflowGroup
    taskName: string
    priority: 'routine' | 'urgent' | 'critical'
    aggregateId: Id<'myDomainTable'>
  },
): Promise<void> {
  const groupId = await getGroupByName(mutationCtx, config.group)

  await mutationCtx.db.insert('myWorkflowWorkItems', {
    workItemId,
    workflowName: 'myWorkflow', // Baked in!
    offer: {
      type: 'human',
      requiredScope: config.scope,
      requiredGroupId: groupId,
    },
    aggregateTableId: config.aggregateId,
    payload: {
      taskName: config.taskName,
      priority: config.priority,
    },
  })
}
```

**Benefits:**

- Single source of truth for workflow name
- Type-safe role/group references
- One line of code per task
- Easy to update all tasks when patterns change

**See also:** [Work Item Patterns](./WORK_ITEM_PATTERNS.md) for more helper function patterns.

#### 11. Performance & Indexing

**Critical: Always index workflow and work item relationships.**

```typescript
// ✅ Good: Proper indexes (convex/workflows/er/schema.ts)
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const patients = defineTable({
  name: v.string(),
  status: v.string(),
  workflowId: v.id('tasquencerWorkflows'), // Required
}).index('by_workflow_id', ['workflowId']) // Essential! ⚡

const admissions = defineTable({
  patientId: v.id('patients'),
  status: v.string(),
  workflowId: v.optional(v.id('tasquencerWorkflows')), // Optional OK
})
  .index('by_patient', ['patientId'])
  .index('by_workflow_id', ['workflowId']) // Convex handles optional efficiently ⚡

const humanTasks = defineTable({
  workItemId: v.id('tasquencerWorkItems'), // Required
  taskType: v.string(),
  status: v.string(),
}).index('by_work_item', ['workItemId']) // Essential! ⚡

export default {
  patients,
  admissions,
  humanTasks,
}

// ❌ Bad: Missing indexes
const patientsWrong = defineTable({
  name: v.string(),
  workflowId: v.id('tasquencerWorkflows'),
  // ❌ No index - O(n) scans! 🐌
})
```

**Index strategy:**

1. **by_workflow_id** on aggregate roots and child entities
2. **by_work_item** on work item data tables
3. Convex can efficiently index optional fields - use them when entities can exist independently

**Performance considerations:**

- Activities query domain data on every state transition
- Without indexes, queries become full table scans (O(n))
- With indexes, queries are constant time (O(1))
- Index all foreign keys to workflows and work items

**Compound indexes for filtering:**

```typescript
// For work queues filtered by state + workflow
humanTasks: defineTable({
  workItemId: v.id('tasquencerWorkItems'),
  status: v.string(),
  priority: v.string(),
})
  .index('by_work_item', ['workItemId'])
  .index('by_status_priority', ['status', 'priority']), // Compound index
```

### Complete Example

```typescript
// 1. Domain schema (convex/workflows/discovery/schema.ts)
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const discoveryProjects = defineTable({
  clientName: v.string(),
  status: v.string(),
  workflowId: v.id('tasquencerWorkflows'),
}).index('by_workflow', ['workflowId'])

const workshops = defineTable({
  projectId: v.id('discoveryProjects'),
  topic: v.string(),
  workflowId: v.id('tasquencerWorkflows'),
})
  .index('by_project', ['projectId'])
  .index('by_workflow', ['workflowId'])

const facilitationNotes = defineTable({
  workshopId: v.id('workshops'),
  workItemId: v.id('tasquencerWorkItems'),
  notes: v.string(),
})
  .index('by_workshop', ['workshopId'])
  .index('by_work_item', ['workItemId'])

export default {
  discoveryProjects,
  workshops,
  facilitationNotes,
}

// 2. Domain functions (convex/workflows/discovery/domain/index.ts)
export const DiscoveryDomain = {
  async createProject(
    ctx: { db: DatabaseWriter },
    data: { clientName: string; workflowId: Id<'tasquencerWorkflows'> },
  ) {
    return await ctx.db.insert('discoveryProjects', {
      clientName: data.clientName,
      status: 'planning',
      workflowId: data.workflowId,
    })
  },

  async getProjectByWorkflowId(
    ctx: { db: DatabaseReader },
    workflowId: Id<'tasquencerWorkflows'>,
  ) {
    const project = await ctx.db
      .query('discoveryProjects')
      .withIndex('by_workflow', (q) => q.eq('workflowId', workflowId))
      .unique()
    if (!project) throw new Error('Project not found')
    return project
  },

  async createWorkshop(
    ctx: { db: DatabaseWriter },
    data: {
      projectId: Id<'discoveryProjects'>
      topic: string
      workflowId: Id<'tasquencerWorkflows'>
    },
  ) {
    return await ctx.db.insert('workshops', data)
  },

  async createFacilitationNotes(
    ctx: { db: DatabaseWriter },
    data: {
      workshopId: Id<'workshops'>
      workItemId: Id<'tasquencerWorkItems'>
      notes: string
    },
  ) {
    return await ctx.db.insert('facilitationNotes', data)
  },
}

// 3. Workflows with domain integration
const workshopWorkflow = Builder.workflow('workshop').withActions(
  Builder.workflowActions().initialize(
    z.object({ projectId: v.id('discoveryProjects'), topic: v.string() }),
    async ({ mutationCtx, workflow }, payload) => {
      const workflowId = await workflow.initialize()
      await DiscoveryDomain.createWorkshop(mutationCtx, {
        projectId: payload.projectId,
        topic: payload.topic,
        workflowId,
      })
    },
  ),
)

const facilitateWorkItem = Builder.workItem('facilitate').withActions(
  Builder.workItemActions().initialize(
    z.object({ workshopId: v.id('workshops') }),
    async ({ mutationCtx, workItem }, payload) => {
      const workItemId = await workItem.initialize()
      await DiscoveryDomain.createFacilitationNotes(mutationCtx, {
        workshopId: payload.workshopId,
        workItemId,
        notes: '',
      })
    },
  ),
)

const discoveryWorkflow = Builder.workflow('discovery').compositeTask(
  'workshops',
  Builder.compositeTask(workshopWorkflow).withActivities({
    onEnabled: async ({ workflow, mutationCtx, parent }) => {
      // Use domain function to get aggregate root
      const project = await DiscoveryDomain.getProjectByWorkflowId(
        mutationCtx,
        parent.workflow.id,
      )

      // Initialize subworkflows for planned workshops
      const topics = ['User Research', 'Design Sprint', 'Technical Review']
      for (const topic of topics) {
        await workflow.initialize({
          projectId: project._id,
          topic,
        })
      }
    },
  }),
)
```

### Key Takeaways

✅ **Do:**

- Model workflows 1:1 with aggregate roots
- Model subworkflows 1:1 with child entities
- Always use domain functions for data access (including in actions, activities, and route functions)
- Index on workflowId and workItemId
- Sync state in activities and actions
- Use lightweight DDD for domain layer
- Use actions as strongly-typed entry points (like tRPC procedures)
- Use regular mutations for side operations that don't affect workflow state
- Let unrecoverable exceptions bubble up (Convex will abort the transaction)
- **Use domain state for business logic decisions (e.g., `rfp.status`)**
- **UI queries can use `getWorkflowState`/`getWorkItemState`/`getWorkflowTaskStates` for display only**

❌ **Don't:**

- Access database directly from activities/actions/route functions
- Store workflow state in domain tables
- Skip indexing workflow/work item relationships
- Mix orchestration logic with domain logic
- Create work items for every domain operation (e.g., comments on documents)
- **Inspect workflow state for business logic in mutations (use domain state instead)**
- **Create workflows with multiple start or end conditions (YAWL requires exactly one of each)**

---
