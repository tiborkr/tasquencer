# Recipe Book

> **Prerequisites**: [Workflow Basics](./WORKFLOWS_BASIC.md), [Advanced Workflows](./WORKFLOWS_ADVANCED.md)
> **Related**: [Exception Handling](./EXCEPTIONS.md) | [Compensation](./COMPENSATION.md) | [External Communication](./EXTERNAL_IO.md)

This guide provides common workflow patterns and recipes you can use as templates.

**Note on Schema Organization**: All schema examples in this guide assume workflow-specific tables are defined in `convex/workflows/{workflowName}/schema.ts` and exported as a default object. See [Domain Modeling - Schema File Organization](./DOMAIN_MODELING.md#schema-file-organization) for details.

## Core Recipes

### Human Interaction Patterns

| Recipe | Description |
|--------|-------------|
| [Human-in-the-Loop Approval](./recipes/human-in-the-loop.md) | Implement human approval workflows with typed payloads and authentication |
| [Authorization and Work Queues](./recipes/authorization-work-queues.md) | Role-based work assignment using the metadata factory pattern |
| [Shared Helper Functions](./recipes/shared-helpers.md) | Factory-generated helpers for consistent work item operations |

### Retry and Error Handling

| Recipe | Description |
|--------|-------------|
| [AI Agent Task with Retry](./recipes/ai-agent-retry.md) | AI agent tasks with automatic retry logic and exponential backoff |
| [Business Exception with Retry](./recipes/business-exception-retry.md) | Distinguish business exceptions from infrastructure failures |

### Parallel Processing

| Recipe | Description |
|--------|-------------|
| [Parallel Processing with Aggregation](./recipes/parallel-aggregation.md) | Spawn parallel tasks and aggregate their results |
| [Fan-Out/Gather with Dummy Tasks](./recipes/fan-out-gather.md) | Structural split/join without domain logic |

### Timeouts and Scheduling

| Recipe | Description |
|--------|-------------|
| [Timeout with Cancellation](./recipes/timeouts-cancellation.md) | Timeouts that cancel other tasks when triggered |
| [Scheduling Actions in Teardown Activities](./recipes/teardown-scheduling.md) | Schedule jobs that outlive the element lifecycle |

### Dynamic Workflows

| Recipe | Description |
|--------|-------------|
| [Dynamic Task Creation](./recipes/dynamic-tasks.md) | Create tasks dynamically based on runtime data |
| [Dynamic Work Item Initialization](./recipes/dynamic-work-items.md) | Create additional work items based on results |

### UI Integration

| Recipe | Description |
|--------|-------------|
| [Displaying Workflow State in UI](./recipes/workflow-state-ui.md) | Type-safe, reactive workflow state for UI |
| [Root Workflow ID for Nested Workflows](./recipes/root-workflow-id.md) | Query aggregate data from nested workflows |

---

## Building User Interfaces

Building UIs for Tasquencer workflows requires understanding how to bridge workflow state with user interactions. This section provides detailed patterns for creating workflow-driven applications.

### UI Architecture Principles

**Core principle: Separate concerns**

- **Workflow state**: Task/work item states, control flow (managed by Tasquencer)
- **Domain state**: Business data, user content (managed by domain tables)
- **UI state**: Display preferences, local forms (managed by React/client)

**Key insight**: The UI should query both workflow state (for progress/actions) AND domain state (for content/business logic).

### Technology Stack Reference

The example patterns in this section assume this stack (adjust as needed):

- **Frontend**: React with TanStack Router for file-based routing
- **State Management**: TanStack Query + Convex (reactive queries)
- **Forms**: react-hook-form + Zod validation
- **UI Components**: shadcn/ui (Radix UI + Tailwind CSS)
- **Backend**: Convex (all workflow APIs are Convex queries/mutations)

**Important**: These patterns are framework-agnostic. Adapt to your stack by replacing:

- TanStack Router → Next.js App Router, Remix, etc.
- shadcn/ui → Material UI, Chakra UI, custom components
- TanStack Query → SWR, Apollo, native Convex hooks

### UI Development Workflow

Follow these steps to build workflow UIs:

```
1. Workflow Implementation Complete
   ↓ (You've already built the workflow following earlier sections)

2. Create Domain Queries
   ↓ (Queries that fetch both domain AND workflow state)

3. Design Route Structure
   ↓ (File-based routing mirroring workflow hierarchy)

4. Build List Views
   ↓ (Tables showing all workflow instances)

5. Build Detail Views
   ↓ (Show workflow progress + domain content)

6. Build Form Views
   ↓ (Work item actions with validation)

7. Add Status Indicators
   ↓ (Visual workflow progress)

8. Test User Flows
   ↓ (End-to-end interaction testing)
```

---

### Step 1: Domain Queries

Create queries that combine domain data with workflow state for UI consumption.

**Pattern: Aggregate Root with Workflow State**

```typescript
// convex/workflows/myWorkflow/definition.ts
import { versionManagerFor } from '../../tasquencer'
import { myWorkflow } from './workflow'

export const myWorkflowVersionManager = versionManagerFor('myWorkflow')
  .registerVersion('v1', myWorkflow)
  .build('v1')

// convex/workflows/myWorkflow/api/workflow.ts
import { query } from '../../../_generated/server'
import { v } from 'convex/values'
import { myWorkflowVersionManager } from '../definition'

// Export helpers from version manager
export const {
  helpers: { getWorkflowState, getWorkflowTaskStates, getWorkItemState },
} = myWorkflowVersionManager.apiForVersion('v1')

// Query for list view
export const listItems = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query('myDomainTable').collect()

    return await Promise.all(
      items.map(async (item) => {
        const workflowState = await getWorkflowState(ctx.db, item.workflowId)
        return {
          ...item,
          workflowState, // For UI: show status badge
        }
      }),
    )
  },
})

// Query for detail view
export const getItemById = query({
  args: { itemId: v.id('myDomainTable') },
  handler: async (ctx, args) => {
    const item = await MyDomain.getById(ctx, args.itemId)

    // Get workflow state for progress display
    const workflowState = await getWorkflowState(ctx.db, item.workflowId)

    // Get task states for action buttons
    const taskStates = await getWorkflowTaskStates(ctx.db, {
      workflowName: 'myWorkflow',
      workflowId: item.workflowId,
    })

    return {
      item, // Domain data
      workflowState, // Overall progress
      taskStates, // Enable/disable buttons
    }
  },
})

// Query for work item form
export const getWorkItemContext = query({
  args: { workItemId: v.id('tasquencerWorkItems') },
  handler: async (ctx, args) => {
    // Get work item state
    const workItemState = await getWorkItemState(ctx.db, args.workItemId)

    // Get domain data linked to work item
    const domainData = await MyDomain.getByWorkItemId(ctx, args.workItemId)

    return {
      workItemState, // 'initialized' | 'started' | etc.
      domainData, // Content to display/edit
    }
  },
})
```

**Why these queries?**

- Single round-trip for all needed data
- UI gets both domain AND workflow state
- Reactive updates via Convex subscriptions
- Type-safe return types

---

### Step 2: Route Structure

Organize routes to mirror workflow hierarchy and workflow actions.

**Pattern: Domain-Oriented Routing**

```
/myworkflow                          # List all workflow instances
/myworkflow/new                      # Initialize new workflow
/myworkflow/:workflowId              # View workflow progress/details
/myworkflow/:workflowId/tasks/:taskName/:workItemId  # Complete work item
```

For complete route structure examples and UI component patterns, see [UI Integration](./UI_INTEGRATION.md).

---

### Common UI Patterns

#### Pattern: Work Item Lifecycle UI

Work items have a standard lifecycle that should be reflected in the UI:

```typescript
// Reusable component for work item forms
interface WorkItemFormProps {
  workItemId: Id<'tasquencerWorkItems'>
  workItemName: string
  children: (ctx: {
    workItemState: WorkItemState
    canClaim: boolean
    canSubmit: boolean
  }) => React.ReactNode
  onClaim?: () => Promise<void>
  onSubmit?: () => Promise<void>
}

function WorkItemForm({
  workItemId,
  workItemName,
  children,
  onClaim,
  onSubmit,
}: WorkItemFormProps) {
  const { data } = useSuspenseQuery(
    convexQuery(api.workflows.myWorkflow.getWorkItemContext, { workItemId }),
  )

  const startWorkItem = useMutation(api.workflows.myWorkflow.startWorkItem)

  const workItemState = data.workItemState
  const canClaim = workItemState === 'initialized'
  const canSubmit = workItemState === 'started'

  const handleClaim = async () => {
    await startWorkItem({
      workItemId,
      args: { name: workItemName, payload: null },
    })
    await onClaim?.()
  }

  return (
    <Card>
      <CardContent>
        {/* Render children with context */}
        {children({ workItemState, canClaim, canSubmit })}
      </CardContent>
      <CardFooter>
        {canClaim && <Button onClick={handleClaim}>Claim Task</Button>}
        {canSubmit && (
          <Button onClick={onSubmit} disabled={!onSubmit}>
            Submit
          </Button>
        )}
        {!canClaim && !canSubmit && (
          <p className="text-muted-foreground text-sm">
            Task is {workItemState}
          </p>
        )}
      </CardFooter>
    </Card>
  )
}
```

#### Pattern: Status-Based Conditional Rendering

Show different UI based on workflow/work item state:

```typescript
function RfpActions({ rfp, taskStates }: RfpActionsProps) {
  const { rfpId } = useParams()

  // Show actions based on current workflow state
  if (taskStates.draft === 'enabled') {
    return (
      <Link to="/rfps/$rfpId/tasks/draft/$workItemId" params={{ rfpId }}>
        <Button>Start Drafting</Button>
      </Link>
    )
  }

  if (taskStates.legalReview === 'enabled') {
    return (
      <div className="flex gap-2">
        <Link to="/rfps/$rfpId/tasks/legalReview/$workItemId" params={{ rfpId }}>
          <Button>Legal Review</Button>
        </Link>
        <Button variant="outline" onClick={handleSkipReview}>
          Skip Review
        </Button>
      </div>
    )
  }

  if (taskStates.publish === 'completed') {
    return (
      <div className="flex items-center gap-2 text-green-600">
        <CheckCircle2 className="h-5 w-5" />
        <span className="font-medium">Published</span>
      </div>
    )
  }

  return <p className="text-muted-foreground">No actions available</p>
}
```

---

### UI Checklist

When building workflow UIs, ensure you cover:

**Data Queries:**

- [ ] Query combines domain AND workflow state
- [ ] Uses `getWorkflowState` for overall status
- [ ] Uses `getWorkflowTaskStates` for task-level actions
- [ ] Uses `getWorkItemState` for work item forms
- [ ] Reactive queries update automatically

**Routes:**

- [ ] List view for all workflow instances
- [ ] Detail view showing workflow progress
- [ ] Form views for each work item type
- [ ] Proper route parameters for IDs
- [ ] Breadcrumbs for navigation context

**Components:**

- [ ] Work item lifecycle (claim → edit → submit)
- [ ] Workflow progress visualization
- [ ] Task state badges/indicators
- [ ] Conditional rendering based on states
- [ ] Loading states with Suspense
- [ ] Error boundaries for failed workflows

**Forms:**

- [ ] Zod validation matching backend schemas
- [ ] Fields disabled when work item not started
- [ ] Show validation errors
- [ ] Handle form submission correctly
- [ ] Navigate after successful completion

**User Experience:**

- [ ] Visual feedback for state changes
- [ ] Disable buttons when actions unavailable
- [ ] Show who's working on what (if collaborative)
- [ ] Confirmation dialogs for destructive actions
- [ ] Clear error messages
- [ ] Responsive design for mobile/desktop

---

### Common Pitfalls

**Don't:**

- Mix workflow state checks in business logic mutations
- Store UI state in domain tables (use React state)
- Rely on workflow state for authorization (use domain data)
- Skip validation on client side (double validation is good)
- Forget to handle failed/canceled states in UI
- Hard-code task names (use constants/types)

**Do:**

- Use workflow state ONLY for UI display/actions
- Validate forms on both client and server
- Handle all workflow states (initialized, started, completed, failed, canceled)
- Use type-safe work item names from generated APIs
- Test complete user flows end-to-end
- Provide clear feedback for every user action
