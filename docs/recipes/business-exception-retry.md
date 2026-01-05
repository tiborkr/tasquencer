# Recipe: Business Exception with Retry Logic

> **Prerequisites**: [Workflow Basics](../WORKFLOWS_BASIC.md), [Exception Handling](../EXCEPTIONS.md)
> **Related**: [External Communication](../EXTERNAL_IO.md)

**Problem**: External API call may fail transiently. You want to retry a few times before marking as failed.

**Solution**: Distinguish business exceptions (no more retries) from infrastructure failures (let Convex retry). Use `onWorkItemStateChanged` to create new work items for retries.

```typescript
// Domain functions
const APIJobDomain = {
  async create(
    ctx: { db: DatabaseWriter },
    data: {
      workItemId: Id<'tasquencerWorkItems'>
      requestData: string
      maxRetries: number
      attempt: number
    },
  ) {
    return await ctx.db.insert('apiJobs', {
      workItemId: data.workItemId,
      requestData: data.requestData,
      maxRetries: data.maxRetries,
      attempt: data.attempt,
      status: 'pending',
    })
  },

  async getByWorkItemId(
    ctx: { db: DatabaseReader },
    workItemId: Id<'tasquencerWorkItems'>,
  ) {
    const job = await ctx.db
      .query('apiJobs')
      .withIndex('by_workItemId', (q) => q.eq('workItemId', workItemId))
      .unique()
    if (!job) throw new Error('API job not found')
    return job
  },

  async markFailed(
    ctx: { db: DatabaseWriter },
    workItemId: Id<'tasquencerWorkItems'>,
    error: string,
  ) {
    const job = await APIJobDomain.getByWorkItemId(ctx, workItemId)
    await ctx.db.patch(job._id, {
      status: 'failed',
      lastError: error,
    })
  },

  async markCompleted(
    ctx: { db: DatabaseWriter },
    workItemId: Id<'tasquencerWorkItems'>,
    result: string,
  ) {
    const job = await APIJobDomain.getByWorkItemId(ctx, workItemId)
    await ctx.db.patch(job._id, {
      status: 'completed',
      result,
    })
  },
}

const apiCallWorkItem = Builder.workItem('apiCall').withActions(
  Builder.workItemActions()
    .initialize(
      z.object({
        requestData: z.string(),
        maxRetries: z.number(),
        attempt: z.number().default(0),
      }),
      async ({ mutationCtx, workItem, registerScheduled }, payload) => {
        const workItemId = await workItem.initialize()

        await APIJobDomain.create(mutationCtx, {
          workItemId,
          requestData: payload.requestData,
          maxRetries: payload.maxRetries,
          attempt: payload.attempt,
        })

        // Schedule API call action
        await registerScheduled(
          mutationCtx.scheduler.runAfter(0, internal.api.callExternal, {
            workItemId,
            requestData: payload.requestData,
          }),
        )
      },
    )
    .complete(
      z.object({ result: z.string() }),
      async ({ mutationCtx, workItem }, payload) => {
        await APIJobDomain.markCompleted(mutationCtx, workItem.id, payload.result)
        await workItem.complete()
      },
    )
    .fail(
      z.object({ error: z.string() }),
      async ({ mutationCtx, workItem }, payload) => {
        await APIJobDomain.markFailed(mutationCtx, workItem.id, payload.error)
        await workItem.fail()
      },
    ),
)

const apiCallTask = Builder.task(apiCallWorkItem).withActivities({
  onWorkItemStateChanged: async ({
    workItem,
    mutationCtx,
    registerScheduled,
  }) => {
    if (workItem.nextState === 'failed') {
      const job = await APIJobDomain.getByWorkItemId(mutationCtx, workItem.id)

      if (job.attempt < job.maxRetries) {
        // Exponential backoff: 1s, 2s, 4s, 8s...
        const backoffMs = Math.pow(2, job.attempt) * 1000

        // Initialize NEW work item for retry
        const newWorkItemId = await workItem.initialize({
          requestData: job.requestData,
          maxRetries: job.maxRetries,
          attempt: job.attempt + 1,
        })

        // Schedule API call for new work item after backoff
        await registerScheduled(
          mutationCtx.scheduler.runAfter(
            backoffMs,
            internal.api.callExternal,
            {
              workItemId: newWorkItemId,
              requestData: job.requestData,
            },
          ),
        )
      }
      // If max retries exceeded, no new work item created
      // Task policy will handle completion/failure
    }
  },
})

// External API action
export const callExternal = internalAction({
  args: {
    workItemId: v.id('tasquencerWorkItems'),
    requestData: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const result = await externalAPI.call(args.requestData)

      // Success - complete the work item
      await ctx.runMutation(api.workflow.completeWorkItem, {
        workItemId: args.workItemId,
        args: { name: 'apiCall', payload: { result: result.id } },
      })
    } catch (error) {
      if (error.code === 'BUSINESS_ERROR') {
        // Business exception - mark as failed, retry logic handled by onWorkItemStateChanged
        await ctx.runMutation(api.workflow.failWorkItem, {
          workItemId: args.workItemId,
          args: {
            name: 'apiCall',
            payload: { error: error.message },
          },
        })
      } else {
        // Infrastructure failure - let Convex retry this action
        throw error
      }
    }
  },
})
```

## How It Works

1. Work item initialized → API call scheduled immediately
2. If infrastructure error (network timeout) → Action throws → Convex retries action automatically
3. If business error → `failWorkItem` called → Work item transitions to `failed`
4. `onWorkItemStateChanged` fires with `nextState === 'failed'`
5. Activity checks retry count from domain data
6. Under max retries → Create **new work item** with incremented attempt, schedule with backoff
7. Retries exhausted → No new work item created, task completes based on policy

## Key Distinction

| Error Type | Handling | Who Retries |
|-----------|----------|-------------|
| Infrastructure (network, timeout) | Throw error | Convex |
| Business (validation, auth) | Call `failWorkItem` | Your retry logic via new work item |

## Key Patterns

- **New work item per retry**: Failed work items are immutable. Create a new one for each retry attempt.
- **Exponential backoff**: `Math.pow(2, attempt) * 1000` ms delay (1s, 2s, 4s, 8s...)
- **Attempt tracking in domain**: The `apiJobs` table tracks which attempt each work item represents
- **Task-level retry logic**: `onWorkItemStateChanged` runs at the task level, not work item level

## See Also

- [AI Agent Task with Retry](./ai-agent-retry.md)
- [Exception Handling](../EXCEPTIONS.md)
