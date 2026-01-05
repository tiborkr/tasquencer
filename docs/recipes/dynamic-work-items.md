# Recipe: Dynamic Work Item Initialization

> **Prerequisites**: [Workflow Basics](../WORKFLOWS_BASIC.md), [Actions & Activities](../ACTIONS_ACTIVITIES.md)
> **Related**: [Dynamic Task Creation](./dynamic-tasks.md)

**Problem**: You need to dynamically create additional work items based on runtime data or results from previous work items.

**Example**: Hospital workflow where a doctor can order additional tests based on initial results.

```typescript
// Domain functions
const ExaminationDomain = {
  async create(
    ctx: { db: DatabaseWriter },
    data: {
      workItemId: Id<'tasquencerWorkItems'>
      patientId: string
      testType: 'blood' | 'urine' | 'other'
    },
  ) {
    return await ctx.db.insert('examinations', {
      workItemId: data.workItemId,
      patientId: data.patientId,
      testType: data.testType,
      status: 'pending',
    })
  },

  async getByWorkItemId(
    ctx: { db: DatabaseReader },
    workItemId: Id<'tasquencerWorkItems'>,
  ) {
    const exam = await ctx.db
      .query('examinations')
      .withIndex('by_workItemId', (q) => q.eq('workItemId', workItemId))
      .unique()
    if (!exam) throw new Error('Examination not found')
    return exam
  },

  async update(
    ctx: { db: DatabaseWriter },
    workItemId: Id<'tasquencerWorkItems'>,
    data: {
      results: Record<string, any>
      recommendedFollowUp?: {
        testType: 'blood' | 'urine' | 'other'
        reason: string
      }
    },
  ) {
    const exam = await ExaminationDomain.getByWorkItemId(ctx, workItemId)
    await ctx.db.patch(exam._id, {
      results: data.results,
      recommendedFollowUp: data.recommendedFollowUp,
      status: 'completed',
    })
  },
}

const PatientDomain = {
  async getByWorkflowId(
    ctx: { db: DatabaseReader },
    workflowId: Id<'tasquencerWorkflows'>,
  ) {
    const patient = await ctx.db
      .query('patients')
      .withIndex('by_workflow', (q) => q.eq('workflowId', workflowId))
      .unique()
    if (!patient) throw new Error('Patient not found')
    return patient
  },
}

// Define a generic examination work item that handles different test types
const examinationWorkItem = Builder.workItem('examination').withActions(
  Builder.workItemActions()
    .initialize(
      z.object({
        patientId: z.string(),
        testType: z.enum(['blood', 'urine', 'other']),
      }),
      async ({ mutationCtx, workItem }, payload) => {
        const workItemId = await workItem.initialize()
        await ExaminationDomain.create(mutationCtx, {
          workItemId,
          patientId: payload.patientId,
          testType: payload.testType,
        })
      },
    )
    .complete(
      z.object({
        results: z.record(z.string(), z.any()),
        recommendedFollowUp: z.optional(
          z.object({
            testType: z.enum(['blood', 'urine', 'other']),
            reason: z.string(),
          }),
        ),
      }),
      async ({ mutationCtx, workItem }, payload) => {
        await ExaminationDomain.update(mutationCtx, workItem.id, {
          results: payload.results,
          recommendedFollowUp: payload.recommendedFollowUp,
        })
      },
    ),
)

// Single examination task that can handle multiple test types
const examinationTask = Builder.task(examinationWorkItem).withActivities({
  onEnabled: async ({ workItem, mutationCtx, parent }) => {
    const patient = await PatientDomain.getByWorkflowId(
      mutationCtx,
      parent.workflow.id,
    )
    // Start with blood test
    await workItem.initialize({
      patientId: patient._id,
      testType: 'blood',
    })
  },

  // Key: dynamically initialize additional examinations based on results
  onWorkItemStateChanged: async ({
    workItem,
    mutationCtx,
    task,
    parent,
  }) => {
    if (workItem.nextState === 'completed') {
      // Check if doctor recommended follow-up examination using domain function
      const exam = await ExaminationDomain.getByWorkItemId(
        mutationCtx,
        workItem.id,
      )

      if (exam.recommendedFollowUp) {
        // Dynamically create another examination work item of different type!
        const patient = await PatientDomain.getByWorkflowId(
          mutationCtx,
          parent.workflow.id,
        )
        await task.getWorkItem().initialize({
          patientId: patient._id,
          testType: exam.recommendedFollowUp.testType, // e.g., 'urine'
        })
      }
    }
  },
})

// Use in workflow
const diagnosticWorkflow = Builder.workflow('diagnostic')
  .startCondition('start')
  .task('examination', examinationTask)
  .task('diagnosis', diagnosisTask)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('examination'))
  .connectTask('examination', (to) => to.task('diagnosis'))
  .connectTask('diagnosis', (to) => to.condition('end'))
```

## How It Works

1. **Initial examination**: Patient arrives with fever → blood test work item is initialized
2. **Blood test completed**: Doctor reviews results, suspects cystitis
3. **Dynamic follow-up**: Doctor fills form with `recommendedFollowUp: { testType: 'urine', reason: 'suspected cystitis' }`
4. **`onWorkItemStateChanged` fires**: Before completion policy is checked
5. **New work item created**: Urine test examination work item is initialized in the same task
6. **Task waits**: Completion policy (default: all work items completed) prevents task from completing
7. **Urine test completed**: Now all work items are done, task completes

## Key Benefits

- Single generic work item type handles multiple examination types
- Runtime decision making based on actual examination results
- No need to predict follow-up tests upfront
- Task automatically waits for dynamically created work items
- Same pattern works for composite tasks with `onWorkflowStateChanged`

## Critical Timing

`onWorkItemStateChanged` runs **before** the task's completion policy is evaluated. This ensures dynamically created work items prevent premature task completion.

## See Also

- [Dynamic Task Creation](./dynamic-tasks.md)
- [Displaying Workflow State in UI](./workflow-state-ui.md)
