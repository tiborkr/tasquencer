# Recipe: AI Agent Task with Retry

> **Prerequisites**: [Workflow Basics](../WORKFLOWS_BASIC.md), [Actions & Activities](../ACTIONS_ACTIVITIES.md)
> **Related**: [External Communication](../EXTERNAL_IO.md) | [Exception Handling](../EXCEPTIONS.md)

This recipe demonstrates how to implement AI agent tasks with automatic retry logic and exponential backoff.

**Problem**: AI generation may fail transiently (rate limits, timeouts). You want to retry a few times before giving up.

**Solution**: Use `onWorkItemStateChanged` to detect failures and create new work items for retries.

```typescript
// Domain functions
const AiJobDomain = {
  async create(
    ctx: { db: DatabaseWriter },
    data: {
      workItemId: Id<'tasquencerWorkItems'>
      prompt: string
      maxRetries: number
      attempt: number
    },
  ) {
    return await ctx.db.insert('aiJobs', {
      workItemId: data.workItemId,
      prompt: data.prompt,
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
      .query('aiJobs')
      .withIndex('by_workItemId', (q) => q.eq('workItemId', workItemId))
      .unique()
    if (!job) throw new Error('AI job not found')
    return job
  },

  async markFailed(
    ctx: { db: DatabaseWriter },
    workItemId: Id<'tasquencerWorkItems'>,
    error: string,
  ) {
    const job = await AiJobDomain.getByWorkItemId(ctx, workItemId)
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
    const job = await AiJobDomain.getByWorkItemId(ctx, workItemId)
    await ctx.db.patch(job._id, {
      status: 'completed',
      result,
    })
  },
}

const aiGenerationWorkItem = Builder.workItem('aiGeneration').withActions(
  Builder.workItemActions()
    .initialize(
      z.object({
        prompt: z.string(),
        maxRetries: z.number(),
        attempt: z.number().default(0),
      }),
      async ({ mutationCtx, workItem, registerScheduled }, payload) => {
        const workItemId = await workItem.initialize()

        await AiJobDomain.create(mutationCtx, {
          workItemId,
          prompt: payload.prompt,
          maxRetries: payload.maxRetries,
          attempt: payload.attempt,
        })

        // Schedule AI generation action
        await registerScheduled(
          mutationCtx.scheduler.runAfter(0, internal.ai.generateContent, {
            workItemId,
            prompt: payload.prompt,
          }),
        )
      },
    )
    .complete(
      z.object({ result: z.string() }),
      async ({ mutationCtx, workItem }, payload) => {
        await AiJobDomain.markCompleted(mutationCtx, workItem.id, payload.result)
        await workItem.complete()
      },
    )
    .fail(
      z.object({ error: z.string() }),
      async ({ mutationCtx, workItem }, payload) => {
        await AiJobDomain.markFailed(mutationCtx, workItem.id, payload.error)
        await workItem.fail()
      },
    ),
)

const aiGenerationTask = Builder.task(aiGenerationWorkItem).withActivities({
  onWorkItemStateChanged: async ({
    workItem,
    mutationCtx,
    registerScheduled,
  }) => {
    if (workItem.nextState === 'failed') {
      const job = await AiJobDomain.getByWorkItemId(mutationCtx, workItem.id)

      if (job.attempt < job.maxRetries) {
        // Exponential backoff: 1s, 2s, 4s, 8s...
        const backoffMs = Math.pow(2, job.attempt) * 1000

        // Initialize NEW work item for retry
        const newWorkItemId = await workItem.initialize({
          prompt: job.prompt,
          maxRetries: job.maxRetries,
          attempt: job.attempt + 1,
        })

        // Schedule AI generation for new work item after backoff
        await registerScheduled(
          mutationCtx.scheduler.runAfter(
            backoffMs,
            internal.ai.generateContent,
            { workItemId: newWorkItemId, prompt: job.prompt },
          ),
        )
      }
      // If max retries exceeded, no new work item created
      // Task policy will handle completion/failure
    }
  },
})

// External AI action
export const generateContent = internalAction({
  args: {
    workItemId: v.id('tasquencerWorkItems'),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const result = await aiService.generate(args.prompt)

      // Success - complete the work item
      await ctx.runMutation(api.workflow.completeWorkItem, {
        workItemId: args.workItemId,
        args: { name: 'aiGeneration', payload: { result } },
      })
    } catch (error) {
      // Fail the work item - retry logic handled by onWorkItemStateChanged
      await ctx.runMutation(api.workflow.failWorkItem, {
        workItemId: args.workItemId,
        args: {
          name: 'aiGeneration',
          payload: { error: error.message },
        },
      })
    }
  },
})
```

## How It Works

1. Work item initialized → AI generation scheduled immediately
2. If AI fails → `failWorkItem` called → Work item transitions to `failed`
3. `onWorkItemStateChanged` fires with `nextState === 'failed'`
4. Activity checks retry count from domain data
5. Under max retries → Create **new work item** with incremented attempt, schedule with backoff
6. Retries exhausted → No new work item created, task completes based on policy

## Key Patterns

- **New work item per retry**: Failed work items are immutable. Create a new one for each retry attempt.
- **Exponential backoff**: `Math.pow(2, attempt) * 1000` ms delay (1s, 2s, 4s, 8s...)
- **Attempt tracking in domain**: The `aiJobs` table tracks which attempt each work item represents
- **Task-level retry logic**: `onWorkItemStateChanged` runs at the task level, not work item level

## Why Not Use `.fail()` Action for Retry?

When a work item transitions to `failed`, it becomes terminal - no further actions can be taken on it. The `.fail()` action runs during the transition, but any scheduled work would be orphaned since the work item is done.

The correct approach is to handle retries at the **task level** via `onWorkItemStateChanged`, which:
- Fires after the work item state change
- Has access to `workItem.initialize()` to create new work items
- Has `registerScheduled` to tie scheduled work to the task lifecycle

## See Also

- [Business Exception with Retry Logic](./business-exception-retry.md)
- [Timeouts and Cancellation](./timeouts-cancellation.md)
