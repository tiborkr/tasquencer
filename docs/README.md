# Tasquencer Documentation

## What is Tasquencer?

Tasquencer is a **YAWL-based workflow orchestration engine** built on Convex for coordinating multiple human and AI actors in business processes.

### Key Characteristics

- ✅ **Atomic execution**: Entire engine runs in a single Convex mutation
- ✅ **Hierarchical workflows**: Unlimited nesting via composite tasks
- ✅ **Advanced control flow**: AND/XOR/OR splits and joins
- ✅ **Type-safe boundaries**: Zod-validated action payloads
- ⚠️ **Security-first**: Custom actions require explicit authorization
- ✅ **State synchronization**: Activities callbacks for domain state
- ❌ **Not for batch jobs**: Designed for business processes, not data processing
- ❌ **No direct I/O**: Must use Convex scheduler for external calls

### When to Use Tasquencer

**Use Tasquencer when you need:**

- Multi-step business processes with human approvals (RFP responses, document reviews, hiring workflows)
- Coordination between multiple actors (humans, AI agents, external systems)
- Complex routing logic (parallel tasks, conditional branches, dynamic paths)
- Long-running processes with persistent state
- Hierarchical workflows (processes within processes)

**Don't use Tasquencer for:**

- Simple CRUD operations (use regular Convex mutations)
- Batch data processing (not designed for high-volume data transformation)
- Real-time streaming (use Convex subscriptions directly)
- Single-step operations (overhead not worth it)

## Documentation Structure

This documentation is organized into focused guides. Start with the guides that match your current task.

### 🚀 Getting Started

**[Getting Started Guide](./GETTING_STARTED.md)** - _Start here if you're new_

- Development process and workflow
- Step-by-step implementation sequence
- Testing requirements
- Quick start examples

### 🧠 Understanding Tasquencer

**[Core Concepts](./CORE_CONCEPTS.md)** - _Essential mental models_

- Architecture layers
- State machine semantics
- YAWL Petri net foundations
- Cancellation and failure semantics
- When to use explicit conditions

**[Glossary](./GLOSSARY.md)** - _Key terminology reference_

- Core workflow concepts
- Domain modeling terms
- Exception handling definitions
- Authorization & metadata
- Quick decision trees

**[Domain Modeling](./DOMAIN_MODELING.md)** - _Design your data layer_

- Schema file organization (per-workflow schemas)
- Aggregate root pattern
- Subworkflow relationships
- Work item data storage
- Domain-driven design principles
- Data access rules and indexing
- Context parameter patterns

**[Workflow State in UIs](./WORKFLOW_STATE_UI.md)** - _When and how to use workflow state_

- Workflow state vs domain state
- Using workflow state for UI display
- Using domain state for business logic
- Decision trees and examples
- Understanding multiple active tasks

### 🔧 Building Workflows

**[Workflow Basics](./WORKFLOWS_BASIC.md)** - _Core building blocks_

- Builder API reference
- Work items and tasks
- Workflow lifecycle
- Activities and actions overview
- Simple control flow

**[Advanced Workflows](./WORKFLOWS_ADVANCED.md)** - _Complex patterns_

- Control flow patterns (AND/XOR/OR splits and joins)
- Deferred choice
- Multi-instance tasks
- Composite tasks and subworkflows
- Cancellation regions

**[Work Item Patterns](./WORK_ITEM_PATTERNS.md)** - _Work item best practices_

- Work item metadata initialization
- Shared helper functions
- Assignment strategies
- Work queues
- Dynamic work item initialization

**[Authorization & RBAC](./AUTHORIZATION.md)** - _⚠️ REQUIRED for custom actions_

- **Why authorization is mandatory for custom actions**
- Declarative authorization with `authService.builders`
- Defining scopes, roles and groups
- Work item metadata & assignments
- Policy composition
- Authorization best practices

### 🛡️ Error Handling & Recovery

**[Exception Handling](./EXCEPTIONS.md)** - _Dealing with failures_

- Business exceptions vs code errors
- Exception policies
- Retry patterns
- Constraint violation monitoring
- Failure propagation control

**[Compensation](./COMPENSATION.md)** - _Undoing work_

- Automatic compensation with activities
- Multi-step compensation patterns
- Compensation workflows
- Decision guide and best practices

### 🔌 Integration

**[Actions vs Activities](./ACTIONS_ACTIVITIES.md)** - _Crossing boundaries_

- Actions (external boundary)
- Activities (internal callbacks)
- Critical work item access patterns
- When to use each

**[External Communication](./EXTERNAL_IO.md)** - _Talking to the outside world_

- Convex scheduler integration
- Async work patterns
- Timed delays
- External API calls

