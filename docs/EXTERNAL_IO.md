# External Communication

> **Prerequisites**: [Actions vs Activities](./ACTIONS_ACTIVITIES.md), [Workflow Basics](./WORKFLOWS_BASIC.md)  
> **Related**: [Exception Handling](./EXCEPTIONS.md) | [Recipe Book](./RECIPES.md)

This guide covers how to communicate with external systems and APIs from Tasquencer workflows.

## Table of Contents

- [The Problem](#the-problem)
- [The Solution: Convex Scheduler](#the-solution-convex-scheduler)
- [Pattern: Async Work](#pattern-async-work)
- [Pattern: Timed Delays](#pattern-timed-delays)

---

## External Communication

### The Problem

Tasquencer runs in a **single atomic mutation**. It cannot:

- ❌ Make HTTP requests
- ❌ Send emails
- ❌ Call external APIs
- ❌ Run long computations

### The Solution: Convex Scheduler

Tasquencer provides two ways to schedule work, each with different lifecycle management.

**Call chain tracking**: When scheduled actions call back to Tasquencer, they should use the **internal API variants** (`internalStartWorkItem`, `internalCompleteWorkItem`, etc.) which automatically set `isInternalMutation=true`. This indicates the call originates from an internal system callback rather than a direct user action, enabling different authorization strategies for internal vs external calls. For custom actions that check `isInternalMutation`, this allows skipping user authentication. See [Authorization → Internal vs External Mutations](./AUTHORIZATION.md#internal-vs-external-mutations) for details.

#### `registerScheduled` - Tied Lifecycle

Use `registerScheduled` when the scheduled job should be **automatically canceled** if the element (work item/task/workflow) fails or cancels:

```typescript
// Scheduled job will be auto-canceled if work item fails
async ({ mutationCtx, workItem, registerScheduled }, payload) => {
  const workItemId = await workItem.initialize()

  await registerScheduled(
    mutationCtx.scheduler.runAfter(0, internal.api.callExternal, {
      workItemId,
    }),
  )
}
```

**Use `registerScheduled` when:**
- Scheduling work during active lifecycle (`initialize`, `onEnabled`, `onStarted`)
- You want automatic cleanup if the parent element fails/cancels
- The scheduled work only makes sense if the parent element is alive (e.g., timeouts)

#### `scheduler` Directly - Independent Lifecycle

Use `scheduler` directly (without `registerScheduled`) when the scheduled job should **outlive** the element:

```typescript
// Scheduled job will run even after work item fails/cancels
.withActivities({
  onFailed: async ({ mutationCtx, workItem }) => {
    // ✅ Use scheduler directly - notification should be sent even after element dies
    await mutationCtx.scheduler.runAfter(
      0,
      internal.alerts.sendFailureNotification,
      { workItemId: workItem.id }
    )
  }
})
```

**Use `scheduler` directly when:**
- Scheduling work in teardown activities (`onCompleted`, `onCanceled`, `onFailed`)
- Sending notifications/alerts about completion/failure/cancellation
- Scheduling follow-up work that should survive element cleanup
- Any work that shouldn't be tied to the element's lifecycle

> **Critical Rule for Teardown Activities:** In `onCompleted`, `onCanceled`, and `onFailed` activities, you **MUST NOT** use `registerScheduled`. These activities execute while Tasquencer is actively clearing scheduled entries for the element being torn down. Any jobs registered during this cleanup phase will be immediately canceled. Instead, use `scheduler` directly so the scheduled work outlives the element.

```typescript
const sendEmailWorkItem = Builder.workItem('sendEmail')
  .withActions(
    Builder.workItemActions().initialize(
      z.object({ to: z.string(), subject: z.string() }),
      async ({ mutationCtx, workItem, registerScheduled }, payload) => {
        const workItemId = await workItem.initialize()

        // Schedule external work
        await registerScheduled(
          mutationCtx.scheduler.runAfter(0, internal.emails.sendEmailAction, {
            workItemId,
            to: payload.to,
            subject: payload.subject,
          }),
        )
      },
    ),
  )
  .withActivities({
  onInitialized: async ({ mutationCtx, workItem }) => {
      // Create domain record to track status
      await EmailDomain.createJob(mutationCtx, {
        workItemId: workItem.id,
        status: 'pending',
      })
    },
  })
```

Then in your action:

```typescript
// convex/emails.ts
export const sendEmailAction = internalAction({
  args: {
    workItemId: v.id('tasquencerWorkItems'),
    to: v.string(),
    subject: v.string(),
  },
  handler: async (ctx, args) => {
    // Can do I/O here!
    await sendEmailViaAPI(args.to, args.subject)

    // Use internal API variant - automatically sets isInternalMutation=true
    await ctx.runMutation(internal.myWorkflow.internalCompleteWorkItem, {
      workItemId: args.workItemId,
      args: {
        name: 'sendEmail',
        payload: {},
      },
    })
  },
})
```

### Pattern: Async Work

```
┌─────────────────────────────────────────────────┐
│ 1. Tasquencer: Initialize work item            │
│    → Store workItemId in domain table          │
│    → Schedule action with workItemId            │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 2. Convex Action: Do external work             │
│    → Make API calls, send emails, etc.         │
│    → Update domain table with results          │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 3. Tasquencer: Complete work item              │
│    → Action calls back via API                  │
│    → Workflow continues                         │
└─────────────────────────────────────────────────┘
```

**Authorization context (Custom Actions Only)**: If you're using default actions, they automatically assert internal mutation and this pattern isn't needed. For custom actions, the callback from the action uses an internal mutation (via `internalCompleteWorkItem`), so `isInternalMutation` will be `true`. This allows you to bypass user authentication checks for system callbacks:

```typescript
// Custom action with authentication
.withActions(
  Builder.workItemActions().complete(
    z.object({ result: z.string() }),
    async ({ mutationCtx, workItem, isInternalMutation }, payload) => {
      // Skip user auth for internal callbacks
      if (!isInternalMutation) {
        const authUser = await authComponent.safeGetAuthUser(mutationCtx)
        assertAuthenticatedUser(authUser, { operation: 'completeWorkItem' })
      }

      // Business logic
      await MyDomain.saveResult(mutationCtx, workItem.id, payload.result)
    },
  )
)
```

**Note**: If you use default actions (no `.withActions()`), they automatically enforce `isInternalMutation=true` and cannot be called from external API. They're perfect for system-only work items like the email example above.

See [Authorization → Authentication Architecture](./AUTHORIZATION.md#authentication-architecture) for full details.

### Pattern: Timed Delays

Schedule delayed work item completion using `registerScheduled` in the **task's** `onEnabled` activity:

```typescript
const delayedWorkItem = Builder.workItem('delayedWork')

const delayedTask = Builder.task(delayedWorkItem).withActivities({
  onEnabled: async ({ workItem, mutationCtx, registerScheduled }) => {
    const workItemId = await workItem.initialize()

    // Wait 1 hour before completing
    await registerScheduled(
      mutationCtx.scheduler.runAfter(
        60 * 60 * 1000, // 1 hour in ms
        internal.myWorkflow.autoCompleteWorkItem,
        { workItemId },
      ),
    )
  },
})
```

### Pattern: Teardown Activity Scheduling

When you need to schedule work from teardown activities (`onCompleted`, `onCanceled`, `onFailed`), use `scheduler` directly:

```typescript
const criticalWorkItem = Builder.workItem('criticalWork')
  .withActions(
    Builder.workItemActions().initialize(
      z.object({ data: z.string() }),
      async ({ mutationCtx, workItem, registerScheduled }, payload) => {
        const workItemId = await workItem.initialize()

        // ✅ Use registerScheduled during active lifecycle
        await registerScheduled(
          mutationCtx.scheduler.runAfter(0, internal.work.processData, {
            workItemId,
            data: payload.data,
          }),
        )
      },
    ),
  )
  .withActivities({
    onCompleted: async ({ mutationCtx, workItem, parent }) => {
      // ✅ Use scheduler directly - completion notification outlives element
      await mutationCtx.scheduler.runAfter(
        0,
        internal.notifications.sendCompletionNotification,
        {
          workItemId: workItem.id,
          workflowId: parent.workflow.id,
        },
      )

      // Inline domain state update
      await WorkDomain.markAsCompleted(mutationCtx, workItem.id)
    },

    onFailed: async ({ mutationCtx, workItem }) => {
      // ✅ Use scheduler directly - failure alert outlives element
      await mutationCtx.scheduler.runAfter(
        0,
        internal.alerts.sendFailureAlert,
        {
          workItemId: workItem.id,
          timestamp: Date.now(),
        },
      )

      // Inline cleanup
      await WorkDomain.markAsFailed(mutationCtx, workItem.id)
    },

    onCanceled: async ({ mutationCtx, workItem }) => {
      // ✅ Use scheduler directly - cancellation notification outlives element
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

**Key points:**

- ✅ **Active lifecycle** (`initialize`, `onEnabled`): Use `registerScheduled`
- ✅ **Teardown activities** (`onCompleted`, `onCanceled`, `onFailed`): Use `scheduler` directly
- ❌ **Never** use `registerScheduled` in teardown activities - it will be immediately canceled

---
