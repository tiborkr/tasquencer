# Recipe: Multiple Work Items per Task

> **Prerequisites**: [Advanced Workflows](../WORKFLOWS_ADVANCED.md)
> **Related**: [Failure Policies](./failure-policies.md) | [Dynamic Work Items](./dynamic-work-items.md)

This recipe demonstrates how a single task can create multiple work items that must all complete before the task completes. This is useful for batch processing where the number of items is known when the task is enabled.

**Problem**: Generate monthly invoices for all customers with outstanding balances. A single "generate invoices" task should create one work item per customer, process them in parallel, and complete when all invoices are generated.

```typescript
// Domain functions
const InvoiceDomain = {
  async getCustomersNeedingInvoice(
    ctx: { db: DatabaseReader },
    workflowId: Id<'tasquencerWorkflows'>,
  ) {
    // Get the billing period from the workflow
    const billingRun = await ctx.db
      .query('billingRuns')
      .withIndex('by_workflow', (q) => q.eq('workflowId', workflowId))
      .first()

    // Find all customers with outstanding balance
    return await ctx.db
      .query('customers')
      .filter((q) => q.gt(q.field('balance'), 0))
      .collect()
  },

  async generateInvoice(
    ctx: { db: DatabaseWriter },
    customerId: Id<'customers'>,
    billingRunId: Id<'billingRuns'>,
  ) {
    const customer = await ctx.db.get(customerId)
    const invoice = await ctx.db.insert('invoices', {
      customerId,
      billingRunId,
      amount: customer!.balance,
      status: 'generated',
      createdAt: Date.now(),
    })

    // Reset customer balance
    await ctx.db.patch(customerId, { balance: 0 })

    return invoice
  },
}

// Work item for generating a single invoice
const generateInvoiceWorkItem = Builder.workItem('generateInvoice').withActivities({
  onInitialized: async ({ workItem }) => {
    // Auto-start when initialized
    await workItem.start()
  },
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    const payload = workItem.payload as {
      customerId: Id<'customers'>
      billingRunId: Id<'billingRuns'>
    }

    try {
      await InvoiceDomain.generateInvoice(
        mutationCtx,
        payload.customerId,
        payload.billingRunId,
      )
      await workItem.complete()
    } catch (error) {
      // Individual invoice failures can be handled by policy
      await workItem.fail()
    }
  },
})

// Task that creates multiple work items
const generateInvoicesTask = Builder.task(generateInvoiceWorkItem).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    const customers = await InvoiceDomain.getCustomersNeedingInvoice(
      mutationCtx,
      parent.workflow.id,
    )

    const billingRun = await mutationCtx.db
      .query('billingRuns')
      .withIndex('by_workflow', (q) => q.eq('workflowId', parent.workflow.id))
      .first()

    // Create one work item per customer
    for (const customer of customers) {
      await workItem.initialize({
        customerId: customer._id,
        billingRunId: billingRun!._id,
      })
    }

    // If no customers need invoices, create a dummy work item
    // to allow the task to complete
    if (customers.length === 0) {
      await workItem.initialize({ noWork: true })
    }
  },
})

// Summary task
const sendSummaryWorkItem = Builder.workItem('sendSummary').withActivities({
  onInitialized: async ({ workItem }) => await workItem.start(),
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    const billingRun = await mutationCtx.db
      .query('billingRuns')
      .withIndex('by_workflow', (q) => q.eq('workflowId', parent.workflow.id))
      .first()

    const invoices = await mutationCtx.db
      .query('invoices')
      .withIndex('by_billing_run', (q) => q.eq('billingRunId', billingRun!._id))
      .collect()

    // Send summary email
    await sendEmail({
      to: 'billing@company.com',
      subject: `Billing Run Complete: ${invoices.length} invoices generated`,
      body: `Total amount: $${invoices.reduce((sum, inv) => sum + inv.amount, 0)}`,
    })

    await workItem.complete()
  },
})

// Workflow definition
const billingWorkflow = Builder.workflow('billing')
  .startCondition('start')
  .task('generateInvoices', generateInvoicesTask)
  .task(
    'sendSummary',
    Builder.task(sendSummaryWorkItem).withActivities({
      onEnabled: async ({ workItem }) => await workItem.initialize(),
    }),
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('generateInvoices'))
  .connectTask('generateInvoices', (to) => to.task('sendSummary'))
  .connectTask('sendSummary', (to) => to.condition('end'))
```

