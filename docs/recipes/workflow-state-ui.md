# Recipe: Displaying Workflow State in UI

> **Prerequisites**: [Workflow Basics](../WORKFLOWS_BASIC.md)
> **Related**: [UI Integration](../UI_INTEGRATION.md)

**Problem**: You need to show which tasks are active/completed in your UI without duplicating state.

**Solution**: Use the `getWorkflowTaskStates` helper for type-safe, reactive state access.

```typescript
// Step 1: Define your workflow
const documentWorkflow = Builder.workflow('documentApproval')
  .startCondition('start')
  .task('draft', draftTask)
  .task('review', reviewTask)
  .task('approve', approveTask)
  .endCondition('end')
  // ... connections

// Step 2: Register workflow version
import { versionManagerFor } from '../../tasquencer'

export const documentWorkflowVersionManager = versionManagerFor('documentApproval')
  .registerVersion('v1', documentWorkflow)
  .build('v1')

// Step 3: Export API with helpers
export const {
  initializeRootWorkflow,
  completeWorkItem,
  helpers: { getWorkflowTaskStates },
} = documentWorkflowVersionManager.apiForVersion('v1')

// Step 4: Create a query wrapper (controls who can access this)
export const getDocumentWorkflowTaskStates = query({
  args: {
    workflowId: v.id('tasquencerWorkflows'),
  },
  handler: async (ctx, args) => {
    // Type-safe! Returns: { draft: TaskState, review: TaskState, approve: TaskState }
    return await getWorkflowTaskStates(ctx.db, {
      workflowName: 'documentApproval',
      workflowId: args.workflowId,
    })
  },
})

// Step 4: Use in your UI (React example)
function DocumentWorkflowProgress({ workflowId }) {
  const taskStates = useQuery(
    api.myWorkflow.getDocumentWorkflowTaskStates,
    { workflowId }
  )

  if (!taskStates) return <Spinner />

  return (
    <div>
      <Step
        name="Draft"
        status={taskStates.draft}
        active={taskStates.draft === 'started'}
        completed={taskStates.draft === 'completed'}
      />
      <Step
        name="Review"
        status={taskStates.review}
        active={taskStates.review === 'started'}
        completed={taskStates.review === 'completed'}
      />
      <Step
        name="Approve"
        status={taskStates.approve}
        active={taskStates.approve === 'started'}
        completed={taskStates.approve === 'completed'}
      />
    </div>
  )
}
```

## Benefits

- Type-safe access to task states
- Automatically reactive (Convex query)
- No manual state synchronization
- Single source of truth
- Zero boilerplate in workflow definition

## Don't Do This

```typescript
// WRONG: Manually tracking states in domain tables
.withActivities({
  onStarted: async ({ mutationCtx, parent }) => {
    await addActiveState(db, parent.workflow.id, 'reviewing') // Boilerplate!
  },
  onCompleted: async ({ mutationCtx, parent }) => {
    await removeActiveState(db, parent.workflow.id, 'reviewing') // More boilerplate!
  },
  // ... repeat for onFailed, onCanceled
})
```

## See Also

- [UI Integration](../UI_INTEGRATION.md) - Complete UI patterns
- [Workflow State Dashboard](../WORKFLOW_STATE_UI.md)
