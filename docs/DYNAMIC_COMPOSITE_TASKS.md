# Dynamic Composite Tasks

> **Prerequisites:** Read [Workflows - Basic](./WORKFLOWS_BASIC.md) and [Workflows - Advanced](./WORKFLOWS_ADVANCED.md) first.
>
> **Related:** [Work Item Patterns](./WORK_ITEM_PATTERNS.md), [Domain Modeling](./DOMAIN_MODELING.md)

Dynamic composite tasks enable you to create composite tasks that can initialize **multiple different workflow types** within a single task. Unlike regular composite tasks that wrap a single workflow definition, dynamic composite tasks support a union of workflow types with type-safe initialization.

## Table of Contents

- [When to Use Dynamic Composite Tasks](#when-to-use-dynamic-composite-tasks)
- [Quick Start](#quick-start)
- [Builder API Reference](#builder-api-reference)
- [Initialize API](#initialize-api)
- [Activities Reference](#activities-reference)
- [onWorkflowStateChanged](#onworkflowstatechanged)
- [Policy System](#policy-system)
- [Context Object Reference](#context-object-reference)
- [Advanced Patterns](#advanced-patterns)
- [Real-World Examples](#real-world-examples)
- [Comparison: CompositeTask vs DynamicCompositeTask](#comparison-compositetask-vs-dynamiccompositetask)
- [Best Practices](#best-practices)
- [Common Pitfalls](#common-pitfalls)

---

## When to Use Dynamic Composite Tasks

Use dynamic composite tasks when you need to:

- Initialize **different workflow types** based on runtime conditions
- Orchestrate **parallel workflows of different types** (e.g., different review workflows, different processing pipelines)
- Create workflows **dynamically** in response to child workflow state changes
- Apply **custom completion/failure logic** across multiple workflow types

Use regular composite tasks when:

- You only need **one workflow type** (simpler API, better type inference)
- All child workflows follow the **same structure**

---

## Quick Start

Here's a minimal example showing dynamic composite task basics:

```typescript
import { Builder } from 'tasquencer'

// Define workflow types
const workflowA = Builder.workflow('WorkflowA')
  .startCondition('start')
  .task('taskA', Builder.noOpTask.withActivities({
    onEnabled: async ({ workItem }) => {
      await workItem.initialize()
    }
  }))
  .endCondition('end')
  .connectCondition('start', (to) => to.task('taskA'))
  .connectTask('taskA', (to) => to.condition('end'))

const workflowB = Builder.workflow('WorkflowB')
  .startCondition('start')
  .task('taskB', Builder.noOpTask.withActivities({
    onEnabled: async ({ workItem }) => {
      await workItem.initialize()
    }
  }))
  .endCondition('end')
  .connectCondition('start', (to) => to.task('taskB'))
  .connectTask('taskB', (to) => to.condition('end'))

// Create parent workflow with dynamic composite task
const parent = Builder.workflow('parent')
  .startCondition('start')
  .dynamicCompositeTask(
    'processAll',
    Builder.dynamicCompositeTask([workflowA, workflowB])
      .withActivities({
        onEnabled: async ({ workflow }) => {
          // Type-safe initialization - IDE autocomplete works!
          await workflow.initialize.WorkflowA()
          await workflow.initialize.WorkflowB()
        },
        onWorkflowStateChanged: async ({ workflow }) => {
          console.log(`${workflow.name} changed: ${workflow.prevState} -> ${workflow.nextState}`)
        },
      })
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('processAll'))
  .connectTask('processAll', (to) => to.condition('end'))
```

---

## Builder API Reference

### Entry Point

```typescript
Builder.dynamicCompositeTask(workflows: WorkflowBuilder[])
```

Creates a dynamic composite task builder that accepts an array of workflow builders.

### Configuration Methods

All methods return `this` for chaining.

#### `.withActivities(activities)`

Define lifecycle callbacks for the task.

```typescript
.withActivities({
  onEnabled?: (context) => Promise<void>,
  onStarted?: (context) => Promise<void>,
  onCompleted?: (context) => Promise<void>,
  onFailed?: (context) => Promise<void>,
  onCanceled?: (context) => Promise<void>,
  onDisabled?: (context) => Promise<void>,
  onWorkflowStateChanged?: (context) => Promise<void>,
})
```

See [Activities Reference](#activities-reference) for detailed context objects.

#### `.withPolicy(policyFn)`

Define custom completion/failure logic.

```typescript
.withPolicy(async ({ task, workflows, transition, mutationCtx, parentWorkflow }) => {
  const stats = await task.getStats()

  // Return 'complete', 'fail', or 'continue'
  if (stats.completed === stats.total) {
    return 'complete'
  }

  return 'continue'
})
```

See [Policy System](#policy-system) for details.

#### `.withSplitType(type)`

Control how the task enables downstream tasks.

```typescript
.withSplitType('and' | 'xor' | 'or')
```

- `and` (default) - All downstream paths enabled
- `xor` - Exactly one path enabled (exclusive)
- `or` - One or more paths enabled

#### `.withJoinType(type)`

Control how the task waits for upstream tasks.

```typescript
.withJoinType('and' | 'xor' | 'or')
```

- `and` (default) - Wait for all incoming paths
- `xor` - Wait for exactly one path
- `or` - Wait for one or more paths

#### `.withStatsShards(count)`

Use sharded stats for high fan-out scenarios (>1000 child workflows).

```typescript
.withStatsShards(10)
```

Distributes stats across multiple database documents to avoid write contention.

#### `.withDescription(text)`

Add documentation for the task.

```typescript
.withDescription('Processes all document sections in parallel')
```

---

## Initialize API

The initialize API provides **type-safe workflow initialization** using workflow names as properties.

### Basic Usage

```typescript
.withActivities({
  onEnabled: async ({ workflow }) => {
    // Each workflow name becomes a method
    await workflow.initialize.WorkflowA()
    await workflow.initialize.WorkflowB()
    await workflow.initialize.WorkflowC()
  }
})
```

### With Payloads

Payload types are inferred from each workflow's `initialize` action schema:

```typescript
const reviewWorkflow = Builder.workflow('ReviewWorkflow')
  .withInitializeAction(
    z.object({
      documentId: z.string(),
      reviewerId: z.string(),
    })
  )
  // ... rest of workflow

const approvalWorkflow = Builder.workflow('ApprovalWorkflow')
  .withInitializeAction(
    z.object({
      amount: z.number(),
      requesterId: z.string(),
    })
  )
  // ... rest of workflow

// In dynamic composite task:
.withActivities({
  onEnabled: async ({ workflow }) => {
    // Type-safe - IDE shows required fields!
    await workflow.initialize.ReviewWorkflow({
      documentId: 'doc-123',
      reviewerId: 'user-456',
    })

    await workflow.initialize.ApprovalWorkflow({
      amount: 1000,
      requesterId: 'user-789',
    })
  }
})
```

### Conditional Initialization

Initialize workflows based on runtime conditions:

```typescript
.withActivities({
  onEnabled: async ({ workflow, mutationCtx }) => {
    const document = await mutationCtx.db.get(documentId)

    // Conditionally initialize different workflows
    if (document.type === 'technical') {
      await workflow.initialize.TechnicalReview()
    } else if (document.type === 'legal') {
      await workflow.initialize.LegalReview()
    }

    // Always initialize approval workflow
    await workflow.initialize.ApprovalWorkflow()
  }
})
```

### Dynamic Initialization in onWorkflowStateChanged

You can initialize new workflows when existing workflows complete:

```typescript
.withActivities({
  onEnabled: async ({ workflow }) => {
    await workflow.initialize.FirstWorkflow()
  },

  onWorkflowStateChanged: async ({ workflow }) => {
    // When FirstWorkflow completes, start SecondWorkflow
    if (workflow.name === 'FirstWorkflow' && workflow.nextState === 'completed') {
      await workflow.initialize.SecondWorkflow()
    }
  }
})
```

---

## Activities Reference

### Activity Types

Activities are categorized by when they can initialize workflows and schedule work:

| Activity | Can Initialize | Can Schedule | Typical Use |
|----------|---------------|--------------|-------------|
| `onEnabled` | ✅ Yes | ✅ Yes | Initial workflow creation |
| `onStarted` | ✅ Yes | ✅ Yes | Late binding initialization |
| `onWorkflowStateChanged` | ✅ Yes | ✅ Yes | React to child workflows, dynamic creation |
| `onCompleted` | ❌ No | ❌ No | Cleanup, logging |
| `onFailed` | ❌ No | ❌ No | Error handling, cleanup |
| `onCanceled` | ❌ No | ❌ No | Cancellation cleanup |
| `onDisabled` | ❌ No | ❌ No | Cleanup when task disabled |

### onEnabled

Called when the task first becomes enabled. Typically used for initial workflow initialization.

```typescript
onEnabled: async (context) => {
  // context includes:
  // - workflow.initialize.* - Initialize workflows
  // - registerScheduled - Schedule future work
  // - mutationCtx - Database access
  // - parent.workflow - Parent workflow info

  await context.workflow.initialize.WorkflowA()

  // Schedule work for later
  await context.registerScheduled(
    'processResults',
    { when: 'in-30-minutes' },
    async () => {
      // Scheduled work executes here
    }
  )
}
```

### onStarted

Called when at least one child workflow transitions to `started`. Can initialize additional workflows.

```typescript
onStarted: async (context) => {
  // Initialize additional workflows when task starts
  await context.workflow.initialize.AdditionalWorkflow()
}
```

### onCompleted

Called when the task completes (via policy returning `'complete'`).

```typescript
onCompleted: async (context) => {
  // Cleanup, logging, metrics
  console.log('All workflows completed successfully')
}
```

### onFailed

Called when the task fails (via policy returning `'fail'`).

```typescript
onFailed: async (context) => {
  // Error handling, notifications
  console.error('Dynamic composite task failed')
}
```

### onCanceled

Called when the task is canceled (parent workflow canceled or task explicitly canceled).

```typescript
onCanceled: async (context) => {
  // Cleanup resources
  console.log('Task was canceled')
}
```

### onDisabled

Called when the task is disabled (never started, parent workflow completed/failed/canceled).

```typescript
onDisabled: async (context) => {
  // Cleanup if needed
  console.log('Task disabled without starting')
}
```

---

## onWorkflowStateChanged

The most important activity for dynamic composite tasks. Called whenever **any child workflow changes state**.

### Signature

```typescript
onWorkflowStateChanged: async (context) => {
  // context.workflow includes:
  context.workflow.id           // Specific workflow instance ID
  context.workflow.name         // Workflow type name (e.g., 'WorkflowA')
  context.workflow.prevState    // Previous state
  context.workflow.nextState    // New state
  context.workflow.initialize.* // Can initialize new workflows
}
```

### Use Cases

#### 1. Track Individual Workflow Progress

```typescript
onWorkflowStateChanged: async ({ workflow }) => {
  console.log(
    `Workflow ${workflow.name} (${workflow.id}) ` +
    `transitioned from ${workflow.prevState} to ${workflow.nextState}`
  )

  if (workflow.nextState === 'completed') {
    // Specific workflow completed
  }
}
```

#### 2. Sequential Workflow Creation

Create workflows in sequence based on completion:

```typescript
onWorkflowStateChanged: async ({ workflow, mutationCtx }) => {
  if (workflow.name === 'Step1' && workflow.nextState === 'completed') {
    // Step 1 done, start Step 2
    await workflow.initialize.Step2()
  }

  if (workflow.name === 'Step2' && workflow.nextState === 'completed') {
    // Step 2 done, start Step 3
    await workflow.initialize.Step3()
  }
}
```

#### 3. Conditional Workflow Creation

```typescript
onWorkflowStateChanged: async ({ workflow, mutationCtx }) => {
  if (workflow.name === 'InitialReview' && workflow.nextState === 'completed') {
    // Load the review result
    const reviewWorkflow = await mutationCtx.db.get(workflow.id)
    const result = reviewWorkflow.output?.approved

    if (result === true) {
      await workflow.initialize.ApprovalWorkflow()
    } else {
      await workflow.initialize.RejectionWorkflow()
    }
  }
}
```

#### 4. Fan-out Based on Results

```typescript
onWorkflowStateChanged: async ({ workflow, mutationCtx }) => {
  if (workflow.name === 'DataCollector' && workflow.nextState === 'completed') {
    const data = await mutationCtx.db.get(workflow.id)
    const items = data.output?.items || []

    // Create one processing workflow per item
    for (const item of items) {
      await workflow.initialize.ItemProcessor({ itemId: item.id })
    }
  }
}
```

### Important Notes

> ⚠️ **Performance:** `onWorkflowStateChanged` is called for **every** child workflow state transition. For high fan-out scenarios (>100 workflows), keep this callback lightweight.

> ⚠️ **Concurrency:** Multiple child workflows may transition simultaneously. This callback may run concurrently. Ensure your logic is idempotent.

---

## Policy System

Policies control when the dynamic composite task completes, fails, or continues based on child workflow states.

### Default Policy

The default policy implements **fail-fast** behavior:

```typescript
// Pseudo-code representation of default policy
if (nextState === 'completed') {
  // Complete only when ALL workflows are finalized
  return allWorkflowsFinalized ? 'complete' : 'continue'
}

if (nextState === 'failed') {
  // Fail immediately on first child failure
  return 'fail'
}

if (nextState === 'canceled') {
  // Continue until all workflows finalized
  return allWorkflowsFinalized ? 'complete' : 'continue'
}
```

### Custom Policies

Define custom completion logic with `.withPolicy()`:

```typescript
.withPolicy(async ({ task, workflows, transition, mutationCtx }) => {
  const stats = await task.getStats()

  // Get total workflow count across all types
  const totalWorkflows = await Promise.all(
    workflows.map(w => w.getAllWorkflowIds())
  ).then(ids => ids.flat().length)

  // Only complete when ALL workflows are finalized
  if (stats.completed + stats.failed + stats.canceled === totalWorkflows) {
    return 'complete'
  }

  // Don't fail on child failures - continue until all done
  return 'continue'
})
```

### Policy Context

The policy function receives:

```typescript
{
  task: {
    name: string,
    generation: number,
    path: string[],
    getStats: () => Promise<{
      total: number,
      initialized: number,
      started: number,
      completed: number,
      failed: number,
      canceled: number,
    }>
  },
  workflows: Array<{
    name: string,
    path: string[],
    getAllWorkflowIds: () => Promise<Id<'tasquencerWorkflows'>[]>
  }>,
  transition: {
    prevState: WorkflowState,
    nextState: WorkflowState,
  },
  mutationCtx: MutationCtx,
  parentWorkflow: {
    id: Id<'tasquencerWorkflows'>,
    name: string,
  }
}
```

### Policy Return Values

- `'complete'` - Complete the task successfully
- `'fail'` - Fail the task (and propagate failure to parent workflow)
- `'continue'` - Keep the task running

### Example: Majority Voting

Complete when a majority of workflows succeed:

```typescript
.withPolicy(async ({ task, workflows }) => {
  const stats = await task.getStats()
  const totalWorkflows = await Promise.all(
    workflows.map(w => w.getAllWorkflowIds())
  ).then(ids => ids.flat().length)

  const finalized = stats.completed + stats.failed + stats.canceled
  const majority = Math.ceil(totalWorkflows / 2)

  // Complete if majority completed successfully
  if (stats.completed >= majority) {
    return 'complete'
  }

  // Fail if too many failed to reach majority
  if (stats.failed > totalWorkflows - majority) {
    return 'fail'
  }

  // Keep waiting
  return 'continue'
})
```

### Example: First Success Wins

Complete as soon as any workflow succeeds:

```typescript
.withPolicy(async ({ transition }) => {
  // Complete immediately on first success
  if (transition.nextState === 'completed') {
    return 'complete'
  }

  // Don't fail on child failures
  return 'continue'
})
```

---

## Context Object Reference

All activities receive a context object with these fields:

### Common Fields (All Activities)

```typescript
{
  mutationCtx: MutationCtx,              // Database and auth access
  isInternalMutation: boolean,           // Always true
  executionMode: 'normal' | 'migration', // Current execution mode
  parent: {
    workflow: {
      id: Id<'tasquencerWorkflows'>,     // Parent workflow ID
      name: string,                       // Parent workflow name
    }
  },
  task: {
    name: string,                         // This task's name
    generation: number,                   // Task generation number
    path: string[],                       // Full path from root
  },
  audit: AuditCallbackInfo,              // Audit metadata
}
```

### In onEnabled, onStarted

```typescript
{
  // ... common fields
  workflow: {
    getAllWorkflowIds: () => Promise<Id<'tasquencerWorkflows'>[]>,
    paths: Record<string, string[]>,     // Workflow paths by name
    names: Record<string, string>,       // Workflow names
    initialize: {
      [WorkflowName]: (payload?) => Promise<Id<'tasquencerWorkflows'>>
    }
  },
  registerScheduled: (name, when, fn) => Promise<void>
}
```

### In onWorkflowStateChanged

```typescript
{
  // ... common fields
  workflow: {
    id: Id<'tasquencerWorkflows'>,       // Specific workflow instance
    name: string,                         // Workflow type name
    prevState: WorkflowState,            // Previous state
    nextState: WorkflowState,            // New state
    initialize: {
      [WorkflowName]: (payload?) => Promise<Id<'tasquencerWorkflows'>>
    }
  },
  registerScheduled: (name, when, fn) => Promise<void>
}
```

### In onCompleted, onFailed, onCanceled, onDisabled

```typescript
{
  // ... common fields
  workflow: {
    getAllWorkflowIds: () => Promise<Id<'tasquencerWorkflows'>[]>,
    paths: Record<string, string[]>,
    names: Record<string, string>,
  }
  // No initialize, no registerScheduled
}
```

---

## Advanced Patterns

### Pattern 1: Sharded Stats for High Fan-Out

When creating >1000 child workflows, use sharded stats to avoid write contention:

```typescript
Builder.dynamicCompositeTask([workflowA, workflowB])
  .withStatsShards(10)  // Distribute stats across 10 shards
  .withActivities({
    onEnabled: async ({ workflow }) => {
      // Create thousands of workflows
      for (let i = 0; i < 5000; i++) {
        await workflow.initialize.ProcessingWorkflow({ id: i })
      }
    }
  })
```

Stats are automatically aggregated when you call `task.getStats()` in policies.

### Pattern 2: Dynamic Workflow Selection

Initialize different workflows based on data:

```typescript
.withActivities({
  onEnabled: async ({ workflow, mutationCtx }) => {
    const tasks = await ctx.db.query('tasks').collect()

    for (const task of tasks) {
      // Select workflow type based on task properties
      if (task.priority === 'urgent') {
        await workflow.initialize.UrgentProcessing({ taskId: task._id })
      } else if (task.type === 'review') {
        await workflow.initialize.ReviewWorkflow({ taskId: task._id })
      } else {
        await workflow.initialize.StandardProcessing({ taskId: task._id })
      }
    }
  }
})
```

### Pattern 3: Cascading Workflows

Create workflows in stages:

```typescript
const stage1 = Builder.workflow('DataCollection')
  // ... collects data

const stage2 = Builder.workflow('DataProcessing')
  // ... processes data

const stage3 = Builder.workflow('DataFinalization')
  // ... finalizes results

Builder.dynamicCompositeTask([stage1, stage2, stage3])
  .withActivities({
    onEnabled: async ({ workflow }) => {
      // Start stage 1
      await workflow.initialize.DataCollection()
    },

    onWorkflowStateChanged: async ({ workflow }) => {
      if (workflow.name === 'DataCollection' && workflow.nextState === 'completed') {
        await workflow.initialize.DataProcessing()
      }

      if (workflow.name === 'DataProcessing' && workflow.nextState === 'completed') {
        await workflow.initialize.DataFinalization()
      }
    }
  })
```

### Pattern 4: Retry Failed Workflows

Automatically retry failed workflows:

```typescript
.withActivities({
  onEnabled: async ({ workflow }) => {
    await workflow.initialize.ProcessingWorkflow()
  },

  onWorkflowStateChanged: async ({ workflow, mutationCtx }) => {
    if (workflow.nextState === 'failed') {
      const workflowDoc = await mutationCtx.db.get(workflow.id)
      const retries = workflowDoc.metadata?.retries || 0

      if (retries < 3) {
        // Retry by creating new workflow
        await workflow.initialize.ProcessingWorkflow({
          metadata: { retries: retries + 1 }
        })
      }
    }
  }
})
```

---

## Real-World Examples

### Example 1: Document Section Processing

Process different sections of a document with appropriate workflows:

```typescript
const technicalReview = Builder.workflow('TechnicalReview')
  .withInitializeAction(z.object({ sectionId: z.string() }))
  // ... review logic

const legalReview = Builder.workflow('LegalReview')
  .withInitializeAction(z.object({ sectionId: z.string() }))
  // ... legal review logic

const executiveSummary = Builder.workflow('ExecutiveSummary')
  .withInitializeAction(z.object({ sectionId: z.string() }))
  // ... summary logic

const documentWorkflow = Builder.workflow('ProcessDocument')
  .startCondition('start')
  .dynamicCompositeTask(
    'processSections',
    Builder.dynamicCompositeTask([technicalReview, legalReview, executiveSummary])
      .withActivities({
        onEnabled: async ({ workflow, mutationCtx, parent }) => {
          const document = await mutationCtx.db.get(parent.workflow.id)
          const sections = document.sections

          // Initialize appropriate workflow for each section type
          for (const section of sections) {
            if (section.type === 'technical') {
              await workflow.initialize.TechnicalReview({ sectionId: section.id })
            } else if (section.type === 'legal') {
              await workflow.initialize.LegalReview({ sectionId: section.id })
            } else if (section.type === 'summary') {
              await workflow.initialize.ExecutiveSummary({ sectionId: section.id })
            }
          }
        }
      })
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('processSections'))
  .connectTask('processSections', (to) => to.condition('end'))
```

### Example 2: Multi-Stage Approval Process

Different approval workflows for different amounts:

```typescript
const managerApproval = Builder.workflow('ManagerApproval')
  .withInitializeAction(z.object({ amount: z.number() }))
  // ... manager approval

const directorApproval = Builder.workflow('DirectorApproval')
  .withInitializeAction(z.object({ amount: z.number() }))
  // ... director approval

const cfoApproval = Builder.workflow('CFOApproval')
  .withInitializeAction(z.object({ amount: z.number() }))
  // ... CFO approval

const approvalWorkflow = Builder.workflow('ExpenseApproval')
  .startCondition('start')
  .dynamicCompositeTask(
    'approvals',
    Builder.dynamicCompositeTask([managerApproval, directorApproval, cfoApproval])
      .withActivities({
        onEnabled: async ({ workflow, mutationCtx, parent }) => {
          const expense = await mutationCtx.db.get(parent.workflow.id)
          const amount = expense.amount

          // Always need manager approval
          await workflow.initialize.ManagerApproval({ amount })

          // Director approval for >$10k
          if (amount > 10000) {
            await workflow.initialize.DirectorApproval({ amount })
          }

          // CFO approval for >$100k
          if (amount > 100000) {
            await workflow.initialize.CFOApproval({ amount })
          }
        }
      })
      .withPolicy(async ({ task }) => {
        const stats = await task.getStats()

        // All approvals must succeed
        if (stats.failed > 0) {
          return 'fail'
        }

        if (stats.completed === stats.total) {
          return 'complete'
        }

        return 'continue'
      })
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('approvals'))
  .connectTask('approvals', (to) => to.condition('end'))
```

### Example 3: Parallel Independent Tasks with Tracking

Track progress of multiple independent workflows:

```typescript
const dataIngestion = Builder.workflow('DataIngestion')
  // ... ingest data

const dataValidation = Builder.workflow('DataValidation')
  // ... validate data

const dataTransformation = Builder.workflow('DataTransformation')
  // ... transform data

let completedWorkflows: string[] = []

const pipeline = Builder.workflow('DataPipeline')
  .startCondition('start')
  .dynamicCompositeTask(
    'parallelProcessing',
    Builder.dynamicCompositeTask([dataIngestion, dataValidation, dataTransformation])
      .withActivities({
        onEnabled: async ({ workflow }) => {
          // Start all workflows in parallel
          await workflow.initialize.DataIngestion()
          await workflow.initialize.DataValidation()
          await workflow.initialize.DataTransformation()
        },

        onWorkflowStateChanged: async ({ workflow }) => {
          if (workflow.nextState === 'completed') {
            completedWorkflows.push(workflow.name)
            console.log(`Progress: ${completedWorkflows.length}/3 workflows completed`)
          }
        }
      })
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('parallelProcessing'))
  .connectTask('parallelProcessing', (to) => to.condition('end'))
```

---

## Comparison: CompositeTask vs DynamicCompositeTask

| Feature | CompositeTask | DynamicCompositeTask |
|---------|---------------|---------------------|
| **Workflow types** | Single | Multiple (union) |
| **Initialize API** | `workflow.initialize(payload)` | `workflow.initialize.WorkflowName(payload)` |
| **Type safety** | Strong (single type) | Strong (union of all types) |
| **Complexity** | Simple | More complex |
| **Use case** | Same workflow structure | Different workflow types |
| **Stats** | Single workflow stats | Aggregated across all types |
| **Policy** | One workflow type | Multiple workflow types |
| **Performance** | Slightly faster | Slightly more overhead |

### Decision Guide

**Use CompositeTask when:**
- ✅ All child workflows have the **same structure**
- ✅ You want **simpler, cleaner code**
- ✅ You need **better type inference** (single type vs union)
- ✅ Example: Creating 100 identical "process order" workflows

**Use DynamicCompositeTask when:**
- ✅ You need **different workflow types** in one task
- ✅ Workflow type is determined **at runtime**
- ✅ You want to **react to individual workflow types** differently
- ✅ Example: Document with technical, legal, and summary sections

---

## Best Practices

### ✅ DO

**Initialize workflows early:**
```typescript
// GOOD - Initialize in onEnabled
onEnabled: async ({ workflow }) => {
  await workflow.initialize.WorkflowA()
}
```

**Use workflow names in onWorkflowStateChanged:**
```typescript
// GOOD - Check workflow name before taking action
onWorkflowStateChanged: async ({ workflow }) => {
  if (workflow.name === 'SpecificWorkflow' && workflow.nextState === 'completed') {
    // Handle specific workflow completion
  }
}
```

**Keep onWorkflowStateChanged lightweight:**
```typescript
// GOOD - Quick state tracking
onWorkflowStateChanged: async ({ workflow, mutationCtx }) => {
  await mutationCtx.db.patch(trackingId, {
    [`${workflow.name}_status`]: workflow.nextState
  })
}
```

**Use custom policies for complex logic:**
```typescript
// GOOD - Clear completion criteria
.withPolicy(async ({ task, workflows }) => {
  const stats = await task.getStats()
  const total = await Promise.all(
    workflows.map(w => w.getAllWorkflowIds())
  ).then(ids => ids.flat().length)

  return stats.completed === total ? 'complete' : 'continue'
})
```

### ❌ DON'T

**Don't initialize workflows in teardown activities:**
```typescript
// BAD - onCompleted cannot initialize workflows
onCompleted: async ({ workflow }) => {
  await workflow.initialize.WorkflowA() // ERROR - method doesn't exist
}
```

**Don't create unbounded workflows:**
```typescript
// BAD - Could create thousands of workflows
onEnabled: async ({ workflow, mutationCtx }) => {
  const allUsers = await mutationCtx.db.query('users').collect()
  for (const user of allUsers) { // Could be 100,000+ users
    await workflow.initialize.UserWorkflow({ userId: user._id })
  }
}
```

**Don't perform heavy operations in onWorkflowStateChanged:**
```typescript
// BAD - Called on every state change
onWorkflowStateChanged: async ({ workflow, mutationCtx }) => {
  // This runs for EVERY child workflow state change
  const allWorkflows = await mutationCtx.db.query('tasquencerWorkflows').collect()
  // Expensive aggregation on every state change
}
```

**Don't forget to handle failures in policies:**
```typescript
// BAD - Doesn't handle failed workflows
.withPolicy(async ({ task }) => {
  const stats = await task.getStats()
  if (stats.completed === stats.total) {
    return 'complete'
  }
  return 'continue' // Waits forever if a workflow fails!
})

// GOOD - Handles failures
.withPolicy(async ({ task }) => {
  const stats = await task.getStats()
  if (stats.failed > 0) {
    return 'fail'
  }
  if (stats.completed === stats.total) {
    return 'complete'
  }
  return 'continue'
})
```

---

## Common Pitfalls

### Pitfall 1: Forgetting Workflow Names in Conditions

```typescript
// ❌ WRONG - Fires for all workflows
onWorkflowStateChanged: async ({ workflow }) => {
  if (workflow.nextState === 'completed') {
    await workflow.initialize.NextStep() // Runs for every workflow!
  }
}

// ✅ CORRECT - Check workflow name
onWorkflowStateChanged: async ({ workflow }) => {
  if (workflow.name === 'FirstStep' && workflow.nextState === 'completed') {
    await workflow.initialize.NextStep()
  }
}
```

### Pitfall 2: Policy Not Checking All Finalized States

```typescript
// ❌ WRONG - Only checks completed
.withPolicy(async ({ task, workflows }) => {
  const stats = await task.getStats()
  const total = await Promise.all(
    workflows.map(w => w.getAllWorkflowIds())
  ).then(ids => ids.flat().length)

  if (stats.completed === total) { // What about failed/canceled?
    return 'complete'
  }
  return 'continue'
})

// ✅ CORRECT - Check all finalized states
.withPolicy(async ({ task, workflows }) => {
  const stats = await task.getStats()
  const total = await Promise.all(
    workflows.map(w => w.getAllWorkflowIds())
  ).then(ids => ids.flat().length)

  const finalized = stats.completed + stats.failed + stats.canceled
  if (finalized === total) {
    return stats.failed > 0 ? 'fail' : 'complete'
  }
  return 'continue'
})
```

### Pitfall 3: Not Using Sharded Stats for High Fan-Out

```typescript
// ❌ WRONG - Will cause write contention
Builder.dynamicCompositeTask([workflow])
  .withActivities({
    onEnabled: async ({ workflow }) => {
      for (let i = 0; i < 10000; i++) {
        await workflow.initialize.Processing({ id: i })
      }
    }
  })

// ✅ CORRECT - Use sharded stats
Builder.dynamicCompositeTask([workflow])
  .withStatsShards(10)
  .withActivities({
    onEnabled: async ({ workflow }) => {
      for (let i = 0; i < 10000; i++) {
        await workflow.initialize.Processing({ id: i })
      }
    }
  })
```

### Pitfall 4: Incorrect Payload Types

```typescript
const workflow = Builder.workflow('MyWorkflow')
  .withInitializeAction(z.object({ id: z.number() }))
  // ...

// ❌ WRONG - Type error, string instead of number
await workflow.initialize.MyWorkflow({ id: '123' })

// ✅ CORRECT - Matches schema
await workflow.initialize.MyWorkflow({ id: 123 })
```

---

> **Next Steps:** Learn about [Authorization](./AUTHORIZATION.md) to secure your workflows, or explore [Compensation](./COMPENSATION.md) for handling failures and rollbacks.