## How It Works

1. `generateInvoices` task is enabled
2. `onEnabled` queries for all customers needing invoices
3. For each customer, `workItem.initialize({ customerId, billingRunId })` creates a new work item
4. Each work item auto-starts and generates one invoice
5. Task waits for ALL work items to complete (default policy)
6. When all invoices are generated, task completes
7. `sendSummary` runs and reports results

## Work Item Creation Pattern

The key is calling `workItem.initialize()` multiple times:

```typescript
onEnabled: async ({ workItem, mutationCtx, parent }) => {
  const items = await getItemsToProcess(mutationCtx, parent.workflow.id)

  // Create one work item per item
  for (const item of items) {
    await workItem.initialize({ itemId: item._id })
  }
}
```

Each call creates a new work item with its own:
- Unique ID
- Payload (the data passed to `initialize`)
- State machine (initialized → started → completed/failed/canceled)

## Task Completion Semantics

By default, a task completes when ALL work items complete:

```
Task State Machine:
────────────────────────────────────────────────────────
disabled → enabled → started → completed
                         ↓
                      failed
                         ↓
                     canceled

Task transitions to:
- started: when ANY work item starts
- completed: when ALL work items complete
- failed: when ANY work item fails (unless custom policy)
```

## Handling Empty Work Item Sets

If no items need processing, you must still create at least one work item:

```typescript
onEnabled: async ({ workItem, mutationCtx, parent }) => {
  const items = await getItems(mutationCtx, parent.workflow.id)

  if (items.length === 0) {
    // Create a "no-op" work item that immediately completes
    await workItem.initialize({ noWork: true })
    return
  }

  for (const item of items) {
    await workItem.initialize({ itemId: item._id })
  }
}
```

Then handle the no-op case:

```typescript
const workItemDef = Builder.workItem('process').withActivities({
  onInitialized: async ({ workItem }) => {
    await workItem.start()
  },
  onStarted: async ({ workItem }) => {
    if (workItem.payload?.noWork) {
      await workItem.complete()
      return
    }
    // Normal processing...
  },
})
```

## Combining with Failure Policies

To continue processing even when some items fail:

```typescript
const batchTask = Builder.task(workItemDef)
  .withActivities({ /* ... */ })
  .withPolicy(async (ctx) => {
    if (ctx.transition.nextState === 'failed') {
      return 'continue'  // Don't fail the task
    }
    const stats = await ctx.task.getStats()
    const allDone = stats.completed + stats.failed + stats.canceled === stats.total
    return allDone ? 'complete' : 'continue'
  })
```

## Tracking Progress

Use `task.getStats()` to monitor progress:

```typescript
const stats = await ctx.task.getStats()
// {
//   total: 100,       // Total work items created
//   initialized: 5,   // Waiting to start
//   started: 10,      // Currently processing
//   completed: 80,    // Successfully done
//   failed: 3,        // Failed
//   canceled: 2       // Canceled
// }
```

## Use Cases

- **Batch processing**: Process all items of a certain type
- **Notifications**: Send notification to multiple recipients
- **Data migration**: Migrate records in parallel
- **Report generation**: Generate reports for multiple entities

## See Also

- [Failure Policies](./failure-policies.md) - Handle failures in batch processing
- [Dynamic Work Items](./dynamic-work-items.md) - Create work items during execution (not just at enable)
- [Parallel Aggregation](./parallel-aggregation.md) - Alternative: separate tasks per item
