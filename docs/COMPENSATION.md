# Compensation

> **Prerequisites**: [Workflow Basics](./WORKFLOWS_BASIC.md), [Exception Handling](./EXCEPTIONS.md)  
> **Related**: [Advanced Workflows](./WORKFLOWS_ADVANCED.md) | [Actions vs Activities](./ACTIONS_ACTIVITIES.md)

This guide covers compensation patterns for undoing completed work in Tasquencer workflows.

## Table of Contents

- [Overview](#overview)
- [Core Principle](#core-principle)
- [Pattern 1: Automatic Compensation with Activities](#pattern-1-automatic-compensation-with-activities)
- [Pattern 2: Multi-Step Compensation with Workflow Transitions](#pattern-2-multi-step-compensation-with-workflow-transitions)
- [Pattern 3: Hybrid Approach](#pattern-3-hybrid-approach)
- [Best Practices](#best-practices)
- [Decision Guide](#decision-guide)
- [Complete Example: Order Processing with Compensation](#complete-example-order-processing-with-compensation)

---

## Compensation

### Overview

Compensation is the process of undoing or mitigating the effects of completed work when a workflow fails or is canceled. Tasquencer provides flexible mechanisms to model compensation explicitly, depending on whether the compensation can be done automatically or requires a multi-step process.

### Core Principle

**Tasquencer's idea is simple:**

1. **If compensation can be done automatically** (e.g., calling APIs, clearing database state), use **`onCanceled` or `onFailed` activities** for that purpose.

2. **If compensation requires a multi-step process**, use a combination of **policies, OR/XOR splits**, and **domain state** to transition to a compensation workflow subsection.

These concepts allow Tasquencer to model compensation explicitly, providing full control over rollback behavior.

### Pattern 1: Automatic Compensation with Activities

Use `onCanceled` and `onFailed` activities when compensation can be done in a single step or with simple API calls.

**When to use:**

- Releasing reserved resources (inventory, capacity, locks)
- Rolling back database state
- Canceling scheduled tasks
- Sending notifications
- Cleaning up temporary data

```typescript
const reserveInventoryWorkItem = Builder.workItem(
  'reserveInventory',
).withActions(
  Builder.workItemActions()
    .initialize(
      z.object({ productId: z.string(), quantity: z.number() }),
      async ({ mutationCtx, workItem }, payload) => {
        const workItemId = await workItem.initialize()

        // Reserve inventory
        await InventoryDomain.reserve(mutationCtx, {
          workItemId,
          productId: payload.productId,
          quantity: payload.quantity,
        })
      },
    )
    .complete(z.never(), async ({ mutationCtx, workItem }) => {
      // Confirm reservation
      await InventoryDomain.confirmReservation(mutationCtx, workItem.id)
      await workItem.complete()
    }),
)

const reserveInventoryTask = Builder.task(
  reserveInventoryWorkItem,
).withActivities({
  // Automatic compensation using onWorkItemStateChanged
  onWorkItemStateChanged: async ({ mutationCtx, workItem }) => {
    // Compensation for cancellation
    if (workItem.nextState === 'canceled') {
      await InventoryDomain.releaseReservation(mutationCtx, workItem.id)
      console.log(`Released inventory reservation for work item ${workItem.id}`)
    }

    // Compensation for failure
    if (workItem.nextState === 'failed') {
      await InventoryDomain.releaseReservation(mutationCtx, workItem.id)
      console.log(
        `Released inventory reservation after failure: ${workItem.id}`,
      )
    }
  },
})
```

**Benefits:**

- ✅ Simple and straightforward
- ✅ Compensation happens automatically when needed
- ✅ No additional workflow complexity
- ✅ Works for most cleanup scenarios

**Limitations:**

- ❌ Cannot handle multi-step compensation processes
- ❌ Cannot involve human decision-making
- ❌ Limited to what can be done in a single activity

### Pattern 2: Multi-Step Compensation with Workflow Transitions

When compensation requires multiple steps, human input, or complex logic, model it as an explicit part of your workflow using policies, control flow, and domain state.

**When to use:**

- Compensation requires multiple steps
- Human approval or review is needed
- Compensation has its own failure modes
- Need to track compensation progress
- Compensation involves external systems with their own workflows

#### Step 1: Use Domain State to Track Compensation

```typescript
// Domain schema
const orders = defineTable({
  customerId: v.string(),
  status: v.string(), // 'processing' | 'completed' | 'compensating' | 'compensated' | 'failed'
  workflowId: v.id('tasquencerWorkflows'),
})

// Domain functions
export const OrderDomain = {
  async markAsCompensating(
    ctx: { db: DatabaseWriter },
    workflowId: Id<'tasquencerWorkflows'>,
  ) {
    const order = await this.getByWorkflowId(ctx, workflowId)
    await ctx.db.patch(order._id, { status: 'compensating' })
  },

  async markAsCompensated(
    ctx: { db: DatabaseWriter },
    workflowId: Id<'tasquencerWorkflows'>,
  ) {
    const order = await this.getByWorkflowId(ctx, workflowId)
    await ctx.db.patch(order._id, { status: 'compensated' })
  },

  async needsCompensation(
    ctx: { db: DatabaseReader },
    workflowId: Id<'tasquencerWorkflows'>,
  ): Promise<boolean> {
    const order = await this.getByWorkflowId(ctx, workflowId)
    return ['processing', 'completed'].includes(order.status)
  },
}
```

#### Step 2: Use Policy to Prevent Immediate Failure Propagation

```typescript
const paymentTask = Builder.task(paymentWorkItem)
  .withActivities({
    onFailed: async ({ mutationCtx, parent }) => {
      // Mark domain state for compensation
      await OrderDomain.markAsCompensating(mutationCtx, parent.workflow.id)
    },
  })
  .withPolicy(async ({ transition, task, mutationCtx, parent }) => {
    if (transition.nextState === 'failed') {
      // Check if compensation is needed
      const needsCompensation = await OrderDomain.needsCompensation(
        mutationCtx,
        parent.workflow.id,
      )

      if (needsCompensation) {
        // Complete the task instead of failing - this allows workflow to continue
        // to compensation section
        return 'complete'
      }

      // No compensation needed, propagate failure
      return 'fail'
    }

    const stats = await task.getStats()
    const allFinalized =
      stats.completed + stats.failed + stats.canceled === stats.total
    return allFinalized ? 'complete' : 'continue'
  })
```

#### Step 3: Use OR/XOR Split to Route to Compensation

```typescript
const orderWorkflow = Builder.workflow('order')
  .withActions(
    Builder.workflowActions().initialize(
      z.object({ customerId: z.string() }),
      async ({ mutationCtx, workflow }, payload) => {
        const workflowId = await workflow.initialize()
        await OrderDomain.create(mutationCtx, {
          customerId: payload.customerId,
          workflowId,
        })
      },
    ),
  )
  .startCondition('start')

  // Main workflow tasks
  .task('validateOrder', validateOrderTask)
  .task('reserveInventory', reserveInventoryTask)
  .task('processPayment', paymentTask)

  // Decision task with XOR split for routing
  .task(
    'routeDecision',
    Builder.task(
      Builder.workItem('routeDecision').withActivities({
        onInitialized: async ({ workItem }) => {
          // Auto-start routing task immediately
          workItem.start({})
        },
        onStarted: async ({ workItem }) => {
          // Auto-complete after starting
          workItem.complete({})
        },
      }),
    ).withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize({})
      },
    }),
  )

  // Compensation subsection
  .task('refundPayment', refundPaymentTask)
  .task('releaseInventory', releaseInventoryTask)
  .task('notifyCustomer', notifyCustomerTask)

  .endCondition('end')

  // Main flow
  .connectCondition('start', (to) => to.task('validateOrder'))
  .connectTask('validateOrder', (to) => to.task('reserveInventory'))
  .connectTask('reserveInventory', (to) => to.task('processPayment'))
  .connectTask('processPayment', (to) => to.task('routeDecision'))

  // XOR split on routing task: route based on domain state
  .connectTask('routeDecision', (to) =>
    to
      .task('refundPayment')
      .condition('end')
      .route(async ({ mutationCtx, route, parent }) => {
        const order = await OrderDomain.getByWorkflowId(
          mutationCtx,
          parent.workflow.id,
        )

        if (order.status === 'compensating') {
          // Route to compensation subsection
          return route.toTask('refundPayment')
        }

        // Normal completion - go directly to end
        return route.toCondition('end')
      }),
  )

  // Compensation flow
  .connectTask('refundPayment', (to) => to.task('releaseInventory'))
  .connectTask('releaseInventory', (to) => to.task('notifyCustomer'))
  .connectTask('notifyCustomer', (to) => to.condition('end'))
```

#### Step 4: Implement Compensation Work Items

````typescript
const refundPaymentWorkItem = Builder.workItem('refundPayment').withActions(
  Builder.workItemActions()
    .initialize(
      z.never(),
      async ({ mutationCtx, workItem, parent, registerScheduled }) => {
        const workItemId = await workItem.initialize()

        // Get original payment info from domain
        const order = await OrderDomain.getByWorkflowId(
          mutationCtx,
          parent.workflow.id,
        )
        const payment = await PaymentDomain.getByOrderId(mutationCtx, order._id)

        // Create refund record
        await PaymentDomain.createRefund(mutationCtx, {
          paymentId: payment._id,
          workItemId,
          status: 'pending',
        })

        // Schedule external API call
        await registerScheduled(
          mutationCtx.scheduler.runAfter(0, internal.payments.processRefund, {
            workItemId,
            paymentId: payment._id,
          }),
        )
      },
    )
    .complete(
      z.object({ refundId: z.string() }),
      async ({ mutationCtx, workItem }, payload) => {
        await PaymentDomain.updateRefund(mutationCtx, workItem.id, {
          status: 'completed',
          refundId: payload.refundId,
        })
        await workItem.complete()
      },
    ),
)

> **Important: `registerScheduled` vs `scheduler` Directly**
>
> - ✅ **This example uses `registerScheduled` correctly** because it's called from the `initialize` action of a **new work item** (`refundPayment`) that's part of the compensation flow. The work item is in its active lifecycle, so `registerScheduled` ties the scheduled job to the work item's lifecycle.
>
> - ❌ **Don't use `registerScheduled` in teardown activities** (`onCompleted`, `onCanceled`, `onFailed`) of the *original* failing task. Those activities execute during element cleanup, so any jobs registered will be immediately canceled.
>
> - ✅ **Use `scheduler` directly in teardown activities** if you need to schedule work that outlives the failing element (e.g., notifications, alerts). See [External Communication](./EXTERNAL_IO.md) for details.

const releaseInventoryWorkItem = Builder.workItem('releaseInventory')
  .withActions(
    Builder.workItemActions().initialize(
      z.never(),
      async ({ mutationCtx, workItem, parent }) => {
        const workItemId = await workItem.initialize()

        // Release inventory that was reserved
        const order = await OrderDomain.getByWorkflowId(
          mutationCtx,
          parent.workflow.id,
        )
        await InventoryDomain.releaseOrderInventory(mutationCtx, order._id)
      },
    ),
  )
  .withActivities({
    onInitialized: async ({ workItem }) => {
      // Auto-start immediately
      workItem.start({})
    },
    onStarted: async ({ workItem }) => {
      // Auto-complete (simple cleanup task)
      workItem.complete({})
    },
  })

> **Tip: Scheduling in Compensation Activities**
>
> You CAN schedule work from teardown activities (`onCanceled`, `onFailed`, `onCompleted`), but you MUST use `scheduler` directly (not `registerScheduled`):
>
> ```typescript
> .withActivities({
>   onFailed: async ({ mutationCtx, workItem }) => {
>     // ✅ Use scheduler directly - alert outlives the failing element
>     await mutationCtx.scheduler.runAfter(
>       0,
>       internal.alerts.notifyPaymentFailure,
>       { workItemId: workItem.id }
>     )
>
>     // ❌ Don't use registerScheduled - it will be immediately canceled
>     // await registerScheduled(mutationCtx.scheduler.runAfter(...))
>   }
> })
> ```
>
> See [External Communication](./EXTERNAL_IO.md) → "Pattern: Teardown Activity Scheduling" for complete details.

**Benefits:**

- ✅ Can model complex, multi-step compensation
- ✅ Can involve human decision-making
- ✅ Compensation has its own failure handling
- ✅ Full visibility into compensation progress
- ✅ Can be tested like any other workflow

**Trade-offs:**

- More complex than activity-based compensation
- Requires careful workflow design
- Need to manage domain state for routing

### Pattern 3: Hybrid Approach

Combine both patterns: use activities for simple cleanup, and explicit workflow sections for complex compensation.

```typescript
const processOrderWorkItem = Builder.workItem('processOrder').withActivities({
  onFailed: async ({ mutationCtx, workItem }) => {
    // ✅ Use scheduler directly - failure notification outlives work item
    await mutationCtx.scheduler.runAfter(
      0,
      internal.alerts.sendOrderFailureAlert,
      { workItemId: workItem.id },
    )

    // Inline cleanup
    await OrderDomain.cleanupWorkItemTempData(mutationCtx, workItem.id)
  },
})

const processOrderTask = Builder.task(processOrderWorkItem)
  .withActivities({
    // Simple automatic compensation using onWorkItemStateChanged
    onWorkItemStateChanged: async ({
      mutationCtx,
      workItem,
      task,
      parent,
    }) => {
      if (workItem.nextState === 'canceled') {
        // Release locks for this specific work item
        await OrderDomain.releaseLocks(mutationCtx, workItem.id)
      }

      if (workItem.nextState === 'failed') {
        // Mark for complex compensation (domain-level state)
        await OrderDomain.markAsCompensating(mutationCtx, parent.workflow.id)
      }
    },
  })
  .withPolicy(async ({ transition, mutationCtx, parent }) => {
    if (transition.nextState === 'failed') {
      const needsCompensation = await OrderDomain.needsCompensation(
        mutationCtx,
        parent.workflow.id,
      )

      // Route to compensation workflow section for complex rollback
      if (needsCompensation) {
        return 'complete'
      }

      return 'fail'
    }

    // ... normal policy
  })
```

### Best Practices

#### ✅ Do:

- **Use `onCanceled` and `onFailed` activities for simple, automatic compensation** (API calls, cleanup)
- **Use workflow routing for multi-step compensation** that requires coordination
- **Update domain state** to track compensation status
- **Use policies to prevent failure propagation** when entering compensation
- **Design compensation as a first-class workflow subsection** with its own tasks
- **Test compensation paths thoroughly** - they're easy to forget!
- **Make compensation idempotent** - it might run multiple times
- **Document what requires compensation** in your domain model

#### ❌ Don't:

- **Don't ignore compensation** - failed workflows leave inconsistent state
- **Don't make compensation activities too complex** - use workflow routing instead
- **Don't forget to handle compensation failures** - what happens if refund fails?
- **Don't mix compensation logic** across activities and workflow routing (pick one pattern)
- **Don't rely on external systems** to track compensation state (use domain state)

### Decision Guide

**Use activity-based compensation when:**

- Compensation is a single operation (release lock, delete record, call API)
- No human interaction required
- Compensation cannot fail (or failure is acceptable)
- You want simple, automatic cleanup

**Use workflow-based compensation when:**

- Compensation requires multiple coordinated steps
- Human approval or review is needed
- Compensation has its own failure modes that need handling
- You need to track compensation progress
- Compensation involves external systems with async operations

**Use hybrid approach when:**

- Some cleanup is simple (use activities)
- Some compensation is complex (use workflow routing)
- Want to combine automatic cleanup with manual processes

### Complete Example: Order Processing with Compensation

```typescript
// Domain state tracks compensation
const orders = defineTable({
  customerId: v.string(),
  status: v.string(), // 'draft' | 'processing' | 'completed' | 'compensating' | 'compensated'
  totalAmount: v.number(),
  workflowId: v.id('tasquencerWorkflows'),
}).index('by_workflow', ['workflowId'])

// Workflow with compensation
const orderWorkflow = Builder.workflow('order')
  .startCondition('start')

  // Main flow
  .task('validateOrder', validateTask)
  .task(
    'reserveInventory',
    reserveTask.withActivities({
      // Simple automatic compensation
      onCanceled: async ({ mutationCtx, workItem }) => {
        await InventoryDomain.releaseReservation(mutationCtx, workItem.id)
      },
    }),
  )
  .task(
    'chargePayment',
    paymentTask.withPolicy(
      async ({ transition, mutationCtx, parent }) => {
        if (transition.nextState === 'failed') {
          // Mark for multi-step compensation
          await OrderDomain.markAsCompensating(mutationCtx, parent.workflow.id)
          return 'complete' // Route to compensation instead of failing
        }
        // ... normal policy
      },
    ),
  )

  // Decision task with XOR split
  .task(
    'routeDecision',
    Builder.task(
      Builder.workItem('routeDecision').withActivities({
        onInitialized: async ({ workItem }) => {
          // Auto-complete decision task immediately
          workItem.start({})
        },
        onStarted: async ({ workItem }) => {
          // Auto-complete after starting
          workItem.complete({})
        },
      }),
    ).withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize({})
      },
    }),
  )

  // Compensation subsection
  .task('refundPayment', refundTask)
  .task('releaseInventory', releaseTask)
  .task('notifyFailure', notifyTask)

  .endCondition('end')

  // Main flow connections
  .connectCondition('start', (to) => to.task('validateOrder'))
  .connectTask('validateOrder', (to) => to.task('reserveInventory'))
  .connectTask('reserveInventory', (to) => to.task('chargePayment'))
  .connectTask('chargePayment', (to) => to.task('routeDecision'))

  // XOR split on routing task: route based on domain state
  .connectTask('routeDecision', (to) =>
    to
      .task('refundPayment')
      .condition('end')
      .route(async ({ mutationCtx, route, parent }) => {
        const order = await OrderDomain.getByWorkflowId(
          mutationCtx,
          parent.workflow.id,
        )
        return order.status === 'compensating'
          ? route.toTask('refundPayment')
          : route.toCondition('end')
      }),
  )

  // Compensation flow converges back to end
  .connectTask('refundPayment', (to) => to.task('releaseInventory'))
  .connectTask('releaseInventory', (to) => to.task('notifyFailure'))
  .connectTask('notifyFailure', (to) => to.condition('end'))
```

---
