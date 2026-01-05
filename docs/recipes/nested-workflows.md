# Recipe: Nested Workflows with Composite Tasks

> **Prerequisites**: [Advanced Workflows](../WORKFLOWS_ADVANCED.md)
> **Related**: [Dynamic Composite Tasks](./dynamic-composite-tasks.md) | [Parallel Aggregation](./parallel-aggregation.md)

This recipe demonstrates how to embed reusable sub-workflows within a parent workflow using composite tasks. This enables modular workflow design where complex processes can be broken into independent, testable units.

**Problem**: An e-commerce order requires payment processing AND shipping coordination. Each is a complex workflow on its own, but they need to run as part of a larger order fulfillment process.

```typescript
// ============================================
// SUB-WORKFLOW: Payment Processing
// ============================================
const validatePaymentWorkItem = Builder.workItem('validatePayment').withActivities({
  onInitialized: async ({ workItem }) => {
    await workItem.start()
  },
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    const isValid = await PaymentDomain.validate(mutationCtx, parent.workflow.id)
    if (isValid) {
      await workItem.complete()
    } else {
      await workItem.fail()
    }
  },
})

const chargePaymentWorkItem = Builder.workItem('chargePayment').withActivities({
  onInitialized: async ({ workItem }) => {
    await workItem.start()
  },
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    await PaymentDomain.charge(mutationCtx, parent.workflow.id)
    await workItem.complete()
  },
})

const paymentWorkflow = Builder.workflow('payment')
  .startCondition('start')
  .task(
    'validate',
    Builder.task(validatePaymentWorkItem).withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize()
      },
    }),
  )
  .task(
    'charge',
    Builder.task(chargePaymentWorkItem).withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize()
      },
    }),
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('validate'))
  .connectTask('validate', (to) => to.task('charge'))
  .connectTask('charge', (to) => to.condition('end'))

// ============================================
// SUB-WORKFLOW: Shipping
// ============================================
const createShipmentWorkItem = Builder.workItem('createShipment').withActivities({
  onInitialized: async ({ workItem }) => {
    await workItem.start()
  },
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    await ShippingDomain.createShipment(mutationCtx, parent.workflow.id)
    await workItem.complete()
  },
})

const trackShipmentWorkItem = Builder.workItem('trackShipment').withActivities({
  onInitialized: async ({ workItem }) => {
    await workItem.start()
  },
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    // In reality, this might wait for webhook or poll carrier API
    await ShippingDomain.updateTracking(mutationCtx, parent.workflow.id)
    await workItem.complete()
  },
})

const shippingWorkflow = Builder.workflow('shipping')
  .startCondition('start')
  .task(
    'createShipment',
    Builder.task(createShipmentWorkItem).withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize()
      },
    }),
  )
  .task(
    'trackShipment',
    Builder.task(trackShipmentWorkItem).withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize()
      },
    }),
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('createShipment'))
  .connectTask('createShipment', (to) => to.task('trackShipment'))
  .connectTask('trackShipment', (to) => to.condition('end'))

// ============================================
// PARENT WORKFLOW: Order Fulfillment
// ============================================
const receiveOrderWorkItem = Builder.workItem('receiveOrder').withActivities({
  onInitialized: async ({ workItem }) => {
    await workItem.start()
  },
  onStarted: async ({ workItem }) => {
    await workItem.complete()
  },
})

const confirmOrderWorkItem = Builder.workItem('confirmOrder').withActivities({
  onInitialized: async ({ workItem }) => {
    await workItem.start()
  },
  onStarted: async ({ workItem }) => {
    await workItem.complete()
  },
})

const orderWorkflow = Builder.workflow('order')
  .startCondition('start')
  .task(
    'receiveOrder',
    Builder.task(receiveOrderWorkItem)
      .withSplitType('and')
      .withActivities({
        onEnabled: async ({ workItem }) => {
          await workItem.initialize()
        },
      }),
  )
  // Embed payment workflow as a composite task
  .compositeTask(
    'processPayment',
    Builder.compositeTask(paymentWorkflow).withActivities({
      onEnabled: async ({ workflow }) => {
        // Initialize the sub-workflow when the composite task is enabled
        await workflow.initialize()
      },
    }),
  )
  // Embed shipping workflow as a composite task
  .compositeTask(
    'handleShipping',
    Builder.compositeTask(shippingWorkflow).withActivities({
      onEnabled: async ({ workflow }) => {
        await workflow.initialize()
      },
    }),
  )
  .task(
    'confirmOrder',
    Builder.task(confirmOrderWorkItem)
      .withJoinType('and')
      .withActivities({
        onEnabled: async ({ workItem }) => {
          await workItem.initialize()
        },
      }),
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('receiveOrder'))
  // AND-split: both payment and shipping run in parallel
  .connectTask('receiveOrder', (to) =>
    to.task('processPayment').task('handleShipping'),
  )
  // AND-join: wait for both to complete
  .connectTask('processPayment', (to) => to.task('confirmOrder'))
  .connectTask('handleShipping', (to) => to.task('confirmOrder'))
  .connectTask('confirmOrder', (to) => to.condition('end'))
```

