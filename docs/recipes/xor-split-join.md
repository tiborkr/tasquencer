# Recipe: Exclusive Conditional Branching (XOR Split/Join)

> **Prerequisites**: [Advanced Workflows](../WORKFLOWS_ADVANCED.md)
> **Related**: [Fan-Out/Gather](./fan-out-gather.md) | [Parallel Aggregation](./parallel-aggregation.md)

This recipe demonstrates exclusive conditional branching where exactly one path executes based on runtime data. Unlike OR-split (which can enable multiple branches), XOR-split enables exactly one branch.

```typescript
// Domain function to get payment details
const PaymentDomain = {
  async getByWorkflowId(
    ctx: { db: DatabaseReader },
    workflowId: Id<'tasquencerWorkflows'>,
  ) {
    return await ctx.db
      .query('payments')
      .withIndex('by_workflow', (q) => q.eq('workflowId', workflowId))
      .first()
  },
}

// Work item definitions for each payment method
const creditCardWorkItem = Builder.workItem('creditCard').withActivities({
  onInitialized: async ({ workItem }) => {
    await workItem.start()
  },
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    // Process credit card payment
    await processCreditCard(mutationCtx, parent.workflow.id)
    await workItem.complete()
  },
})

const bankTransferWorkItem = Builder.workItem('bankTransfer').withActivities({
  onInitialized: async ({ workItem }) => {
    await workItem.start()
  },
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    // Initiate bank transfer
    await initiateBankTransfer(mutationCtx, parent.workflow.id)
    await workItem.complete()
  },
})

const cryptoWorkItem = Builder.workItem('crypto').withActivities({
  onInitialized: async ({ workItem }) => {
    await workItem.start()
  },
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    // Process crypto payment
    await processCrypto(mutationCtx, parent.workflow.id)
    await workItem.complete()
  },
})

// Task definitions
const validatePaymentTask = Builder.task(
  Builder.workItem('validatePayment').withActivities({
    onInitialized: async ({ workItem }) => {
      await workItem.start()
    },
    onStarted: async ({ workItem }) => {
      await workItem.complete()
    },
  }),
)
  .withSplitType('xor')
  .withActivities({
    onEnabled: async ({ workItem }) => {
      await workItem.initialize()
    },
  })

const creditCardTask = Builder.task(creditCardWorkItem).withActivities({
  onEnabled: async ({ workItem }) => {
    await workItem.initialize()
  },
})

const bankTransferTask = Builder.task(bankTransferWorkItem).withActivities({
  onEnabled: async ({ workItem }) => {
    await workItem.initialize()
  },
})

const cryptoTask = Builder.task(cryptoWorkItem).withActivities({
  onEnabled: async ({ workItem }) => {
    await workItem.initialize()
  },
})

const confirmationTask = Builder.task(
  Builder.workItem('confirmation').withActivities({
    onInitialized: async ({ workItem }) => {
      await workItem.start()
    },
    onStarted: async ({ workItem }) => {
      await workItem.complete()
    },
  }),
)
  .withJoinType('xor')
  .withActivities({
    onEnabled: async ({ workItem }) => {
      await workItem.initialize()
    },
  })

// Workflow definition
const paymentWorkflow = Builder.workflow('payment')
  .startCondition('start')
  .task('validatePayment', validatePaymentTask)
  .task('processCreditCard', creditCardTask)
  .task('processBankTransfer', bankTransferTask)
  .task('processCrypto', cryptoTask)
  .task('sendConfirmation', confirmationTask)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('validatePayment'))
  .connectTask('validatePayment', (to) =>
    to
      .task('processCreditCard')
      .task('processBankTransfer')
      .task('processCrypto')
      .route(async ({ route, mutationCtx, parent }) => {
        const payment = await PaymentDomain.getByWorkflowId(
          mutationCtx,
          parent.workflow.id,
        )
        if (payment?.method === 'credit_card') {
          return route.toTask('processCreditCard')
        }
        if (payment?.method === 'bank_transfer') {
          return route.toTask('processBankTransfer')
        }
        return route.toTask('processCrypto')
      }),
  )
  .connectTask('processCreditCard', (to) => to.task('sendConfirmation'))
  .connectTask('processBankTransfer', (to) => to.task('sendConfirmation'))
  .connectTask('processCrypto', (to) => to.task('sendConfirmation'))
  .connectTask('sendConfirmation', (to) => to.condition('end'))
```

## How It Works

1. `validatePayment` task completes with XOR-split, which routes to exactly ONE payment processor
2. The `route` function examines the payment method and returns a single route
3. Only the selected payment task is enabled; others remain disabled
4. `sendConfirmation` uses XOR-join, which fires when ANY incoming task completes
5. Since only one path was taken, confirmation triggers immediately after that path completes

## XOR vs OR vs AND

| Type | Split Behavior | Join Behavior |
|------|---------------|---------------|
| **XOR** | Enables exactly ONE task (exclusive choice) | Fires when ANY incoming task completes |
| OR | Enables SELECTED tasks dynamically (0 to N) | Waits for ALL selected branches |
| AND | Enables ALL connected tasks | Waits for ALL incoming tasks |

## When to Use XOR

- **Mutually exclusive choices**: Only one option makes sense (payment method, shipping tier)
- **Decision points**: The workflow must choose one path based on data
- **Simpler than OR**: When you know exactly one branch will be taken

## Default Route Pattern

For safety, always provide a default route to handle unexpected cases:

```typescript
.route(async ({ route, mutationCtx, parent }) => {
  const payment = await PaymentDomain.getByWorkflowId(mutationCtx, parent.workflow.id)

  switch (payment?.method) {
    case 'credit_card':
      return route.toTask('processCreditCard')
    case 'bank_transfer':
      return route.toTask('processBankTransfer')
    case 'crypto':
      return route.toTask('processCrypto')
    default:
      // Default fallback - handle unknown payment methods
      return route.toTask('processCreditCard')
  }
})
```

## See Also

- [Parallel Aggregation (AND-split/join)](./parallel-aggregation.md)
- [Fan-Out/Gather (OR-split/join)](./fan-out-gather.md)
- [Dynamic Tasks](./dynamic-tasks.md)
