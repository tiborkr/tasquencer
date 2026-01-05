# Glossary

> **Quick Reference**: Key terminology used throughout Tasquencer documentation

This glossary defines terms used consistently across all Tasquencer documentation. Use `Cmd+F` / `Ctrl+F` to quickly find definitions.

---

## Core Workflow Concepts

### Workflow

A complete business process modeled as a network of tasks and conditions. Workflows have a 1:1 relationship with aggregate roots in your domain model.

**Example**: An RFP approval workflow, patient journey workflow, order fulfillment workflow.

**Related**: [Core Concepts](./CORE_CONCEPTS.md) | [Workflow Basics](./WORKFLOWS_BASIC.md)

---

### Task

A unit of work within a workflow that manages one or more work items. Tasks can be simple (one work item) or composite (nested subworkflow).

**States**: `disabled`, `enabled`, `started`, `completed`, `failed`, `canceled`

**Types**:

- **Simple task**: Manages work items directly
- **Composite task**: Manages a nested subworkflow
- **Dummy task**: No work items, used for routing/structure

**Related**: [Core Concepts](./CORE_CONCEPTS.md#tasks)

---

### Work Item

An instance of work that needs to be performed, managed by a task. Work items are the atomic units of work in Tasquencer.

**Lifecycle**: `initialized` → `enabled` → `started` → `completed` | `failed` | `canceled`

**Example**: A specific approval request, a specific diagnostic test to perform.

**Related**: [Core Concepts](./CORE_CONCEPTS.md#work-items)

---

### Condition

A synchronization point in the workflow where multiple paths converge (join) or diverge (split). Conditions mark the flow state but don't contain work.

**Types**:

- **Explicit condition**: Defined by you (e.g., `startCondition`, `endCondition`)
- **Implicit condition**: Automatically created by the engine for routing (internal implementation detail)

**Related**: [Core Concepts](./CORE_CONCEPTS.md#conditions)

---

### Auto-Trigger

A pattern where work items are automatically started and completed without requiring manual claim. Used for system tasks, automated processing, or background jobs where human "claiming" doesn't make sense.

**Use cases**: AI processing, scheduled tasks, automated notifications, system maintenance

**Related**: [Work Item Patterns](./WORK_ITEM_PATTERNS.md)

---

## Domain Modeling

### Aggregate Root

The main domain entity that has a 1:1 relationship with a root workflow. The aggregate root controls the lifecycle of its child entities.

**Pattern**: Workflow lifecycle = Aggregate root lifecycle

**Examples**: Patient (ER workflow), Order (fulfillment workflow), RFP (approval workflow)

**Related**: [Domain Modeling - Aggregate Root Pattern](./DOMAIN_MODELING.md#1-aggregate-root-pattern)

---

### Domain State

Business data stored in your domain tables (e.g., patients, orders, documents). Domain state is the source of truth for business logic decisions.

**Key principle**: Always use domain state for business logic, never workflow state.

**Example**: `patient.status`, `order.paymentStatus`, `rfp.approvalLevel`

**Related**: [Domain Modeling](./DOMAIN_MODELING.md) | [Workflow State vs Domain State](./WORKFLOW_STATE_UI.md)

---

### Workflow State

Orchestration state managed by Tasquencer (task states, work item states, condition markings). Workflow state is for UI display and workflow control, NOT for business logic.

**Key principle**: Use workflow state only for UI queries to show progress, enable/disable buttons, etc.

**Example**: `task.state === 'started'`, `workItem.state === 'enabled'`

**Related**: [Workflow State in UIs](./WORKFLOW_STATE_UI.md)

---

### Domain Functions

Reusable functions that encapsulate data access and business logic for your domain entities. All activities, actions, and route functions MUST use domain functions instead of direct database access.

**Example**:

```typescript
const PatientDomain = {
  async getByWorkflowId(ctx: { db: DatabaseReader }, workflowId) {
    // ...
  },
  async updateStatus(ctx: { db: DatabaseWriter }, patientId, status) {
    // ...
  },
}
```

**Related**: [Domain Modeling - Domain Functions](./DOMAIN_MODELING.md#4-domain-driven-design)

---

### Work Item Metadata Table

A table that stores authorization, assignment, and work item-specific data for all work items associated with a specific aggregate root. One metadata table per aggregate root (not per workflow), shared across root workflow and all sub-workflows.

**Key characteristics:**

- Typed to an aggregate root table (e.g., `patients`, `rfps`, `orders`)
- Contains typed `payload` field for work item-specific data
- Includes authorization fields (`requiredScope`, `requiredGroupId`)
- All work items from root + sub-workflows use the same table

**Example**: `erWorkItems` table serves all ER workflow work items (triage, diagnostics, hospital stay, etc.)

**Related**: [Work Item Patterns - Metadata](./WORK_ITEM_PATTERNS.md) | [Domain Modeling](./DOMAIN_MODELING.md)

---

### defineWorkItemMetadataTable()

A factory function that creates a typed metadata table definition for an aggregate root. Returns a configuration object with `.withPayload()` method for defining the discriminated union of work item payloads.

**Signature**: `defineWorkItemMetadataTable(aggregateTableName: string)`

**Usage**:

```typescript
const erWorkItems = defineWorkItemMetadataTable('patients').withPayload(
  v.union(
    v.object({ type: v.literal('triagePatient'), taskName: v.string(), ... }),
    v.object({ type: v.literal('specialistConsult'), specialty: v.string(), ... }),
  ),
)
```

**Key principle**: One metadata table per aggregate root, not per workflow.

**Related**: [Work Item Patterns](./WORK_ITEM_PATTERNS.md) | [Schema Definition](../../schema.ts)

---

### workItemMetadataHelpersForTable()

A factory function that generates type-safe helper functions for a metadata table. The helpers provide query/claim utilities; you still insert/update metadata yourself (usually via a workflow-specific wrapper).

**Signature**: `workItemMetadataHelpersForTable(tableName: string)`

**Usage**:

```typescript
export const ErWorkItemHelpers = workItemMetadataHelpersForTable('erWorkItems')

// Helper surface (see convex/authorization/builders.ts):
// - claimWorkItem(), claimWorkItemAsAgent(), releaseWorkItem()
// - getWorkItemMetadata()
// - canUserClaimWorkItem(), canUserViewWorkItem(), isUserInAssignedGroup()
// - getAvailableWorkItemsForUser(), getAvailableAgentWorkItems()
// - getAvailableWorkItemsByWorkflow()
// - getWorkItemsForGroupAndDescendants()
// - getClaimedWorkItemsByUser()
```

**Benefits**: DRY, type-safe, consistent query/authorization helpers.

**Related**: [Work Item Patterns - Factory Helpers](./WORK_ITEM_PATTERNS.md)

---

### Typed Payload

A discriminated union field in work item metadata that stores work item-specific data with full type safety. Replaces the need for separate "surrogate tables" in 95% of use cases.

**Pattern**: Discriminated union using `type` literal as discriminator.

**Example**:

```typescript
payload: {
  type: 'specialistConsult',     // Discriminator
  taskName: 'Cardiology Consult',
  priority: 'urgent',
  specialty: 'cardiologist',     // Type-specific field
}
```

**When to use**: 1:1 work item data that doesn't need to span multiple work items.

**When NOT to use**: Data that needs complex querying, aggregation, or spans multiple work items (<5% of cases).

**Related**: [Work Item Patterns - Payload](./WORK_ITEM_PATTERNS.md) | [Domain Modeling - Data Storage](./DOMAIN_MODELING.md)

---

## Exception Handling

### Business Exception

An expected failure mode in your business process that is explicitly modeled and handled by the workflow. Business exceptions are recorded in the database and workflow continues based on policy.

**Mechanism**: Call `workItem.fail()` or complete with failure status

**Transaction behavior**: Transaction commits successfully, all state changes persist

**Examples**: User rejection, validation failure, deadline expiry, credit limit exceeded

**Related**: [Exceptions - Business vs Code](./EXCEPTIONS.md#business-exceptions-vs-code-exceptions)

---

### Code Exception

A standard JavaScript error indicating infrastructure failure, programming bugs, or unexpected errors. Code exceptions cause the entire Convex transaction to roll back.

**Mechanism**: `throw new Error(...)`

**Transaction behavior**: Transaction rolls back, no state changes persist, Convex automatically retries

**Examples**: Database connection lost, null pointer error, missing configuration, data integrity violation

**Related**: [Exceptions - Business vs Code](./EXCEPTIONS.md#business-exceptions-vs-code-exceptions)

---

## Authorization & Metadata

### Work Item Metadata

Additional context attached to work items for authorization, queuing, assignment, and work item-specific data. Stored in aggregate-scoped tables (one per aggregate root) using the metadata factory pattern.

**Standard fields**: `workItemId`, `workflowName`, `offer` (with `requiredScope`, `requiredGroupId`), `aggregateTableId`, `claim`

**Typed payload field**: Discriminated union containing work item-specific data (replaces separate tables in 95% of cases)

**When initialized**: In the work item's `initialize` action using factory-generated helpers

**Key principle**: One metadata table per aggregate root, shared across root + all sub-workflows

**Related**: [Work Item Patterns - Metadata](./WORK_ITEM_PATTERNS.md#work-item-metadata)

---

### Role

A job function or responsibility within your domain that can be assigned to users and work items.

**Examples**: `triage_nurse`, `cardiologist`, `warehouse_worker`

**Permissions**: Define which work items the role can claim and view

**Related**: [Authorization - Roles](./AUTHORIZATION.md#roles)

---

### Group

A collection of roles that share common characteristics, used for organizing work and building flexible queues.

**Examples**: `nursing_staff`, `medical_specialists`, `admin`

**Related**: [Authorization - Groups](./AUTHORIZATION.md#groups)

---

### Claiming

The act of a user taking ownership of a work item to indicate they're working on it. Updates `claimedByUserId` in work item metadata.

**Enforced**: Authorization checks ensure user has permission to claim work assigned to that role

**Related**: [Authorization - Claiming](./AUTHORIZATION.md#claiming-work-items)

---

## Advanced Concepts

### Implicit Conditions

Automatically created conditions used internally by the Tasquencer engine for routing. These are implementation details and not part of the public API.

**Key point**: Implicit conditions do NOT appear in `getWorkflowTaskStates()` - only tasks are exposed

**Naming**: Implicit conditions use names like `'A__to__B'`

**Related**: [Core Concepts](./CORE_CONCEPTS.md#conditions)

---

### Task Completion Policy

A function that determines what happens when a work item changes state. Default policies are automatic (built into the engine).

**Returns**: `'complete'`, `'fail'`, `'continue'`

**Default behavior** (automatic):

- `completed`: 'complete' if all work items finalized, else 'continue'
- `failed`: 'fail' (immediate teardown)
- `canceled`: 'complete' if all work items finalized, else 'continue'

**Related**: [Workflows Basic - Policies](./WORKFLOWS_BASIC.md#task-completion-policies)

---

### Cancellation Region

A mechanism for canceling tasks when another task reaches a specific state. Used for implementing timeouts, mutually exclusive paths, and cleanup.

**Trigger point**: When the trigger task **completes**

**Related**: [Workflows Advanced - Cancellation](./WORKFLOWS_ADVANCED.md#cancellation-regions)

---

### Root Workflow ID

The ID of the top-level workflow in a nested workflow hierarchy. Found at `workflow.realizedPath[0]`.

**Use case**: Querying aggregate roots from nested workflows (subworkflows need to access patient/order/RFP data)

**Pattern**:

```typescript
const rootWorkflowId = workflow.realizedPath[0] as Id<'tasquencerWorkflows'>
```

**Related**: [Domain Modeling - Root Workflow ID Pattern](./DOMAIN_MODELING.md#8-root-workflow-id-pattern)

---

### Realized Path

An array containing the complete ancestry chain of a workflow or work item, from root to current node.

**Structure**: `[rootWorkflowId, childWorkflowId, grandchildWorkflowId, ...]`

**First element**: Always the root workflow ID

**Related**: [Domain Modeling - Root Workflow ID Pattern](./DOMAIN_MODELING.md#8-root-workflow-id-pattern)

---

## UI & Queries

### UI Query

A Convex query that fetches workflow state for display purposes only. UI queries are the ONLY place where it's acceptable to use `getWorkflowState()`, `getWorkflowTaskStates()`, or `getWorkItemState()`.

**Acceptable use**: Progress bars, status badges, enable/disable buttons

**Not acceptable**: Business logic decisions in mutations

**Related**: [Workflow State in UIs](./WORKFLOW_STATE_UI.md)

---

### Work Queue

A filtered list of work items assigned to a specific user based on their roles and permissions.

**Queries**: Use `workItemMetadataHelpersForTable(...).getAvailableWorkItemsForUser()` for role-based filtering

**Related**: [Work Item Patterns - Work Queues](./WORK_ITEM_PATTERNS.md#work-queues)

---

## Architecture Principles

### Multiple Active Tasks

**Key principle**: Tasquencer workflows are NOT simple state machines. Multiple tasks can be active (in `started` state) simultaneously.

**Implication**: Don't assume only one task is active at a time when designing workflows or UIs

**Example**: In an RFP workflow, `legalReview`, `securityReview`, and `techReview` can all be `started` in parallel

**Related**: [Core Concepts](./CORE_CONCEPTS.md) | [Workflow State in UIs](./WORKFLOW_STATE_UI.md)

---

### Minimal Responsibility Principle (Domain Functions)

**Principle**: Start with minimal context parameters for domain functions (`{ db }`), only escalate when additional Convex features are needed.

**Progression**:

1. `ctx: { db: DatabaseReader }` - Read-only operations
2. `ctx: { db: DatabaseWriter }` - Write operations
3. `ctx: { db: DatabaseWriter; scheduler: Scheduler }` - Needs scheduling
4. `ctx: MutationCtx` - Needs multiple Convex features

**Related**: [Domain Modeling - Domain Functions](./DOMAIN_MODELING.md#4-domain-driven-design)

---

## Terminology Notes

### Deprecated Terms

- **Business failure** → Use "business exception"
- **Surrogate entity** → No longer used (replaced by typed payload)
- **State transition policy** → Use "task completion policy"
- **Global metadata table** → Use "aggregate-scoped metadata table"
- **Manual metadata initialization** → Use "factory-generated helpers"

### Common Abbreviations

- **RBAC**: Role-Based Access Control
- **DDD**: Domain-Driven Design
- **UI**: User Interface

---

## Quick Reference Decision Trees

### When to use workflow state vs domain state?

- **UI display** (progress, badges, buttons) → Workflow state ✓
- **Business logic** (validation, rules, decisions) → Domain state ✓
- **Mutation logic** → Domain state ✓
- **Query for display only** → Workflow state ✓

### When to use business exception vs code exception?

- **Expected business failure** → `workItem.fail()` ✓
- **User rejection** → `workItem.fail()` ✓
- **Infrastructure error** → `throw new Error()` ✓
- **Data corruption** → `throw new Error()` ✓
- **Missing config** → `throw new Error()` ✓

### Where to initialize work item metadata?

- **Preferred**: Work item's `initialize` action (clean separation)
- **Legacy**: Task's `onEnabled` activity (creates coupling)

---

## See Also

- [Core Concepts](./CORE_CONCEPTS.md) - Fundamental workflow concepts
- [Domain Modeling](./DOMAIN_MODELING.md) - Data modeling patterns
- [Authorization](./AUTHORIZATION.md) - RBAC and work assignments
- [Exceptions](./EXCEPTIONS.md) - Exception handling patterns
- [Workflow State in UIs](./WORKFLOW_STATE_UI.md) - Using workflow state correctly
