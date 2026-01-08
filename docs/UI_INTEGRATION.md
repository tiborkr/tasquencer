# UI Integration

> **Prerequisites**: [Workflow Basics](./WORKFLOWS_BASIC.md), [Domain Modeling](./DOMAIN_MODELING.md)  
> **Related**: [Actions vs Activities](./ACTIONS_ACTIVITIES.md) | [Recipe Book](./RECIPES.md)

This guide covers building user interfaces for Tasquencer workflows.

## Table of Contents

- [Philosophy: Domain-First, Not Workflow-First](#philosophy-domain-first-not-workflow-first)
- [Tech Stack](#tech-stack)
- [Routing Patterns](#routing-patterns)
- [Query Patterns](#query-patterns)
- [Form Patterns](#form-patterns)
- [State-Based UI Rendering](#state-based-ui-rendering)
- [Query Helpers for Work Items](#query-helpers-for-work-items)
- [Progress Indicators](#progress-indicators)
- [Best Practices](#best-practices)
- [Example: Complete Component](#example-complete-component)
- [Summary](#summary)

---

## Building User Interfaces

This project uses **TanStack Start** for building domain-centric UIs that reflect workflow state.

### Philosophy: Domain-First, Not Workflow-First

**Core principle**: Build UIs that make sense for your domain, not UIs that look like generic workflow apps.

```typescript
// ❌ WRONG: Generic workflow UI
function WorkflowView({ workflowId }) {
  const tasks = useWorkflowTasks(workflowId)
  return (
    <div>
      <h1>Workflow Status</h1>
      {tasks.map(task => (
        <TaskCard key={task.name} task={task} />  // Generic boxes
      ))}
    </div>
  )
}

// ✅ RIGHT: Domain-specific UI
function DiscoveryWorkshopView({ workshopId }) {
  const workshop = useWorkshop(workshopId)

  // Use activeStates from domain object to determine UI
  if (workshop.activeStates.includes('creatingPendingAgenda')) {
    return <TextLoader messages={['Reading files...', 'Writing agenda...']} />
  }

  if (workshop.activeStates.includes('validatingPendingAgenda')) {
    return <DocumentEditor document={workshop.pendingAgenda} />
  }

  if (workshop.activeStates.includes('workshopping')) {
    return <WorkshopDashboard workshop={workshop} />
  }

  return null
}
```

**Key insight**: Users see a **workshop editor**, not a workflow stepper. Workflow state is used internally to determine what to show, but the UI is domain-centric.

### Tech Stack

1. **TanStack Start**: Routing and data loading
2. **Convex + @convex-dev/react-query**: Realtime queries and mutations
3. **react-hook-form + zod**: Form validation and submission
4. **shadcn/ui**: Component library (all components installed)

> **Note**: Examples in this repo may use slightly different patterns (e.g., TanStack Query wrappers for mutations). This guide documents the recommended canonical approach.

### Routing Patterns

Match your routes to your domain hierarchy, not your workflow structure:

```typescript
// ✅ Domain-centric routes
/discovery/$sprintId/                          // Discovery sprint overview
/discovery/$sprintId/workshops/$workshopId/    // Workshop detail
/discovery/$sprintId/documents/$documentId/    // Document viewer
/rfps/$rfpId/                                  // RFP overview
/rfps/$rfpId/sections/$sectionId/              // Section editor
/er/$patientId/                                // Patient record
/er/tasks/triage/$workItemId/                  // Triage form

// ❌ Workflow-centric routes (avoid)
/workflows/$workflowId/tasks/$taskId           // Too generic
```

**Route params**: Use domain IDs (like `$rfpId`, `$workshopId`) as primary params, not `$workflowId` or `$taskId`.

### Query Patterns

#### Fetching Domain Data with Workflow State

```typescript
// convex/workflows/discovery/api.ts
export const getWorkshopById = query({
  args: { workshopId: v.id('discoverySprintWorkshops') },
  handler: async (ctx, args) => {
    const workshop = await ctx.db.get(args.workshopId)
    if (!workshop) throw new Error('Workshop not found')

    // ✅ OK: Include workflow task states for UI
    const taskStates = await getWorkflowTaskStates(ctx.db, {
      workflowName: 'discoveryWorkshop',
      workflowId: workshop.workflowId,
    })

    return {
      ...workshop,
      // Compute activeStates from task states for easier UI consumption
      activeStates: Object.entries(taskStates)
        .filter(([_, state]) => state.state === 'started')
        .map(([name]) => name),
    }
  },
})
```

**Pattern**: Domain queries can include `activeStates` arrays derived from workflow task states. This makes conditional rendering easier in components.

#### Using Queries in Components

```typescript
// src/routes/_auth.discovery.$sprintId.workshops.$workshopId.tsx
import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { api } from '@/convex/_generated/api'

function WorkshopRoute() {
  const params = Route.useParams()

  const { data: workshop } = useSuspenseQuery(
    convexQuery(api.workflows.discovery.api.getWorkshopById, {
      workshopId: params.workshopId,
    })
  )

  // Render based on activeStates
  if (workshop.activeStates.includes('validatingPendingAgenda')) {
    return <AgendaEditor workshop={workshop} />
  }

  return <WorkshopDashboard workshop={workshop} />
}
```

**Key patterns**:

- Use `useSuspenseQuery` with `convexQuery` for realtime updates
- Access workflow state via computed `activeStates` from domain object
- Conditionally render domain-appropriate components

### Form Patterns

#### Shared Schemas

For forms that call workflow/work item actions, share schemas between frontend and backend:

```typescript
// convex/workflows/rfp/schemas.ts
import { z } from 'zod'

export const completeSectionReviewSchema = z.object({
  comments: z.string().min(1, { error: 'Comments are required' }),
  approved: z.boolean(),
})

// Use in work item action
const reviewSectionActions = Builder.workItemActions().complete(
  completeSectionReviewSchema,
  async ({ mutationCtx, workItem }, payload) => {
    await RfpDomain.updateReview(mutationCtx, workItem.id, {
      comments: payload.comments,
      status: payload.approved ? 'approved' : 'rejected',
    })
  },
)
```

```typescript
// src/components/rfp/review-form.tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { completeSectionReviewSchema } from '@/convex/workflows/rfp/schemas'

function ReviewForm({ workItemId }: { workItemId: Id<'tasquencerWorkItems'> }) {
  const completeWorkItem = useMutation(api.workflows.rfp.api.completeWorkItem)

  const form = useForm({
    resolver: zodResolver(completeSectionReviewSchema),
    defaultValues: {
      comments: '',
      approved: false,
    },
  })

  const onSubmit = async (values: z.infer<typeof completeSectionReviewSchema>) => {
    await completeWorkItem({
      workItemId,
      args: {
        name: 'reviewSection',
        payload: values,  // Type-safe!
      },
    })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* Form fields */}
    </form>
  )
}
```

**Benefits**:

- Single source of truth for validation
- Type-safe forms and actions
- Validation errors consistent between frontend and backend

#### Calling Work Item Actions

```typescript
// Pattern 1: Complete with payload
const completeWorkItem = useMutation(api.workflows.rfp.api.completeWorkItem)

await completeWorkItem({
  workItemId: task.workItemId,
  args: {
    name: 'reviewSection',
    payload: { comments: 'Looks good', approved: true },
  },
})

// Pattern 2: Start (payload typically omitted unless schema requires it)
const startWorkItem = useMutation(api.workflows.rfp.api.startWorkItem)

await startWorkItem({
  workItemId: task.workItemId,
  args: {
    name: 'reviewSection',
    // payload omitted when start action has no schema
  },
})
```

### State-Based UI Rendering

#### Work Item State Mapping

Tasquencer uses these internal work item states:

- `initialized` - Created but not yet started
- `started` - Claimed/in progress
- `completed` - Successfully finished
- `failed` - Failed during execution
- `canceled` - Cancelled before completion

**UI Display Pattern**: Map internal states to domain-appropriate display text:

```typescript
// Example: mapping raw states to user-friendly display
const displayStatus = {
  initialized: 'Pending',
  started: 'In Progress', // or 'Claimed' for work queues
  completed: 'Complete',
  failed: 'Failed',
  canceled: 'Cancelled',
}[workItem.state]
```

This keeps internal workflow terminology out of your UI while using the actual state values for conditional logic.

#### Button States

Disable/enable buttons based on work item state:

```typescript
function TaskActionButtons({ task }: { task: { workItemId: Id<'tasquencerWorkItems'>, state: WorkItemState } }) {
  const startWorkItem = useMutation(api.myWorkflow.startWorkItem)
  const completeWorkItem = useMutation(api.myWorkflow.completeWorkItem)

  return (
    <div className="flex gap-2">
      <Button
        variant="secondary"
        disabled={!task || task.state !== 'initialized'}
        onClick={() => startWorkItem({
          workItemId: task.workItemId,
          args: { name: 'myTask' }
        })}
      >
        Start Task
      </Button>

      <Button
        disabled={!task || task.state !== 'started'}
        onClick={() => completeWorkItem({
          workItemId: task.workItemId,
          args: { name: 'myTask', payload: { result: 'done' } }
        })}
      >
        Complete
      </Button>

      {!task && (
        <span className="text-xs text-muted-foreground">
          Work item not ready yet
        </span>
      )}
    </div>
  )
}
```

#### Loading States

Show domain-appropriate loading UI for AI/async work:

```typescript
function WorkshopPage({ workshop }) {
  if (workshop.activeStates.includes('creatingPendingAgenda')) {
    return (
      <TextLoader
        messages={[
          'Reading files...',
          'Extracting key information...',
          'Writing pending agenda...',
          'Reviewing pending agenda...',
        ]}
      />
    )
  }

  // ... rest of UI
}
```

**Not** a generic spinner - domain-specific messages that explain what's happening.

#### Conditional Form Disabling

```typescript
function SectionEditor({ section, task }) {
  const [content, setContent] = useState(section.content)

  return (
    <Textarea
      value={content}
      onChange={(e) => setContent(e.target.value)}
      disabled={!task || task.state !== 'started'}  // Only editable when started
    />
  )
}
```

### Query Helpers for Work Items

Create query helpers to fetch work items by domain context:

```typescript
// convex/workflows/rfp/api.ts
export const getSectionEditTask = query({
  args: { sectionId: v.id('rfpSections') },
  handler: async (ctx, args) => {
    const section = await ctx.db.get(args.sectionId)
    if (!section) return null

    // Find the edit work item for this section
    const workItems = await ctx.db
      .query('tasquencerWorkItems')
      .withIndex('by_task_id', (q) =>
        q.eq('taskId' /* task id from section.workflowId */),
      )
      .collect()

    const editWorkItem = workItems.find((wi) => wi.name === 'humanEditSection')

    if (!editWorkItem) return null

    return {
      workItemId: editWorkItem._id,
      state: editWorkItem.state,
    }
  },
})
```

```typescript
// Component
function SectionEditor({ sectionId }) {
  const { data: task } = useSuspenseQuery(
    convexQuery(api.workflows.rfp.api.getSectionEditTask, { sectionId }),
  )

  // Now you can access task.state without needing to know workflow internals
}
```

### Progress Indicators

Show progress using domain state + workflow state:

```typescript
function RfpProgress({ rfp }) {
  const taskStates = useQuery(
    convexQuery(api.workflows.rfp.api.getTaskStates, {
      workflowId: rfp.workflowId,
    })
  )

  const steps = [
    { key: 'draft', label: 'Drafting', state: taskStates?.draft },
    { key: 'review', label: 'Review', state: taskStates?.review },
    { key: 'approve', label: 'Approval', state: taskStates?.approve },
    { key: 'submit', label: 'Submit', state: taskStates?.submit },
  ]

  return (
    <div className="flex items-center gap-2">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center gap-2">
          <div className={cn(
            'rounded-full w-8 h-8 flex items-center justify-center',
            step.state?.state === 'completed' && 'bg-green-500',
            step.state?.state === 'started' && 'bg-blue-500',
            step.state?.state === 'enabled' && 'bg-gray-300',
            !step.state && 'bg-gray-200'
          )}>
            {i + 1}
          </div>
          <span className="text-sm">{step.label}</span>
          {i < steps.length - 1 && <div className="w-8 h-0.5 bg-gray-300" />}
        </div>
      ))}
    </div>
  )
}
```

### Best Practices

✅ **Do:**

- Build domain-centric UIs (workshop editors, patient records, document reviewers)
- Use `activeStates` from domain objects for conditional rendering
- Share Zod schemas between frontend and backend for forms
- Disable form inputs/buttons based on work item state
- Show domain-appropriate loading states ("Analyzing feedback...") not generic spinners
- Route by domain IDs (`$rfpId`, `$workshopId`) not workflow IDs
- Use `useSuspenseQuery` with `convexQuery` for realtime updates
- Create query helpers that return work item state by domain context

❌ **Don't:**

- Build generic workflow UIs with task cards and stepper components
- Expose workflow terminology to end users ("Task is enabled", "Workflow is started")
- Fetch workflow state in mutations for business logic (use domain state instead)
- Route by workflow IDs or task IDs
- Show generic loading spinners for long-running operations
- Duplicate schema validation between frontend and backend

### Example: Complete Component

```typescript
// src/routes/_auth.rfps.$rfpId.sections.$sectionId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useMutation } from 'convex/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { api } from '@/convex/_generated/api'
import { editSectionSchema } from '@/convex/workflows/rfp/schemas'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export const Route = createFileRoute('/_auth/rfps/$rfpId/sections/$sectionId')({
  component: SectionEditor,
})

function SectionEditor() {
  const { rfpId, sectionId } = Route.useParams()

  const { data: section } = useSuspenseQuery(
    convexQuery(api.workflows.rfp.api.getSection, { sectionId })
  )

  const { data: task } = useSuspenseQuery(
    convexQuery(api.workflows.rfp.api.getSectionEditTask, { sectionId })
  )

  const startWorkItem = useMutation(api.workflows.rfp.api.startWorkItem)
  const completeWorkItem = useMutation(api.workflows.rfp.api.completeWorkItem)

  const form = useForm({
    resolver: zodResolver(editSectionSchema),
    defaultValues: {
      content: section.content,
    },
  })

  const onSubmit = async (values: z.infer<typeof editSectionSchema>) => {
    if (!task) return

    await completeWorkItem({
      workItemId: task.workItemId,
      args: {
        name: 'humanEditSection',
        payload: values,
      },
    })

    // Navigate back or show success
  }

  return (
    <div className="container max-w-4xl py-8">
      <h1 className="text-2xl font-bold mb-6">{section.name}</h1>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Textarea
          {...form.register('content')}
          className="min-h-[400px]"
          disabled={!task || task.state !== 'started'}
        />

        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!task || task.state !== 'initialized'}
            onClick={() => startWorkItem({
              workItemId: task.workItemId,
              args: { name: 'humanEditSection' },
            })}
          >
            Start Editing
          </Button>

          <Button
            type="submit"
            disabled={!task || task.state !== 'started'}
            loading={form.formState.isSubmitting}
          >
            Save & Complete
          </Button>
        </div>

        {!task && (
          <p className="text-sm text-muted-foreground">
            This section is not ready for editing yet.
          </p>
        )}
      </form>
    </div>
  )
}
```

### Summary

- **Philosophy**: Domain-first UIs, not workflow-first
- **State**: Use `activeStates` from domain objects, derived from workflow task states
- **Forms**: Share Zod schemas, use react-hook-form + zodResolver
- **Queries**: Use `@convex-dev/react-query` with `useSuspenseQuery` for realtime updates
- **Actions**: Call work item actions via `useMutation` with type-safe payloads
- **Routing**: Domain-centric routes (`/rfps/$rfpId/sections/$sectionId`) not workflow-centric
- **Components**: shadcn/ui for all UI components

---