**[UI Integration](./UI_INTEGRATION.md)** - _Building interfaces_

- Domain-first philosophy
- Query patterns
- Form patterns
- State-based rendering
- Progress indicators

### 🐛 Debugging & Recipes

**[Debugging Guide](./DEBUGGING.md)** - _Troubleshooting workflows_

- Inspecting workflow state
- Common issues and solutions
- Pitfalls to avoid

**[Recipe Book](./RECIPES.md)** - _Common patterns_

- Human-in-the-loop approval
- AI agent tasks with retry
- Parallel processing with aggregation
- Timeouts and cancellation
- Dynamic task creation

## Quick Navigation

### By Task Type

- **First-time setup** → [Getting Started](./GETTING_STARTED.md)
- **Understanding the architecture** → [Core Concepts](./CORE_CONCEPTS.md)
- **Designing domain schema** → [Domain Modeling](./DOMAIN_MODELING.md)
- **Creating simple workflows** → [Workflow Basics](./WORKFLOWS_BASIC.md)
- **Implementing parallel/conditional logic** → [Advanced Workflows](./WORKFLOWS_ADVANCED.md)
- **Handling errors** → [Exception Handling](./EXCEPTIONS.md)
- **Undoing completed work** → [Compensation](./COMPENSATION.md)
- **Calling external APIs** → [External Communication](./EXTERNAL_IO.md)
- **Building forms and UI** → [UI Integration](./UI_INTEGRATION.md)
- **Workflow stuck or not working** → [Debugging Guide](./DEBUGGING.md)
- **Looking for examples** → [Recipe Book](./RECIPES.md)

### By Question

- "How do I structure my database schema?" → [Domain Modeling - Schema File Organization](./DOMAIN_MODELING.md#schema-file-organization)
- "What's the difference between actions and activities?" → [Actions vs Activities](./ACTIONS_ACTIVITIES.md)
- "What's the difference between workflow state and domain state?" → [Workflow State in UIs](./WORKFLOW_STATE_UI.md)
- "How do I run parallel tasks?" → [Advanced Workflows](./WORKFLOWS_ADVANCED.md#and-splits-and-joins)
- "How do I handle user permissions and roles?" → [Authorization & RBAC](./AUTHORIZATION.md)
- "How do I initialize work item metadata?" → [Work Item Patterns](./WORK_ITEM_PATTERNS.md)
- "How do I retry failed API calls?" → [Exception Handling](./EXCEPTIONS.md)
- "How do I undo work when something fails?" → [Compensation](./COMPENSATION.md)
- "What's the difference between business exceptions and code errors?" → [Glossary](./GLOSSARY.md)
- "Can multiple tasks be active at the same time?" → [Core Concepts](./CORE_CONCEPTS.md) and [Workflow State in UIs](./WORKFLOW_STATE_UI.md)
- "My task never enables, why?" → [Debugging Guide](./DEBUGGING.md#task-never-enables)
- "How do I create dynamic numbers of tasks?" → [Recipe Book](./RECIPES.md#dynamic-task-creation)
- "How do I call external APIs?" → [External Communication](./EXTERNAL_IO.md)
- "How do I build forms for work items?" → [UI Integration](./UI_INTEGRATION.md#form-patterns)
- "When should I use auto-triggers?" → [Workflow Basics](./WORKFLOWS_BASIC.md#auto-trigger-pattern)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Single Convex Mutation (Atomic)                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Tasquencer Engine                                 │ │
│  │  - Only workflow state                             │ │
│  │  - No external I/O                                 │ │
│  │  - Respects Convex mutation limits                 │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
         ↕ Actions (Boundary)        ↕ Activities (Internal)
┌─────────────────────────────────────────────────────────┐
│  Domain Layer (Your App)                                │
│  - Domain tables                                        │
│  - Business logic                                       │
│  - External API calls (via scheduler)                   │
└─────────────────────────────────────────────────────────┘
```

See [Core Concepts](./CORE_CONCEPTS.md) for detailed architecture explanation.

## Getting Help

### Quick Diagnosis

1. **Workflow not progressing?** → [Debugging Guide](./DEBUGGING.md)
2. **TypeScript errors?** → Run `npm run dev:convex:once` and check [Getting Started](./GETTING_STARTED.md#development-process-requirements)
3. **Confused about concepts?** → [Core Concepts](./CORE_CONCEPTS.md)
4. **Looking for examples?** → [Recipe Book](./RECIPES.md)

### Best Practices

- Always start with [Domain Modeling](./DOMAIN_MODELING.md) before building workflows
- Follow the development sequence in [Getting Started](./GETTING_STARTED.md)
- Test domain functions before implementing workflows
- Use [Recipe Book](./RECIPES.md) patterns as templates
