# Exception Handling

> **Prerequisites**: [Workflow Basics](./WORKFLOWS_BASIC.md), [Core Concepts](./CORE_CONCEPTS.md)  
> **Related**: [Compensation](./COMPENSATION.md) | [Advanced Workflows](./WORKFLOWS_ADVANCED.md)

This guide covers exception handling, failure semantics, and retry patterns in Tasquencer.

## Table of Contents

- [Exception Handling](#exception-handling)
- [Failure Propagation and Policies](#failure-propagation-and-policies)
- [Best Practices](#best-practices)
- [External API Exception Handling](#external-api-exception-handling)

---

## Exception Handling

Tasquencer provides sophisticated exception handling capabilities for business processes. Understanding the distinction between business exceptions and code exceptions is critical to building reliable workflows.

### Business Exceptions vs Code Exceptions

Tasquencer distinguishes between two fundamentally different types of exceptions:

#### Code-Level Exceptions (Transaction Rollback)

Code exceptions are standard JavaScript errors that cause the entire Convex mutation to roll back.

**When to use:**

- Infrastructure failures (database connection lost, network timeout)
- Programming bugs (null pointer, type errors)
- Configuration errors (missing required settings)
- Data integrity violations (should never happen in normal operation)
- Any situation where you want **everything undone**

**What happens when thrown:**

1. Exception bubbles up: `throw new Error("...")`
2. Entire Convex transaction rolls back
3. **No workflow state changes persist**
4. **No domain state changes persist**
5. Convex automatically retries with exponential backoff
6. Eventually succeeds or hits max retries

**Example:**

```typescript
// ✅ Good use of code exceptions
.withActivities({
  onEnabled: async ({ mutationCtx, parent }) => {
    const config = await ConfigDomain.getByWorkflowId(
      mutationCtx,
      parent.workflow.id
    )

    if (!config) {
      // Configuration should always exist - this is a programming bug
      throw new Error('Workflow configuration missing')
    }

    await workItem.initialize({ configId: config._id })
  }
})
```

**Important:** The workflow engine never sees code exceptions. They abort the entire transaction before any workflow state changes can persist. This is Convex's transactional guarantee.

#### Business Exceptions (Workflow State Tracked)

Business exceptions are expected failure modes in your business process that are explicitly modeled and handled by the workflow.

**When to use:**

- User-initiated rejections (approval declined, form cancelled)
- Business rule violations (credit limit exceeded, validation failed)
- Deadline expiry (task took too long)
- External system business errors (payment declined, API returns "invalid input")
- Constraint violations (ordering rules broken)
- Any situation where the failure needs to be **recorded and handled**

**What happens when signaled:**

1. Domain state updated via domain functions
2. `workItem.fail()` called (or completion with failure status)
3. Work item transitions to `'failed'` state
4. **Transaction commits successfully**
5. All state changes persist to database
6. Task policy evaluates the failure
7. Workflow continues or propagates failure based on policy
8. Compensation/rollback logic can execute

**Example:**

```typescript
// ✅ Good use of business exceptions
const approvalWorkItem = Builder.workItem('approval').withActions(
  Builder.workItemActions()
    .complete(
      z.object({
        notes: z.string().optional(),
      }),
      async ({ mutationCtx, workItem }, payload) => {
        // Approval path - update domain state
        await ApprovalDomain.updateRecord(mutationCtx, workItem.id, {
          status: 'approved',
          approvedAt: Date.now(),
          notes: payload.notes,
        })
        // Complete the work item
        await workItem.complete()
      },
    )
    .fail(
      z.object({
        reason: z.string(),
      }),
      async ({ mutationCtx, workItem }, payload) => {
        // Rejection path - update domain state
        await ApprovalDomain.updateRecord(mutationCtx, workItem.id, {
          status: 'rejected',
          reason: payload.reason,
          rejectedAt: Date.now(),
        })
        // Fail the work item (signals business exception)
        await workItem.fail()
      },
    ),
)

// From UI or external system:
// - If user approves: call completeWorkItem mutation with notes
// - If user rejects: call failWorkItem mutation with reason
```

**Key insight:** Business exceptions are **expected outcomes** that need to be recorded and handled by the workflow. Code exceptions are **unexpected errors** that need to be retried or escalated.

### Common Anti-Patterns

#### ❌ Anti-Pattern 1: Using throw for Business Exceptions

```typescript
// ❌ WRONG: Don't throw for business logic exceptions
.withActions(
  Builder.workItemActions()
    .complete(
      z.object({ approved: z.boolean() }),
      async ({ mutationCtx, workItem }, payload) => {
        if (!payload.approved) {
          throw new Error('Not approved')  // ❌ Transaction rollback!
        }

        await MyDomain.updateRecord(mutationCtx, workItem.id, {
          status: 'approved'
        })
        await workItem.complete()
      }
    )
)
```

**What goes wrong:**

1. User clicks "Reject" button → UI calls `completeWorkItem` mutation
2. Exception thrown → transaction rolls back
3. Work item stays in `'started'` state (no state change persisted)
4. User sees error, clicks "Reject" again
5. Same thing happens... infinite loop!

**The fix:**

```typescript
// ✅ RIGHT: Use separate fail action for business exceptions
.withActions(
  Builder.workItemActions()
    .complete(
      z.object({ notes: z.string().optional() }),
      async ({ mutationCtx, workItem }, payload) => {
        await MyDomain.updateRecord(mutationCtx, workItem.id, {
          status: 'approved',
          notes: payload.notes,
        })
        await workItem.complete()
      }
    )
    .fail(
      z.object({ reason: z.string() }),
      async ({ mutationCtx, workItem }, payload) => {
        await MyDomain.updateRecord(mutationCtx, workItem.id, {
          status: 'rejected',
          reason: payload.reason
        })
        await workItem.fail()
      }
    )
)

// From UI:
// - Approve button: calls completeWorkItem mutation
// - Reject button: calls failWorkItem mutation
```

#### ❌ Anti-Pattern 2: Letting Unrecoverable Errors Continue

```typescript
// ❌ WRONG: Continuing execution when data integrity is violated
.withActivities({
  onEnabled: async ({ mutationCtx, workItem, parent }) => {
    const doc = await DocumentDomain.getByWorkflowId(
      mutationCtx,
      parent.workflow.id
    )

    if (!doc) {
      // This should never happen - data corruption!
      console.error('Document not found')  // ❌ Don't just log
      await workItem.fail({ reason: 'Document not found' })  // ❌ Wrong exception type
      return
    }
  }
})
```

**What goes wrong:**

- Data integrity issue gets hidden
- Workflow continues with corrupted state
- Hard to debug later

**The fix:**

```typescript
// ✅ RIGHT: Throw for data integrity violations
.withActivities({
  onEnabled: async ({ mutationCtx, workItem, parent }) => {
    const doc = await DocumentDomain.getByWorkflowId(
      mutationCtx,
      parent.workflow.id
    )

    if (!doc) {
      // This should never happen - fail fast!
      throw new Error(
        `Document not found for workflow ${parent.workflow.id} - data integrity violation`
      )
    }

    await workItem.initialize({ documentId: doc._id })
  }
})
```

### Decision Tree

Use this decision tree to determine which exception type to use:

```
Exception detected
    │
    ├── Is this an expected failure in the business process?
    │   (user rejection, validation failure, deadline, business rule)
    │   ↓
    │   YES → Call the separate fail action
    │         • From UI: User clicks reject → calls failWorkItem mutation
    │         • From scheduled function: Deadline expires → calls failWorkItem mutation
    │         • From activity hook: Validation fails → calls workItem.fail() (auto-trigger)
    │
    │         ✓ State changes persist
    │         ✓ Transaction commits
    │         ✓ Workflow continues (based on policy)
    │         ✓ Compensation/rollback can run
    │         ✓ Failure recorded in database
    │
    └── Is this unexpected or unrecoverable?
        (missing config, data corruption, infrastructure failure)
        ↓
        YES → throw new Error()
              ✓ Transaction rolls back
              ✓ No partial state changes
              ✓ Convex retries automatically
              ✓ Eventually succeeds or workflow fails entirely
```

### Action Selection Pattern

**Key Concept:** Work items expose separate actions (`complete`, `fail`, `cancel`) as distinct entry points. External systems (UI, scheduled functions, webhooks) decide which action to invoke based on the outcome.

> **Note:** Fail actions are optional. For many work items, transaction rollback (throwing an error) handles error scenarios adequately. Define an explicit `fail` action when you need to:
>
> - Record a business failure reason in domain state before the work item transitions
> - Trigger specific cleanup or compensation logic via `onFailed` activities
> - Allow the workflow to continue despite the failure (via a custom policy that returns `'continue'` or `'complete'` instead of `'fail'`)

#### Approach 1: UI-Driven Action Selection

The most common pattern - user interactions in the UI call different mutations:

```typescript
// Work item defines separate actions
const approvalWorkItem = Builder.workItem('approval')
  .withActions(
    Builder.workItemActions()
      .complete(
        z.object({ notes: z.string().optional() }),
        async ({ mutationCtx, workItem }, payload) => {
          await ApprovalDomain.recordApproval(mutationCtx, workItem.id, payload.notes)
          await workItem.complete()
        },
      )
      .fail(
        z.object({ reason: z.string() }),
        async ({ mutationCtx, workItem }, payload) => {
          await ApprovalDomain.recordRejection(mutationCtx, workItem.id, payload.reason)
          await workItem.fail()
        },
      ),
  )

// In your UI:
function ApprovalForm({ workItemId }) {
  const completeApproval = useMutation(api.workflows.approval.completeWorkItem)
  const rejectApproval = useMutation(api.workflows.approval.failWorkItem)

  return (
    <div>
      <button onClick={() => completeApproval({
        workItemId,
        args: { name: 'approval', payload: { notes: '...' } }
      })}>
        Approve
      </button>
      <button onClick={() => rejectApproval({
        workItemId,
        args: { name: 'approval', payload: { reason: '...' } }
      })}>
        Reject
      </button>
    </div>
  )
}
```

#### Approach 2: Scheduled Function Action Selection

Timeout or deadline checks call the appropriate action:

```typescript
// Scheduled function checks deadline and calls fail action
export const checkDeadline = internalMutation({
  args: { workItemId: v.id('tasquencerWorkItems') },
  handler: async (ctx, args) => {
    const workItem = await ctx.db.get(args.workItemId)

    if (workItem?.state === 'started') {
      // Deadline expired - call fail action
      await ctx.runMutation(api.workflows.myWorkflow.failWorkItem, {
        workItemId: args.workItemId,
        args: {
          name: 'timeoutTask',
          payload: { reason: 'Deadline expired' },
        },
      })
    }
  },
})
```

#### Approach 3: Auto-Trigger from Activity Hook

For validation logic that runs when the work item starts:

```typescript
const validationWorkItem = Builder.workItem('validation')
  .withActions(
    Builder.workItemActions()
      .complete(z.never(), async ({ mutationCtx, workItem }) => {
        await ValidationDomain.recordSuccess(mutationCtx, workItem.id)
        await workItem.complete()
      })
      .fail(
        z.object({ reason: z.string() }),
        async ({ mutationCtx, workItem }, payload) => {
          await ValidationDomain.recordFailure(
            mutationCtx,
            workItem.id,
            payload.reason,
          )
          await workItem.fail()
        },
      ),
  )
  .withActivities({
    onStarted: async ({ mutationCtx, workItem }) => {
      // Run validation when work starts
      const data = await ValidationDomain.getData(mutationCtx, workItem.id)
      const validationResult = await ValidationDomain.validate(data)

      if (!validationResult.valid) {
        // Auto-trigger failure
        workItem.fail({ reason: validationResult.reason })
        return
      }

      // Auto-trigger completion
      workItem.complete({})
    },
  })
```

#### Approach 4: External System Action Selection

External APIs or webhooks route to the appropriate action:

```typescript
// Action routes to complete or fail based on external API response
export const processPayment = internalAction({
  args: { workItemId: v.id('tasquencerWorkItems'), amount: v.number() },
  handler: async (ctx, args) => {
    try {
      const result = await externalPaymentAPI.charge(args.amount)

      // Success → call complete action
      await ctx.runMutation(api.workflows.payment.completeWorkItem, {
        workItemId: args.workItemId,
        args: { name: 'payment', payload: { transactionId: result.id } },
      })
    } catch (error) {
      if (isBusinessError(error)) {
        // Business exception → call fail action
        await ctx.runMutation(api.workflows.payment.failWorkItem, {
          workItemId: args.workItemId,
          args: { name: 'payment', payload: { reason: error.message } },
        })
      } else {
        // Infrastructure error → let it bubble up for retry
        throw error
      }
    }
  },
})
```

### Exception Handling Patterns

The following patterns show how to handle various exception scenarios in Tasquencer.

#### Pattern: User Rejection with Compensation

```typescript
const reviewWorkItem = Builder.workItem('review').withActions(
  Builder.workItemActions()
    .complete(
      z.object({
        comments: z.string(),
      }),
      async ({ mutationCtx, workItem }, payload) => {
        // Approval path
        await ReviewDomain.updateReview(mutationCtx, workItem.id, {
          status: 'approved',
          comments: payload.comments,
          approvedAt: Date.now(),
        })
        await workItem.complete()
      },
    )
    .fail(
      z.object({
        reason: z.string(),
        comments: z.string(),
      }),
      async ({ mutationCtx, workItem }, payload) => {
        // Rejection path
        await ReviewDomain.updateReview(mutationCtx, workItem.id, {
          status: 'rejected',
          comments: payload.comments,
          rejectedAt: Date.now(),
        })
        await workItem.fail()
      },
    ),
)

const reviewTask = Builder.task(reviewWorkItem)
  .withActivities({
    onWorkItemStateChanged: async ({ mutationCtx, workItem }) => {
      if (workItem.nextState === 'failed') {
        // Compensation: notify stakeholders about this specific rejection
        await NotificationDomain.sendRejectionNotification(
          mutationCtx,
          workItem.id,
        )
      }
    },
  })
  .withPolicy(async ({ transition, task }) => {
    if (transition.nextState === 'failed') {
      // Continue workflow - rejection is valid outcome
      return 'complete'
    }

    const stats = await task.getStats()
    const allFinalized =
      stats.completed + stats.failed + stats.canceled === stats.total
    return allFinalized ? 'complete' : 'continue'
  })
```

#### Pattern: Business Rule Violation (Auto-Trigger from Activity)

```typescript
const paymentWorkItem = Builder.workItem('payment')
  .withActions(
    Builder.workItemActions()
      .initialize(
        z.object({ amount: z.number() }),
        async ({ mutationCtx, workItem }, payload) => {
          const workItemId = await workItem.initialize()
          await PaymentDomain.createPaymentRequest(mutationCtx, {
            workItemId,
            amount: payload.amount,
            status: 'pending',
          })
        },
      )
      .complete(z.never(), async ({ mutationCtx, workItem }, payload) => {
        // Process successful payment
        await PaymentDomain.processPayment(mutationCtx, workItem.id)
        await workItem.complete()
      })
      .fail(
        z.object({ reason: z.string() }),
        async ({ mutationCtx, workItem }, payload) => {
          // Log rejection
          await PaymentDomain.logRejection(
            mutationCtx,
            workItem.id,
            payload.reason,
          )
          await workItem.fail()
        },
      ),
  )
  .withActivities({
    onStarted: async ({ mutationCtx, workItem }) => {
      // Validate business rules when work starts
      const paymentRequest = await PaymentDomain.getPaymentRequest(
        mutationCtx,
        workItem.id,
      )
      const creditLimit = await PaymentDomain.getCreditLimit(
        mutationCtx,
        workItem.id,
      )

      if (paymentRequest.amount > creditLimit) {
        // Business rule violation - auto-trigger failure
        workItem.fail({
          reason: `Amount $${paymentRequest.amount} exceeds credit limit $${creditLimit}`,
        })
        return
      }

      // Rule passed - auto-trigger completion
      workItem.complete({})
    },
  })
```

#### Pattern: Deadline Expiry

```typescript
const timeoutWorkItem = Builder.workItem('processWithTimeout').withActions(
  Builder.workItemActions()
    .initialize(
      z.object({ deadline: z.number() }),
      async ({ mutationCtx, workItem, registerScheduled }, payload) => {
        const workItemId = await workItem.initialize()

        // Create domain record
        await ProcessDomain.createJob(mutationCtx, {
          workItemId,
          status: 'pending',
          deadline: payload.deadline,
        })

        // Schedule deadline check
        await registerScheduled(
          mutationCtx.scheduler.runAfter(
            payload.deadline,
            internal.workflows.checkDeadline,
            { workItemId },
          ),
        )
      },
    )
    .fail(
      z.object({ reason: z.string() }),
      async ({ mutationCtx, workItem }, payload) => {
        await ProcessDomain.updateJob(mutationCtx, workItem.id, {
          status: 'failed',
          failureReason: payload.reason,
        })
      },
    ),
)

// In your internal mutations
export const checkDeadline = internalMutation({
  args: { workItemId: v.id('tasquencerWorkItems') },
  handler: async (ctx, args) => {
    const workItem = await ctx.db.get(args.workItemId)

    if (workItem?.state === 'started') {
      // Business exception: deadline expired
      await ctx.runMutation(api.workflows.myWorkflow.failWorkItem, {
        workItemId: args.workItemId,
        args: {
          name: 'processWithTimeout',
          payload: { reason: 'Deadline expired' },
        },
      })
    }
  },
})
```

#### Pattern: External API with Business vs Code Exceptions

```typescript
const externalAPIWorkItem = Builder.workItem('callExternalAPI').withActions(
  Builder.workItemActions()
    .initialize(
      z.object({ requestData: z.string() }),
      async ({ mutationCtx, workItem, registerScheduled }, payload) => {
        const workItemId = await workItem.initialize()

        await APIDomain.createRequest(mutationCtx, {
          workItemId,
          requestData: payload.requestData,
          status: 'pending',
        })

        // Schedule external API call
        await registerScheduled(
          mutationCtx.scheduler.runAfter(0, internal.externalAPI.callService, {
            workItemId,
            requestData: payload.requestData,
          }),
        )
      },
    )
    .complete(
      z.object({ result: z.string() }),
      async ({ mutationCtx, workItem }, payload) => {
        // Update domain state for successful API call
        await APIDomain.updateRequest(mutationCtx, workItem.id, {
          status: 'completed',
          result: payload.result,
        })
        await workItem.complete()
      },
    )
    .fail(
      z.object({ reason: z.string() }),
      async ({ mutationCtx, workItem }, payload) => {
        // Update domain state for failed API call
        await APIDomain.updateRequest(mutationCtx, workItem.id, {
          status: 'failed',
          failureReason: payload.reason,
        })
        await workItem.fail()
      },
    ),
)

// In your actions - external API calls decide which mutation to invoke
export const callService = internalAction({
  args: {
    workItemId: v.id('tasquencerWorkItems'),
    requestData: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const result = await externalPaymentAPI.charge(args.requestData)

      // Success - call complete action
      await ctx.runMutation(api.workflows.myWorkflow.completeWorkItem, {
        workItemId: args.workItemId,
        args: {
          name: 'callExternalAPI',
          payload: { result: result.id },
        },
      })
    } catch (error) {
      // Distinguish business errors from infrastructure errors

      if (
        error.code === 'INSUFFICIENT_FUNDS' ||
        error.code === 'INVALID_CARD' ||
        error.code === 'DECLINED'
      ) {
        // ✅ Business exception: call fail action
        await ctx.runMutation(api.workflows.myWorkflow.failWorkItem, {
          workItemId: args.workItemId,
          args: {
            name: 'callExternalAPI',
            payload: { reason: error.message },
          },
        })
      } else {
        // ✅ Code exception: infrastructure failure
        // Let it bubble up for Convex to retry
        throw error
      }
    }
  },
})
```

#### Pattern: Retry with Exponential Backoff

```typescript
const retryableWorkItem = Builder.workItem('retryableTask').withActions(
  Builder.workItemActions()
    .initialize(
      z.object({ data: z.string() }),
      async ({ mutationCtx, workItem }, payload) => {
        const workItemId = await workItem.initialize()

        await RetryDomain.createAttempt(mutationCtx, {
          workItemId,
          data: payload.data,
          attemptNumber: 0,
          maxRetries: 3,
        })
      },
    )
    .fail(
      z.object({ reason: z.string() }),
      async ({ mutationCtx, workItem }, payload) => {
        await RetryDomain.updateAttempt(mutationCtx, workItem.id, {
          status: 'failed',
          failureReason: payload.reason,
        })
      },
    ),
)

const retryableTask = Builder.task(retryableWorkItem)
  .withActivities({
    onWorkItemStateChanged: async ({
      workItem,
      task,
      mutationCtx,
      registerScheduled,
    }) => {
      if (workItem.nextState === 'failed') {
        // Check if we should retry
        const attempt = await RetryDomain.getAttempt(mutationCtx, workItem.id)

        if (attempt.attemptNumber < attempt.maxRetries) {
          // Schedule retry with exponential backoff
          const backoffMs = Math.pow(2, attempt.attemptNumber) * 1000

          await registerScheduled(
            mutationCtx.scheduler.runAfter(
              backoffMs,
              internal.workflows.retryWorkItem,
              {
                taskWorkflowId: workItem.parent.workflowId,
                originalData: attempt.data,
              },
            ),
          )

          await RetryDomain.incrementAttempt(mutationCtx, workItem.id)
        }
      }
    },
  })
  .withPolicy(async ({ transition, task }) => {
    if (transition.nextState === 'failed') {
      const stats = await task.getStats()

      // If there's a new work item (retry scheduled), keep going
      if (stats.initialized > 0) {
        return 'continue'
      }

      // No more retries, propagate failure
      return 'fail'
    }

    const stats = await task.getStats()
    const allFinalized =
      stats.completed + stats.failed + stats.canceled === stats.total
    return allFinalized ? 'complete' : 'continue'
  })

// Retry action
export const retryWorkItem = internalMutation({
  args: {
    taskWorkflowId: v.id('tasquencerWorkflows'),
    originalData: v.string(),
  },
  handler: async (ctx, args) => {
    // Initialize a new work item (simulates restart)
    await ctx.runMutation(api.workflows.myWorkflow.initializeWorkItem, {
      workflowId: args.taskWorkflowId,
      args: {
        name: 'retryableTask',
        payload: { data: args.originalData },
      },
    })
  },
})
```

#### Pattern: Constraint Violation Monitoring

```typescript
// Schedule periodic constraint checks
export const monitorConstraints = internalMutation({
  handler: async (ctx) => {
    // Check all active work items for constraint violations
    const activeWorkItems = await ctx.db
      .query('tasquencerWorkItems')
      .filter((q) => q.eq(q.field('state'), 'started'))
      .collect()

    for (const workItem of activeWorkItems) {
      const violation = await OrderDomain.checkConstraints(ctx, workItem._id)

      if (violation) {
        // Business exception: constraint violated
        await ctx.runMutation(api.workflows.orderWorkflow.failWorkItem, {
          workItemId: workItem._id,
          args: {
            name: 'processOrder',
            payload: {
              reason: `Constraint violation: ${violation.description}`,
            },
          },
        })
      }
    }
  },
})
```

### Failure Propagation and Policies

When a work item fails (business exception), the task policy determines what happens next:

```typescript
.withPolicy(async ({ transition, task, mutationCtx, parent }) => {
  if (transition.nextState === 'failed') {
    // You have three options:

    // Option 1: Continue - workflow continues, task doesn't fail
    return 'continue'

    // Option 2: Fail - task fails → workflow fails (default behavior)
    return 'fail'

    // Option 3: Complete - task completes normally despite failure
    return 'complete'
  }

  // Default completion logic
  const stats = await task.getStats()
  const allFinalized =
    stats.completed + stats.failed + stats.canceled === stats.total
  return allFinalized ? 'complete' : 'continue'
})
```

**Default failure behavior (if no policy specified):**

- Work item fails → Task fails → Workflow fails → Parent composite task fails
- This is **fail-fast** behavior - appropriate for critical paths
- Override with custom policy for graceful degradation

> **Note:** Understanding how failures propagate through the workflow hierarchy is crucial for writing correct compensation logic. When a task fails, sibling tasks are **canceled** (not failed), which determines which activity hooks run. For a detailed explanation of lateral cleanup vs. upward propagation, see the [Lateral Cleanup and Upward Propagation](./CORE_CONCEPTS.md#lateral-cleanup-and-upward-propagation) section in the Core Concepts guide.

### Assertion Functions with Type Guards

**Use TypeScript assertion functions with `asserts` keyword for type-safe error handling.**

Assertion functions provide compile-time type narrowing and runtime validation in a single function. They're especially useful for validating data fetched from the database or checking preconditions in activities/actions.

#### The `asserts` Keyword

TypeScript's `asserts` keyword enables **type narrowing** - after calling an assertion function, TypeScript knows the value is non-null:

```typescript
// Assertion function with type guard
export function assertPatientExists(
  patient: unknown,
  workflowId: Id<'tasquencerWorkflows'>,
): asserts patient is NonNullable<typeof patient> {
  if (!patient) {
    throw new EntityNotFoundError('Patient', { workflowId })
  }
}

// Usage
const patient = await getPatientByWorkflowId(ctx.db, workflowId)
// patient is Doc<'patients'> | null here

assertPatientExists(patient, workflowId)
// patient is Doc<'patients'> here - TypeScript knows it's non-null!

// No need for: if (!patient) throw ...
// No need for: patient! (non-null assertion)
// Just use patient directly
await workItem.initialize({ patientId: patient._id })
```

#### Pattern: Entity Existence Checks

```typescript
export function assertPatientExists(
  patient: unknown,
  workflowId: Id<'tasquencerWorkflows'>,
): asserts patient is NonNullable<typeof patient> {
  if (!patient) {
    throw new EntityNotFoundError('Patient', { workflowId })
  }
}

export function assertDiagnosticsExists(
  diagnostics: unknown,
  workflowId: Id<'tasquencerWorkflows'>,
): asserts diagnostics is NonNullable<typeof diagnostics> {
  if (!diagnostics) {
    throw new EntityNotFoundError('Diagnostics', { workflowId })
  }
}

export function assertHospitalStayExists(
  hospitalStay: unknown,
  workflowId: Id<'tasquencerWorkflows'>,
): asserts hospitalStay is NonNullable<typeof hospitalStay> {
  if (!hospitalStay) {
    throw new EntityNotFoundError('HospitalStay', { workflowId })
  }
}
```

**Usage in activities:**

```typescript
const dischargeTask = Builder.dummyTask().withActivities({
  onEnabled: async ({ mutationCtx, parent }) => {
    const patient = await getPatientByWorkflowId(
      mutationCtx.db,
      parent.workflow.id,
    )
    // Type guard: patient is non-null after this line
    assertPatientExists(patient, parent.workflow.id)

    // TypeScript knows patient is non-null here
    await markPatientReadyForDischarge(
      mutationCtx.db,
      patient._id,
      parent.workflow.id,
    )
  },
})
```

#### Pattern: Authentication Checks

```typescript
export function assertAuthenticatedUser<T>(
  authUser: T | null | undefined,
  context: Record<string, unknown> = {},
): asserts authUser is T {
  if (!authUser) {
    throw new ConstraintViolationError('AUTHENTICATION_REQUIRED', {
      workflow: 'myWorkflow',
      ...context,
    })
  }
}

// Usage
const authUser = await authComponent.safeGetAuthUser(mutationCtx)
assertAuthenticatedUser(authUser, {
  operation: 'initializeWorkflow',
})

// authUser is non-null here
const userId = authUser.userId as Id<'users'>
```

#### Pattern: Authorization Checks

```typescript
export function assertErStaffMembership(
  isAuthorized: boolean,
  context: { userId: Id<'users'>; allowedGroupIds: Array<Id<'authGroups'>> },
): void {
  if (!isAuthorized) {
    throw new ConstraintViolationError('ER_STAFF_MEMBERSHIP_REQUIRED', {
      ...context,
    })
  }
}

// Usage
const isAuthorized = await isUserInAnyGroup(
  mutationCtx,
  userId,
  allowedGroupIds,
)
assertErStaffMembership(isAuthorized, { userId, allowedGroupIds })
```

#### Pattern: Configuration Checks

```typescript
export function assertErGroupConfiguration(
  groupMap: Record<string, Id<'authGroups'>>,
  groupNames: ReadonlyArray<string>,
): void {
  const missingGroupNames = groupNames.filter((name) => !groupMap[name])
  if (missingGroupNames.length > 0) {
    throw new ConfigurationError('ER staff groups not configured', {
      expectedGroupNames: groupNames,
      missingGroupNames,
    })
  }
}

// Usage
const groupMap = await getGroupsByNames(mutationCtx, [
  ER_GROUPS.ALL_STAFF,
  ER_GROUPS.NURSING,
])
assertErGroupConfiguration(groupMap, [ER_GROUPS.ALL_STAFF, ER_GROUPS.NURSING])
const allowedGroupIds = Object.values(groupMap)
```

#### Pattern: Data Integrity Checks

```typescript
export function assertPatientMatches(
  actualPatientId: Id<'patients'>,
  expectedPatientId: Id<'patients'>,
  context: Record<string, unknown> & { stage?: string },
): void {
  if (actualPatientId !== expectedPatientId) {
    const { stage, ...rest } = context
    const stageSuffix =
      stage && stage.trim().length > 0 ? ` in ${stage} task` : ''
    throw new DataIntegrityError(`Patient mismatch${stageSuffix}`, {
      actualPatientId,
      expectedPatientId,
      ...(stage ? { stage } : {}),
      ...rest,
    })
  }
}

// Usage
assertPatientMatches(workItemPatientId, expectedPatientId, {
  stage: 'diagnostics',
  workItemId,
})
```

#### Pattern: Business State Checks

```typescript
export function assertSpecialistConsultationPending(
  consultation: { state: { status: string } },
  context: Record<string, unknown>,
): void {
  if (consultation.state.status === 'completed') {
    throw new ConstraintViolationError(
      'SPECIALIST_CONSULTATION_ALREADY_COMPLETED',
      context,
    )
  }
}

// Usage
assertSpecialistConsultationPending(consultation, {
  consultationId: consultation._id,
  workItemId,
})
```

#### Contextual Error Messages

**Always include context in assertion functions:**

```typescript
// ✅ Good: Rich context for debugging
assertPatientExists(patient, parent.workflow.id)
// Error: EntityNotFoundError('Patient', { workflowId: 'wf_123' })

assertAuthenticatedUser(authUser, {
  operation: 'initializeErPatientJourney',
  workflowId: parent.workflow.id,
})
// Error: ConstraintViolationError('AUTHENTICATION_REQUIRED', {
//   workflow: 'erPatientJourney',
//   operation: 'initializeErPatientJourney',
//   workflowId: 'wf_123'
// })

// ❌ Bad: Generic error message
if (!patient) {
  throw new Error('Patient not found')
}
```

#### Exception Type Hierarchy

Tasquencer provides base exception types for common error scenarios. While you can use these directly, we recommend creating your own domain-specific exception types that extend or wrap these base classes to better match your application's error handling needs.

```typescript
import {
  EntityNotFoundError,
  ConstraintViolationError,
  ConfigurationError,
  DataIntegrityError,
} from '@repo/tasquencer'

// Entity not found (DB query returned null)
throw new EntityNotFoundError('Patient', { workflowId })

// Business constraint violated (auth, permissions, business rules)
throw new ConstraintViolationError('AUTHENTICATION_REQUIRED', context)

// Configuration missing or invalid (setup errors)
throw new ConfigurationError('ER staff groups not configured', { groupNames })

// Data integrity issue (unexpected state, mismatched IDs)
throw new DataIntegrityError('Patient mismatch in diagnostics task', {
  actualPatientId,
  expectedPatientId,
})
```

#### Real-World Example from ER Workflow

```typescript
// convex/workflows/er/exceptions.ts

export function assertAuthenticatedUser<T>(
  authUser: T | null | undefined,
  context: Record<string, unknown> = {},
): asserts authUser is T {
  if (!authUser) {
    throw new ConstraintViolationError('AUTHENTICATION_REQUIRED', {
      workflow: 'erPatientJourney',
      ...context,
    })
  }
}

export function assertPatientExists(
  patient: unknown,
  workflowId: Id<'tasquencerWorkflows'>,
): asserts patient is NonNullable<typeof patient> {
  if (!patient) {
    throw new EntityNotFoundError('Patient', { workflowId })
  }
}

export function assertDiagnosticsExists(
  diagnostics: unknown,
  workflowId: Id<'tasquencerWorkflows'>,
): asserts diagnostics is NonNullable<typeof diagnostics> {
  if (!diagnostics) {
    throw new EntityNotFoundError('Diagnostics', { workflowId })
  }
}

// Usage in workflow
const erWorkflowActions = Builder.workflowActions()
  .initialize(
    z.object({ name: z.string(), complaint: z.string() }),
    async ({ mutationCtx, workflow }, payload) => {
      const authUser = await authComponent.safeGetAuthUser(mutationCtx)
      assertAuthenticatedUser(authUser, {
        operation: 'initializeErPatientJourney',
      })

      const workflowId = await workflow.initialize()
      await createPatientAdmission(mutationCtx.db, workflowId, {
        name: payload.name,
        complaint: payload.complaint,
      })
    },
  )

  // Usage in routing
  .connectTask('diagnostics', (to) =>
    to
      .task('performSurgery')
      .task('reviewDiagnostics')
      .route(async ({ mutationCtx, route, parent }) => {
        const patient = await getPatientByWorkflowId(
          mutationCtx.db,
          parent.workflow.id,
        )
        assertPatientExists(patient, parent.workflow.id)

        const diagnosticsRecord = await getDiagnosticsByPatientId(
          mutationCtx.db,
          patient._id,
          { workflowId: parent.workflow.id },
        )
        assertDiagnosticsExists(diagnosticsRecord, parent.workflow.id)

        const decision = decideDiagnosticRoute({
          isCritical: diagnosticsRecord.xrayIsCritical ?? false,
        })

        return decision === 'emergency'
          ? route.toTask('performSurgery')
          : route.toTask('reviewDiagnostics')
      }),
  )
```

#### Benefits of Assertion Functions

1. **Type safety**: TypeScript knows the value is non-null after assertion
2. **No redundant checks**: No need for `if (!value) throw ...` everywhere
3. **Consistent error handling**: Reusable across the codebase
4. **Rich context**: Always include relevant IDs and context
5. **Clear intent**: Function name documents what's being checked
6. **Easy to test**: Test assertion functions in isolation

### Best Practices

#### ✅ Do:

- **Use domain state for business logic decisions**, not workflow state
- **Define separate `fail` action** for business exceptions (don't call `workItem.fail()` from `complete` action)
- **Let external systems choose the action** - UI buttons, scheduled functions, etc. call `completeWorkItem` or `failWorkItem` mutations
- **Use auto-trigger from `onStarted` activity** for validation logic that determines success/failure
- **Use `throw new Error()` for unexpected/unrecoverable errors**
- **Update domain state before calling work item methods**
- **Let unrecoverable exceptions bubble up** - Convex will retry
- **Implement compensation logic in `onFailed` activities**
- **Use policies to control failure propagation**
- **Check domain state in activities** before initializing work items

#### ❌ Don't:

- **Don't call `workItem.fail()` from inside the `complete` action** - define separate fail action instead
- **Don't throw exceptions for business logic exceptions** - use the fail action
- **Don't catch and swallow unrecoverable errors**
- **Don't mix exception types** - be clear about business vs. code errors
- **Don't forget to update domain state** when work items fail
- **Don't rely on workflow state for business decisions** (use domain state)
- **Don't create work items without checking preconditions**

### External API Exception Handling

When calling external APIs via Convex actions, distinguish between business errors and infrastructure errors:

```typescript
export const callPaymentAPI = internalAction({
  args: {
    workItemId: v.id('tasquencerWorkItems'),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      await externalPaymentAPI.charge(args.amount)

      await ctx.runMutation(api.workflows.payment.completeWorkItem, {
        workItemId: args.workItemId,
        args: { name: 'payment', payload: { success: true } },
      })
    } catch (error) {
      // Categorize the error
      const businessErrorCodes = [
        'INSUFFICIENT_FUNDS',
        'INVALID_CARD',
        'CARD_DECLINED',
        'FRAUD_DETECTED',
      ]

      if (businessErrorCodes.includes(error.code)) {
        // ✅ Business exception: record failure, workflow continues
        await ctx.runMutation(api.workflows.payment.failWorkItem, {
          workItemId: args.workItemId,
          args: {
            name: 'payment',
            payload: { reason: error.message },
          },
        })
      } else {
        // ✅ Infrastructure exception: let Convex retry
        throw error
      }
    }
  },
})
```

---
