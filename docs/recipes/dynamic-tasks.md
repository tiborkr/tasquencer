# Recipe: Dynamic Task Creation

> **Prerequisites**: [Advanced Workflows](../WORKFLOWS_ADVANCED.md)
> **Related**: [Dynamic Work Item Initialization](./dynamic-work-items.md) | [Fan-Out/Gather](./fan-out-gather.md)

This recipe demonstrates how to create tasks dynamically based on runtime data.

```typescript
import { type AvailableRoutes } from '../tasquencer/builder/flow'

// Domain functions
const ProcessingJobDomain = {
  async create(
    ctx: { db: DatabaseWriter },
    data: { workflowId: Id<'tasquencerWorkflows'>; itemIds: string[] },
  ) {
    return await ctx.db.insert('processingJobs', {
      workflowId: data.workflowId,
      itemIds: data.itemIds,
      completed: [],
    })
  },

  async getByWorkflowId(
    ctx: { db: DatabaseReader },
    workflowId: Id<'tasquencerWorkflows'>,
  ) {
    const job = await ctx.db
      .query('processingJobs')
      .withIndex('by_workflow', (q) => q.eq('workflowId', workflowId))
      .unique()
    if (!job) throw new Error('Processing job not found')
    return job
  },
}

// Create tasks dynamically based on data
const dynamicWorkflow = Builder.workflow('dynamic')
  .withActions(
    Builder.workflowActions().initialize(
      z.object({ itemIds: z.array(z.string()) }),
      async ({ mutationCtx, workflow }, payload) => {
        const workflowId = await workflow.initialize()

        // Store items to process using domain function
        await ProcessingJobDomain.create(mutationCtx, {
          workflowId,
          itemIds: payload.itemIds,
        })
      },
    ),
  )
  .startCondition('start')
  .task('dispatch', dispatchTask.withSplitType('or'))
  .task('process', processTask)
  .task('collect', collectTask.withJoinType('or'))
  .endCondition('end')
  .connectCondition('start', (to) => to.task('dispatch'))
  .connectTask('dispatch', (to) =>
    to.task('process').route(async ({ mutationCtx, route, parent }) => {
      // Create one route per item using domain function
      const job = await ProcessingJobDomain.getByWorkflowId(
        mutationCtx,
        parent.workflow.id,
      )
      const routes: AvailableRoutes<typeof route>[] = job.itemIds.map(() =>
        route.toTask('process'),
      )
      return routes
    }),
  )
  .connectTask('process', (to) => to.task('collect'))
  .connectTask('collect', (to) => to.condition('end'))

// The dispatch task creates multiple work items
const dispatchTask = Builder.task(dispatchWorkItem).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    const job = await ProcessingJobDomain.getByWorkflowId(
      mutationCtx,
      parent.workflow.id,
    )

    // Create work item for each item
    for (const itemId of job.itemIds) {
      await workItem.initialize({ itemId })
    }
  },
})
```

## How It Works

1. Workflow initialized with array of item IDs
2. `dispatch` task uses OR-split with routing function
3. Routing function returns one route per item
4. Multiple instances of `process` task are created
5. `collect` task uses OR-join to wait for all instances

## Key Patterns

- **Store runtime data**: Use domain tables to store items to process
- **Dynamic routing**: Return multiple routes from routing function
- **Multiple work items**: Initialize one work item per item to process

## See Also

- [Dynamic Work Item Initialization](./dynamic-work-items.md)
- [Fan-Out/Gather with Dummy Tasks](./fan-out-gather.md)