## How It Works

1. **Parent workflow starts**: `receiveOrder` task is enabled and completes
2. **AND-split**: Both `processPayment` and `handleShipping` composite tasks are enabled in parallel
3. **Sub-workflows initialize**: Each composite task's `onEnabled` activity calls `workflow.initialize()`, starting the embedded workflow
4. **Sub-workflows execute**: Payment and shipping workflows run independently, each with their own tasks
5. **Sub-workflows complete**: When a sub-workflow reaches its end condition, the composite task completes
6. **AND-join**: `confirmOrder` waits for BOTH composite tasks to complete
7. **Parent completes**: After confirmation, the order workflow reaches its end condition

## Composite Task Lifecycle

```
Parent Workflow                    Child Workflow (Payment)
─────────────────                  ────────────────────────
receiveOrder completes
       │
       ▼
processPayment enabled ──────────► payment workflow initialized
       │                                    │
       │                                    ▼
       │                            validate task enabled
       │                            validate completes
       │                                    │
       │                                    ▼
       │                            charge task enabled
       │                            charge completes
       │                                    │
       │                                    ▼
       │                            payment workflow completes
       │                                    │
       ▼ ◄──────────────────────────────────┘
processPayment completes
       │
       ▼
confirmOrder enabled (waiting for handleShipping too)
```

## Accessing Root Workflow Data

Sub-workflows can access data from the root workflow using `realizedPath`:

```typescript
const chargePaymentWorkItem = Builder.workItem('chargePayment').withActivities({
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    // Get the root workflow ID (useful for accessing order-level data)
    const rootWorkflowId = parent.workflow.realizedPath[0]

    // Get order details from the root
    const order = await OrderDomain.getByWorkflowId(mutationCtx, rootWorkflowId)

    await PaymentDomain.charge(mutationCtx, {
      amount: order.totalAmount,
      customerId: order.customerId,
    })

    await workItem.complete()
  },
})
```

## Benefits of Composite Tasks

| Benefit | Description |
|---------|-------------|
| **Reusability** | Payment workflow can be reused in other contexts (subscriptions, refunds) |
| **Isolation** | Each sub-workflow has its own tasks, work items, and state |
| **Testability** | Sub-workflows can be tested independently |
| **Maintainability** | Changes to payment logic don't affect order workflow structure |
| **Visibility** | Full audit trail shows nested execution path |

## When to Use Composite Tasks

- **Reusable processes**: Payment, shipping, approval flows used in multiple contexts
- **Complex sub-processes**: When a single task would be too complex
- **Team boundaries**: Different teams own different sub-workflows
- **Versioning**: Sub-workflows can be versioned independently

## See Also

- [Dynamic Composite Tasks](./dynamic-composite-tasks.md) - Choose which workflow to run at runtime
- [Parallel Aggregation](./parallel-aggregation.md) - AND-split/join patterns
- [Root Workflow ID](./root-workflow-id.md) - Accessing parent workflow data
