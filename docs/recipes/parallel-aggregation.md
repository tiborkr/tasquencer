# Recipe: Parallel Processing with Aggregation

> **Prerequisites**: [Advanced Workflows](../WORKFLOWS_ADVANCED.md)
> **Related**: [Dynamic Tasks](./dynamic-tasks.md) | [Fan-Out/Gather](./fan-out-gather.md)

This recipe demonstrates how to spawn parallel tasks and aggregate their results.

```typescript
// Domain functions
const ProcessResultDomain = {
  async getResultsByWorkflowId(
    ctx: { db: DatabaseReader },
    workflowId: Id<'tasquencerWorkflows'>,
  ) {
    return await ctx.db
      .query('processResults')
      .withIndex('by_workflow', (q) => q.eq('workflowId', workflowId))
      .collect()
  },
}

const processAllWorkflow = Builder.workflow('processAll')
  .startCondition('start')
  // Spawn parallel tasks
  .task('createTasks', createTasksTask.withSplitType('and'))
  .task('process1', processTask)
  .task('process2', processTask)
  .task('process3', processTask)
  // Aggregate results
  .task('aggregate', aggregateTask.withJoinType('and'))
  .endCondition('end')
  .connectCondition('start', (to) => to.task('createTasks'))
  .connectTask('createTasks', (to) =>
    to.task('process1').task('process2').task('process3'),
  )
  .connectTask('process1', (to) => to.task('aggregate'))
  .connectTask('process2', (to) => to.task('aggregate'))
  .connectTask('process3', (to) => to.task('aggregate'))
  .connectTask('aggregate', (to) => to.condition('end'))

// The aggregate task can access results from all parallel tasks
const aggregateTask = Builder.task(aggregateWorkItem).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    // Get results from all completed tasks using domain function
    const results = await ProcessResultDomain.getResultsByWorkflowId(
      mutationCtx,
      parent.workflow.id,
    )

    await workItem.initialize({ results })
  },
})
```

## How It Works

1. `createTasks` completes with AND-split, enabling all three `process*` tasks simultaneously
2. Each process task runs in parallel
3. `aggregate` task uses AND-join, waiting for ALL preceding tasks to complete
4. Once all are done, aggregate task accesses combined results

## Split and Join Types

| Type | Split Behavior | Join Behavior |
|------|---------------|---------------|
| AND | Enables ALL connected tasks | Waits for ALL incoming tasks |
| XOR | Enables ONE task (routing) | Fires when ANY incoming task completes |
| OR | Enables SELECTED tasks dynamically | Waits for all SELECTED branches |

## See Also

- [Fan-Out/Gather with Dummy Tasks](./fan-out-gather.md)
- [Dynamic Task Creation](./dynamic-tasks.md)
