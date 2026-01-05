# Workflow State in User Interfaces

> **Prerequisites**: [Core Concepts](./CORE_CONCEPTS.md), [Domain Modeling](./DOMAIN_MODELING.md)
> **Related**: [Recipes - Building UIs](./RECIPES.md#building-user-interfaces)

This guide explains when and how to use workflow state in user interfaces, and clarifies the crucial distinction between workflow state (for display) and domain state (for business logic).

## Table of Contents

- [Overview](#overview)
- [Key Principle: Workflow State vs Domain State](#key-principle-workflow-state-vs-domain-state)
- [When to Use Workflow State](#when-to-use-workflow-state)
- [When to Use Domain State](#when-to-use-domain-state)
- [Decision Tree](#decision-tree)
- [Common Patterns](#common-patterns)
- [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
- [Understanding Multiple Active Tasks](#understanding-multiple-active-tasks)
- [Best Practices](#best-practices)

---

## Overview

Tasquencer separates two types of state:

1. **Workflow State**: Orchestration state managed by the engine (task states, work item states, condition markings)
2. **Domain State**: Business data managed by your domain tables (patient status, order payment status, etc.)

**The golden rule**: Use workflow state for UI display, use domain state for business logic.

---

## Key Principle: Workflow State vs Domain State

### Workflow State (Orchestration)

**What it is**: The current state of tasks, work items, and conditions in your workflow execution.

**Examples**:
- Task states: `disabled`, `enabled`, `started`, `completed`, `failed`, `canceled`
- Work item states: `initialized`, `started`, `completed`, `failed`, `canceled`
- Condition markings: Internal workflow flow state

**Purpose**: Coordinate work items, manage dependencies, track workflow progress

**NOT for**: Business logic decisions, validation rules, domain constraints

---

### Domain State (Business Data)

**What it is**: Your application's business data stored in domain tables.

**Examples**:
- `patient.status: 'admitted' | 'discharged'`
- `order.paymentStatus: 'pending' | 'paid' | 'refunded'`
- `rfp.approvalLevel: 'draft' | 'legal_approved' | 'final_approved'`

**Purpose**: Business rules, validation, domain logic, user permissions

**Synchronized with workflow**: Activities update domain state when workflow state changes

---

## When to Use Workflow State

**ONLY in UI queries for display purposes:**

### ✅ Acceptable Use Case 1: Progress Indicators

Show workflow progress to users:

```typescript
export const getDocumentProgress = query({
  args: { documentId: v.id('documents') },
  handler: async (ctx, args) => {
    const doc = await DocumentDomain.getById(ctx, args.documentId)

    // ✅ OK: Query workflow state for UI display
    const taskStates = await getWorkflowTaskStates(ctx.db, {
      workflowName: 'documentApproval',
      workflowId: doc.workflowId,
    })

    return {
      document: doc,
      taskStates, // UI: render progress bar, status badges
    }
  },
})
```

**UI component**:
```typescript
function DocumentProgress({ taskStates }) {
  return (
    <ProgressBar>
      <Step completed={taskStates.draft === 'completed'}>Draft</Step>
      <Step active={taskStates.review === 'started'}>Review</Step>
      <Step pending={taskStates.approve === 'disabled'}>Approve</Step>
    </ProgressBar>
  )
}
```

---

### ✅ Acceptable Use Case 2: Conditional UI Rendering

Enable/disable buttons based on task states:

```typescript
export const getRfpForDisplay = query({
  args: { rfpId: v.id('rfps') },
  handler: async (ctx, args) => {
    const rfp = await RfpDomain.getById(ctx, args.rfpId)

    // ✅ OK: Query task states for button state
    const taskStates = await getWorkflowTaskStates(ctx.db, {
      workflowName: 'rfp',
      workflowId: rfp.workflowId,
    })

    return { rfp, taskStates }
  },
})
```

**UI component**:
```typescript
function RfpActions({ rfp, taskStates }) {
  return (
    <div>
      {/* ✅ OK: Use task state to show/hide buttons */}
      {taskStates.legalReview === 'enabled' && (
        <Button onClick={() => navigate('/rfp/legal-review')}>
          Start Legal Review
        </Button>
      )}

      {taskStates.publish === 'completed' && (
        <Badge>Published</Badge>
      )}
    </div>
  )
}
```

---

### ✅ Acceptable Use Case 3: Workflow Status Badges

Show overall workflow state:

```typescript
export const listDocuments = query({
  handler: async (ctx) => {
    const docs = await ctx.db.query('documents').collect()

    return await Promise.all(
      docs.map(async (doc) => {
        // ✅ OK: Get workflow state for status badge
        const workflowState = await getWorkflowState(ctx.db, doc.workflowId)

        return {
          ...doc,
          workflowState, // UI: display badge color
        }
      })
    )
  },
})
```

**UI component**:
```typescript
function DocumentList({ documents }) {
  return (
    <Table>
      {documents.map(doc => (
        <TableRow key={doc._id}>
          <TableCell>{doc.title}</TableCell>
          <TableCell>
            {/* ✅ OK: Use workflow state for visual indicator */}
            <Badge variant={doc.workflowState === 'completed' ? 'success' : 'warning'}>
              {doc.workflowState}
            </Badge>
          </TableCell>
        </TableRow>
      ))}
    </Table>
  )
}
```

---

## When to Use Domain State

**ALWAYS for business logic, validation, and domain decisions:**

### ✅ Correct: Domain State for Business Rules

```typescript
export const addComment = mutation({
  args: { documentId: v.id('documents'), comment: v.string() },
  handler: async (ctx, args) => {
    const doc = await DocumentDomain.getById(ctx, args.documentId)

    // ✅ RIGHT: Use domain state for business rule
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

---

### ✅ Correct: Domain State for Permissions

```typescript
export const editDocument = mutation({
  args: { documentId: v.id('documents'), content: v.string() },
  handler: async (ctx, args) => {
    const doc = await DocumentDomain.getById(ctx, args.documentId)
    const userId = await getAuthUserId(ctx)

    // ✅ RIGHT: Use domain state for permission check
    if (doc.status === 'published') {
      throw new Error('Cannot edit published documents')
    }

    if (doc.authorId !== userId) {
      throw new Error('Only the author can edit this document')
    }

    await DocumentDomain.updateContent(ctx, args.documentId, args.content)
  },
})
```

---

### ✅ Correct: Domain State for Validation

```typescript
export const submitOrder = mutation({
  args: { orderId: v.id('orders') },
  handler: async (ctx, args) => {
    const order = await OrderDomain.getById(ctx, args.orderId)

    // ✅ RIGHT: Use domain state for validation
    if (order.paymentStatus !== 'paid') {
      throw new Error('Order must be paid before submission')
    }

    if (order.items.length === 0) {
      throw new Error('Order must have at least one item')
    }

    await OrderDomain.markAsSubmitted(ctx, args.orderId)
  },
})
```

---

## Decision Tree

Use this decision tree to determine which state to use:

```
Question: Where is this code running?
│
├─ In a UI query (for display only)
│  │
│  ├─ Showing progress/status? → Workflow State ✓
│  ├─ Enabling/disabling buttons? → Workflow State ✓
│  └─ Displaying workflow badges? → Workflow State ✓
│
└─ In a mutation (business logic)
   │
   ├─ Validation rule? → Domain State ✓
   ├─ Permission check? → Domain State ✓
   ├─ Business rule? → Domain State ✓
   └─ Domain constraint? → Domain State ✓
```

**Simple rule**:
- **Display? → Workflow State**
- **Logic? → Domain State**

---

## Common Patterns

### Pattern 1: Query Combining Both States

```typescript
export const getOrderDetails = query({
  args: { orderId: v.id('orders') },
  handler: async (ctx, args) => {
    // Domain state (source of truth)
    const order = await OrderDomain.getById(ctx, args.orderId)

    // Workflow state (for UI display)
    const taskStates = await getWorkflowTaskStates(ctx.db, {
      workflowName: 'orderFulfillment',
      workflowId: order.workflowId,
    })

    return {
      order, // UI: display order details, use for business decisions
      taskStates, // UI: show progress, enable/disable actions
    }
  },
})
```

**Usage in UI**:
```typescript
function OrderDetails({ order, taskStates }) {
  return (
    <div>
      {/* Domain state: business data */}
      <div>Payment Status: {order.paymentStatus}</div>
      <div>Total: ${order.total}</div>

      {/* Workflow state: progress display */}
      <WorkflowProgress taskStates={taskStates} />

      {/* Workflow state: conditional rendering */}
      {taskStates.shipping === 'enabled' && (
        <Button>Ship Order</Button>
      )}

      {/* Domain state: business rule */}
      {order.paymentStatus === 'paid' && (
        <Badge>Paid</Badge>
      )}
    </div>
  )
}
```

---

### Pattern 2: Sync Domain State in Work Item Actions

Workflow state changes trigger domain state updates. The preferred approach is to sync domain state directly in work item actions (`.start()` and `.complete()` handlers):

```typescript
// ✅ Preferred: Sync domain state in work item actions
const approvalWorkItemActions = Builder.workItemActions()
  .complete(
    z.object({ approved: z.boolean() }),
    async ({ mutationCtx, parent }, payload) => {
      const doc = await DocumentDomain.getByWorkflowId(mutationCtx, parent.workflow.id)

      // ✅ Update domain state when work item completes
      await DocumentDomain.updateStatus(
        mutationCtx,
        doc._id,
        payload.approved ? 'approved' : 'rejected'
      )
    }
  )
```

> **Note**: The `onWorkItemStateChanged` task activity callback exists for advanced use cases:
> - Dynamically initializing additional work items based on outcomes
> - Starting subworkflows when certain conditions are met
> - The callback runs before task state transitions when all children complete, giving you a chance to initialize new children if needed

---

## Anti-Patterns to Avoid

### ❌ Anti-Pattern 1: Using Workflow State for Business Logic

```typescript
// ❌ WRONG: Checking workflow state in mutation
export const addComment = mutation({
  args: { documentId: v.id('documents'), comment: v.string() },
  handler: async (ctx, args) => {
    const doc = await DocumentDomain.getById(ctx, args.documentId)

    // ❌ DON'T: Use workflow state for business decisions!
    const workflowState = await getWorkflowState(ctx.db, doc.workflowId)
    if (workflowState !== 'started') {
      throw new Error('Workflow must be started')
    }

    await DocumentDomain.addComment(ctx, args)
  },
})
```

**Why it's wrong**:
- Tight coupling between orchestration and business logic
- Domain state (`doc.status`) is the source of truth
- Workflow state can change independently of business rules
- Makes testing and maintenance harder

**Fix**:
```typescript
// ✅ RIGHT: Use domain state
export const addComment = mutation({
  args: { documentId: v.id('documents'), comment: v.string() },
  handler: async (ctx, args) => {
    const doc = await DocumentDomain.getById(ctx, args.documentId)

    // ✅ Use domain state for business rule
    if (doc.status !== 'in_review') {
      throw new Error('Document must be in review to add comments')
    }

    await DocumentDomain.addComment(ctx, args)
  },
})
```

---

### ❌ Anti-Pattern 2: Storing Workflow State in Domain Tables

```typescript
// ❌ WRONG: Duplicating workflow state in domain table
const approvalTask = Builder.task(approvalWorkItem).withActivities({
  onStarted: async ({ mutationCtx, parent }) => {
    const doc = await DocumentDomain.getByWorkflowId(mutationCtx, parent.workflow.id)

    // ❌ DON'T: Store workflow state in domain table
    await ctx.db.patch(doc._id, {
      currentWorkflowTask: 'approval', // Duplicates workflow state!
      workflowTaskState: 'started', // Duplicates workflow state!
    })
  },
})
```

**Why it's wrong**:
- Data duplication (workflow state already tracked by engine)
- Can get out of sync
- Unnecessary boilerplate in every activity

**Fix**:
```typescript
// ✅ RIGHT: Update domain state only
const approvalTask = Builder.task(approvalWorkItem).withActivities({
  onStarted: async ({ mutationCtx, parent }) => {
    const doc = await DocumentDomain.getByWorkflowId(mutationCtx, parent.workflow.id)

    // ✅ Update domain state (business meaning)
    await DocumentDomain.updateStatus(mutationCtx, doc._id, 'pending_approval')
  },

  onCompleted: async ({ mutationCtx, parent }) => {
    const doc = await DocumentDomain.getByWorkflowId(mutationCtx, parent.workflow.id)
    await DocumentDomain.updateStatus(mutationCtx, doc._id, 'approved')
  },
})
```

**Query workflow state when needed for UI**:
```typescript
export const getDocumentForDisplay = query({
  args: { documentId: v.id('documents') },
  handler: async (ctx, args) => {
    const doc = await DocumentDomain.getById(ctx, args.documentId)

    // ✅ Query workflow state on-demand for UI
    const taskStates = await getWorkflowTaskStates(ctx.db, {
      workflowName: 'documentApproval',
      workflowId: doc.workflowId,
    })

    return { doc, taskStates }
  },
})
```

---

## Understanding Multiple Active Tasks

**Critical concept**: Tasquencer workflows are NOT simple state machines. Multiple tasks can be in the `started` state simultaneously.

### Example: Parallel Reviews

```typescript
const rfpWorkflow = Builder.workflow('rfp')
  .startCondition('start')
  .task('draft', draftTask)
  .task('legalReview', legalReviewTask)
  .task('securityReview', securityReviewTask)
  .task('techReview', techReviewTask)
  .task('finalApproval', finalApprovalTask.withJoinType('and'))
  .endCondition('end')
  .connectCondition('start', to => to.task('draft'))
  .connectTask('draft', to =>
    to
      .task('legalReview')
      .task('securityReview')
      .task('techReview')
  )
  .connectTask('legalReview', to => to.task('finalApproval'))
  .connectTask('securityReview', to => to.task('finalApproval'))
  .connectTask('techReview', to => to.task('finalApproval'))
  .connectTask('finalApproval', to => to.condition('end'))
```

**At one point in time, task states could be**:
```typescript
{
  draft: 'completed',
  legalReview: 'started',     // ← Active
  securityReview: 'started',  // ← Active
  techReview: 'started',      // ← Active
  finalApproval: 'disabled',  // ← Waiting for all reviews (AND join)
}
```

**Three tasks are `started` simultaneously!**

### Implications for UI

**Don't assume only one task is active**:

```typescript
// ❌ WRONG: Assumes single active task
function WorkflowStatus({ taskStates }) {
  const activeTask = Object.entries(taskStates)
    .find(([name, state]) => state === 'started')

  return <div>Current step: {activeTask[0]}</div>
}
```

**Instead, handle multiple active tasks**:

```typescript
// ✅ RIGHT: Handle multiple active tasks
function WorkflowStatus({ taskStates }) {
  const activeTasks = Object.entries(taskStates)
    .filter(([name, state]) => state === 'started')
    .map(([name]) => name)

  if (activeTasks.length === 0) {
    return <div>No active tasks</div>
  }

  if (activeTasks.length === 1) {
    return <div>Current step: {activeTasks[0]}</div>
  }

  return (
    <div>
      Active tasks:
      <ul>
        {activeTasks.map(task => <li key={task}>{task}</li>)}
      </ul>
    </div>
  )
}
```

---

### Work Items May Not Exist Yet

**Another key point**: You can query task states even when work items haven't been initialized yet.

```typescript
export const getRfpDisplay = query({
  args: { rfpId: v.id('rfps') },
  handler: async (ctx, args) => {
    const rfp = await RfpDomain.getById(ctx, args.rfpId)

    // ✅ Works even if work items don't exist yet
    const taskStates = await getWorkflowTaskStates(ctx.db, {
      workflowName: 'rfp',
      workflowId: rfp.workflowId,
    })

    return { rfp, taskStates }
  },
})
```

**Task states show the workflow structure**, not work item existence:
- `disabled`: Task exists but not yet enabled
- `enabled`: Task is enabled (may or may not have work items yet)
- `started`: Task has started (work items exist and at least one is started)

---

## Best Practices

### 1. Sync Domain State in Work Item Actions

Always update domain state when workflow state changes. Use work item action handlers:

```typescript
// ✅ Sync domain state in work item complete handler
const myWorkItemActions = Builder.workItemActions()
  .complete(
    z.any(),
    async ({ mutationCtx, parent }) => {
      const entity = await MyDomain.getByWorkflowId(mutationCtx, parent.workflow.id)
      await MyDomain.updateStatus(mutationCtx, entity._id, 'completed')
    }
  )
```

---

### 2. Query Both States in UI Queries

Provide both domain and workflow state for complete UI context:

```typescript
export const getEntityDisplay = query({
  args: { entityId: v.id('entities') },
  handler: async (ctx, args) => {
    const entity = await MyDomain.getById(ctx, args.entityId)
    const taskStates = await getWorkflowTaskStates(ctx.db, {
      workflowName: 'myWorkflow',
      workflowId: entity.workflowId,
    })

    return {
      entity,      // Domain state
      taskStates,  // Workflow state
    }
  },
})
```

---

### 3. Use Domain State for Authorization

Never use workflow state for permission checks:

```typescript
// ❌ WRONG
if (workflowState === 'started') {
  // Allow edit
}

// ✅ RIGHT
if (entity.status === 'draft' && entity.authorId === userId) {
  // Allow edit
}
```

---

### 4. Use Descriptive Domain State Values

Map workflow states to meaningful domain states:

```typescript
// ❌ Vague
doc.status = 'processing'

// ✅ Clear business meaning
doc.status = 'pending_legal_review'
doc.status = 'approved_awaiting_publish'
```

---

### 5. Document Which State Drives What

Add comments clarifying state usage:

```typescript
export const getDocument = query({
  handler: async (ctx, args) => {
    const doc = await DocumentDomain.getById(ctx, args.documentId)

    // Workflow state: UI progress/actions only
    const taskStates = await getWorkflowTaskStates(ctx.db, {
      workflowName: 'documentApproval',
      workflowId: doc.workflowId,
    })

    return {
      doc,        // Domain state: business rules, permissions
      taskStates, // Workflow state: UI display only
    }
  },
})
```

---

## Summary

| Use Case | Use Workflow State | Use Domain State |
|----------|-------------------|------------------|
| UI progress bars | ✅ Yes | ❌ No |
| UI status badges | ✅ Yes | ❌ No |
| Enable/disable buttons | ✅ Yes | ❌ No |
| Business validation | ❌ No | ✅ Yes |
| Permission checks | ❌ No | ✅ Yes |
| Domain rules | ❌ No | ✅ Yes |
| Mutation logic | ❌ No | ✅ Yes |
| Query for display | ✅ Yes | ✅ Yes (both) |

**Remember**:
- **Workflow state = orchestration** (how work flows)
- **Domain state = business data** (what the work means)
- **UI queries can use both**
- **Mutations must use domain state only**

---

## See Also

- [Domain Modeling](./DOMAIN_MODELING.md) - Domain state patterns
- [Core Concepts](./CORE_CONCEPTS.md) - Workflow fundamentals
- [Recipes - Building UIs](./RECIPES.md#building-user-interfaces) - Complete UI examples
- [Glossary](./GLOSSARY.md) - Terminology reference
