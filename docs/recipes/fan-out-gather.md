# Recipe: Fan-Out/Gather with Dummy Tasks

> **Prerequisites**: [Advanced Workflows](../WORKFLOWS_ADVANCED.md)
> **Related**: [Parallel Processing](./parallel-aggregation.md) | [Dynamic Tasks](./dynamic-tasks.md)

**Problem**: You need to fan out to multiple optional tasks and gather results, but don't need actual work at the split/join points.

**Solution**: Use dummy tasks for structural split/join without domain logic.

```typescript
import { type AvailableRoutes } from '../tasquencer/builder/flow'

// Dummy task for fan-out (determines which services to call)
const dispatchTask = Builder.dummyTask()
  .withSplitType('or')
  .withActivities({
    onEnabled: async ({ mutationCtx }) => {
      // No work items - just routing logic
      // Task automatically starts and completes
    },
  })

// Dummy task for gathering results
const gatherTask = Builder.dummyTask()
  .withJoinType('or') // Synchronized merge: waits for ALL tasks that were dynamically fired
  .withActivities({
    onEnabled: async ({ mutationCtx }) => {
      // Automatically completes - no work needed
    },
  })

// Actual work tasks
const emailTask = Builder.task(emailWorkItem)
const smsTask = Builder.task(smsWorkItem)
const pushTask = Builder.task(pushWorkItem)

const notificationWorkflow = Builder.workflow('notification')
  .startCondition('start')
  .dummyTask('dispatch', dispatchTask)
  .task('sendEmail', emailTask)
  .task('sendSms', smsTask)
  .task('sendPush', pushTask)
  .dummyTask('gather', gatherTask)
  .task('logResults', logResultsTask)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('dispatch'))
  .connectTask('dispatch', (to) =>
    to
      .task('sendEmail')
      .task('sendSms')
      .task('sendPush')
      .route(async ({ mutationCtx, route, parent }) => {
        // Determine which notifications to send using domain function
        const user = await UserDomain.getByWorkflowId(
          mutationCtx,
          parent.workflow.id,
        )
        const routes: AvailableRoutes<typeof route>[] = []
        if (user.preferences.email) routes.push(route.toTask('sendEmail'))
        if (user.preferences.sms) routes.push(route.toTask('sendSms'))
        if (user.preferences.push) routes.push(route.toTask('sendPush'))
        return routes
      }),
  )
  .connectTask('sendEmail', (to) => to.task('gather'))
  .connectTask('sendSms', (to) => to.task('gather'))
  .connectTask('sendPush', (to) => to.task('gather'))
  .connectTask('gather', (to) => to.task('logResults'))
  .connectTask('logResults', (to) => to.condition('end'))
```

## When to Use Dummy Tasks

- Fan-out patterns where routing logic is separate from work
- OR-join gathering where you need synchronized merge behavior without work
- Workflow structure requires a task but no domain logic exists
- Simplifying complex workflows by separating routing from work

## Dummy Task Behavior

- No work items (automatically starts and completes)
- Can have routing logic in activities
- Support all split/join types
- Useful for OR-joins that need to wait for all dynamically-selected branches

## OR-Join Reminder

OR-join is a **synchronized merge join** that waits for ALL branches that were dynamically selected (not "any branch"). Think "Dynamic AND-join" - you select branches at runtime, then wait for all of them.

## See Also

- [Dynamic Task Creation](./dynamic-tasks.md)
- [Parallel Processing with Aggregation](./parallel-aggregation.md)
