# Recipe: Scheduling Actions in Teardown Activities

> **Prerequisites**: [Actions & Activities](../ACTIONS_ACTIVITIES.md)
> **Related**: [External Communication](../EXTERNAL_IO.md) | [Timeouts and Cancellation](./timeouts-cancellation.md)

**Problem**: You need to schedule external work (notifications, alerts, follow-up) when a work item completes, fails, or is canceled, but the scheduled job should outlive the element.

**Solution**: Use `scheduler` directly (not `registerScheduled`) in teardown activities.

## Key Concept

- `registerScheduled` = "Cancel this job if parent element fails/cancels"
- `scheduler` directly = "This job outlives the element"

```typescript
const criticalWorkItem = Builder.workItem('criticalWork')
  .withActions(
    Builder.workItemActions()
      .initialize(
        z.object({ data: z.string(), userId: z.string() }),
        async ({ mutationCtx, workItem, registerScheduled }, payload) => {
          const workItemId = await workItem.initialize()

          await WorkDomain.createJob(mutationCtx, {
            workItemId,
            data: payload.data,
            userId: payload.userId,
          })

          // Use registerScheduled during active lifecycle
          // If work item fails, this scheduled job will be auto-canceled
          await registerScheduled(
            mutationCtx.scheduler.runAfter(0, internal.work.processData, {
              workItemId,
              data: payload.data,
            }),
          )
        },
      )
      .complete(
        z.object({ result: z.string() }),
        async ({ mutationCtx, workItem }, payload) => {
          await WorkDomain.updateJob(mutationCtx, workItem.id, {
            result: payload.result,
            status: 'completed',
          })
        },
      )
      .fail(
        z.object({ error: z.string() }),
        async ({ mutationCtx, workItem }, payload) => {
          await WorkDomain.updateJob(mutationCtx, workItem.id, {
            error: payload.error,
            status: 'failed',
          })
        },
      ),
  )
  .withActivities({
    onCompleted: async ({ mutationCtx, workItem, parent }) => {
      // Use scheduler directly - completion notification outlives work item
      await mutationCtx.scheduler.runAfter(
        0,
        internal.notifications.sendCompletionNotification,
        {
          workItemId: workItem.id,
          workflowId: parent.workflow.id,
          timestamp: Date.now(),
        },
      )

      // DON'T use registerScheduled - it will be immediately canceled!
      // await registerScheduled(mutationCtx.scheduler.runAfter(...))

      // Inline domain updates are fine
      await WorkDomain.recordCompletionMetrics(mutationCtx, workItem.id)
    },

    onFailed: async ({ mutationCtx, workItem }) => {
      // Use scheduler directly - failure alert outlives work item
      await mutationCtx.scheduler.runAfter(
        0,
        internal.alerts.sendFailureAlert,
        {
          workItemId: workItem.id,
          severity: 'high',
          timestamp: Date.now(),
        },
      )

      // Inline cleanup
      await WorkDomain.markAsFailed(mutationCtx, workItem.id)
    },

    onCanceled: async ({ mutationCtx, workItem }) => {
      // Use scheduler directly - cancellation notification outlives work item
      await mutationCtx.scheduler.runAfter(
        0,
        internal.notifications.sendCancellationNotification,
        { workItemId: workItem.id },
      )

      // Inline cleanup
      await WorkDomain.cleanup(mutationCtx, workItem.id)
    },
  })
```

## When to Use Each Approach

| Activity Type | Use `registerScheduled`? | Use `scheduler` directly? |
|--------------|--------------------------|---------------------------|
| `initialize` action | Yes (usually) | Maybe (if job should outlive) |
| `onEnabled` | Yes (usually) | Maybe (if job should outlive) |
| `onStarted` | Yes (usually) | Maybe (if job should outlive) |
| `onCompleted` | Never | Always |
| `onCanceled` | Never | Always |
| `onFailed` | Never | Always |

## Why This Works

- Teardown activities (`onCompleted`, `onCanceled`, `onFailed`) execute **during element cleanup**
- At that point, Tasquencer is actively canceling all registered scheduled jobs for the element
- Using `registerScheduled` in teardown = immediate cancellation
- Using `scheduler` directly = job is independent and survives

## See Also

- [External Communication](../EXTERNAL_IO.md) - "Pattern: Teardown Activity Scheduling"
- [Timeouts and Cancellation](./timeouts-cancellation.md)
