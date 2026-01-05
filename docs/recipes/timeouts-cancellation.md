# Recipe: Timeout with Cancellation

> **Prerequisites**: [Advanced Workflows](../WORKFLOWS_ADVANCED.md)
> **Related**: [Exception Handling](../EXCEPTIONS.md) | [Compensation](../COMPENSATION.md)

This recipe demonstrates how to implement timeouts that cancel other tasks when triggered.

## Basic Timeout Pattern

```typescript
const timeoutWorkflow = Builder.workflow('withTimeout')
  .startCondition('start')
  .task('mainWork', mainWorkTask.withSplitType('and'))
  .task('timeout', timeoutTask)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('mainWork'))
  .connectTask('mainWork', (to) => to.task('timeout'))
  .connectTask('timeout', (to) => to.condition('end'))
  // When mainWork completes, cancel the timeout task
  // This prevents timeout from firing after work is done
  .withCancellationRegion('mainWork', (cr) => cr.task('timeout'))

// Main work task
const mainWorkTask = Builder.task(mainWorkItem).withActivities({
  onEnabled: async ({ workItem, mutationCtx, registerScheduled }) => {
    const workItemId = await workItem.initialize()

    // Schedule external work that may take time
    await registerScheduled(
      mutationCtx.scheduler.runAfter(0, internal.myWorkflow.performWork, {
        workItemId,
      }),
    )
  },
})

// Timeout task - auto-starts and completes after delay
const timeoutTask = Builder.task(timeoutWorkItem).withActivities({
  onEnabled: async ({ workItem, mutationCtx, registerScheduled }) => {
    const workItemId = await workItem.initialize()

    // Schedule a single handler that starts/completes the timeout work item
    await registerScheduled(
      mutationCtx.scheduler.runAfter(
        60 * 1000, // 60 seconds
        internal.myWorkflow.handleTimeout,
        { workItemId },
      ),
    )
  },
})
```

Implement `internal.myWorkflow.handleTimeout` so that it uses the Tasquencer API to start (and, if appropriate, complete) the `timeout` work item when the timer fires.

## Winner-Takes-All Pattern

Both tasks race, first to START cancels the other:

```typescript
const raceWorkflow = Builder.workflow('race')
  .startCondition('start')
  .task('fastPath', fastPathTask)
  .task('slowPath', slowPathTask)
  .task('continue', continueTask.withJoinType('xor'))
  .endCondition('end')
  .connectCondition('start', (to) => to.task('fastPath').task('slowPath'))
  .connectTask('fastPath', (to) => to.task('continue'))
  .connectTask('slowPath', (to) => to.task('continue'))
  .connectTask('continue', (to) => to.condition('end'))
  // Whoever starts first cancels the other
  .withCancellationRegion('fastPath', (cr) => cr.task('slowPath'))
  .withCancellationRegion('slowPath', (cr) => cr.task('fastPath'))
```

## How Cancellation Works

1. Tasks run in parallel
2. When one task completes, it triggers cancellation of tasks in its cancellation region
3. Canceled tasks stop immediately (scheduled jobs are canceled)
4. XOR-join fires when first task completes

## Key Points

- Use `withCancellationRegion` to define which tasks cancel which
- Cancellation is transitive - nested workflows are also canceled
- Use `registerScheduled` for jobs that should be canceled
- Use `scheduler` directly for jobs that should survive cancellation

## See Also

- [Scheduling Actions in Teardown Activities](./teardown-scheduling.md)
- [Compensation](../COMPENSATION.md)
