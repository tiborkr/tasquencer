# Recipe: Dynamic Composite Tasks (Runtime Workflow Selection)

> **Prerequisites**: [Advanced Workflows](../WORKFLOWS_ADVANCED.md)
> **Related**: [Nested Workflows](./nested-workflows.md) | [XOR Split/Join](./xor-split-join.md)

This recipe demonstrates dynamic composite tasks, which allow you to select which sub-workflow to instantiate at runtime. Unlike regular composite tasks (which always run the same workflow), dynamic composite tasks can choose from a set of possible workflows based on runtime data.

**Problem**: An insurance company receives claims of different types (auto, home, health). Each type has a completely different processing workflow, but they all start from the same claims intake process.

```typescript
// ============================================
// AUTO CLAIMS WORKFLOW
// ============================================
const assessDamageWorkItem = Builder.workItem('assessDamage').withActivities({
  onInitialized: async ({ workItem }) => await workItem.start(),
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    // Auto-specific: assess vehicle damage
    await AutoClaimDomain.assessDamage(mutationCtx, parent.workflow.id)
    await workItem.complete()
  },
})

const getRepairEstimateWorkItem = Builder.workItem('getRepairEstimate').withActivities({
  onInitialized: async ({ workItem }) => await workItem.start(),
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    await AutoClaimDomain.getEstimate(mutationCtx, parent.workflow.id)
    await workItem.complete()
  },
})

const autoClaimWorkflow = Builder.workflow('AutoClaim')
  .startCondition('start')
  .task(
    'assessDamage',
    Builder.task(assessDamageWorkItem).withActivities({
      onEnabled: async ({ workItem }) => await workItem.initialize(),
    }),
  )
  .task(
    'getRepairEstimate',
    Builder.task(getRepairEstimateWorkItem).withActivities({
      onEnabled: async ({ workItem }) => await workItem.initialize(),
    }),
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('assessDamage'))
  .connectTask('assessDamage', (to) => to.task('getRepairEstimate'))
  .connectTask('getRepairEstimate', (to) => to.condition('end'))

// ============================================
// HOME CLAIMS WORKFLOW
// ============================================
const inspectPropertyWorkItem = Builder.workItem('inspectProperty').withActivities({
  onInitialized: async ({ workItem }) => await workItem.start(),
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    await HomeClaimDomain.scheduleInspection(mutationCtx, parent.workflow.id)
    await workItem.complete()
  },
})

const reviewContractorBidsWorkItem = Builder.workItem('reviewBids').withActivities({
  onInitialized: async ({ workItem }) => await workItem.start(),
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    await HomeClaimDomain.reviewBids(mutationCtx, parent.workflow.id)
    await workItem.complete()
  },
})

const homeClaimWorkflow = Builder.workflow('HomeClaim')
  .startCondition('start')
  .task(
    'inspectProperty',
    Builder.task(inspectPropertyWorkItem).withActivities({
      onEnabled: async ({ workItem }) => await workItem.initialize(),
    }),
  )
  .task(
    'reviewBids',
    Builder.task(reviewContractorBidsWorkItem).withActivities({
      onEnabled: async ({ workItem }) => await workItem.initialize(),
    }),
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('inspectProperty'))
  .connectTask('inspectProperty', (to) => to.task('reviewBids'))
  .connectTask('reviewBids', (to) => to.condition('end'))

// ============================================
// HEALTH CLAIMS WORKFLOW
// ============================================
const verifyMedicalRecordsWorkItem = Builder.workItem('verifyRecords').withActivities({
  onInitialized: async ({ workItem }) => await workItem.start(),
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    await HealthClaimDomain.verifyRecords(mutationCtx, parent.workflow.id)
    await workItem.complete()
  },
})

const calculateBenefitsWorkItem = Builder.workItem('calculateBenefits').withActivities({
  onInitialized: async ({ workItem }) => await workItem.start(),
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    await HealthClaimDomain.calculateBenefits(mutationCtx, parent.workflow.id)
    await workItem.complete()
  },
})

const healthClaimWorkflow = Builder.workflow('HealthClaim')
  .startCondition('start')
  .task(
    'verifyRecords',
    Builder.task(verifyMedicalRecordsWorkItem).withActivities({
      onEnabled: async ({ workItem }) => await workItem.initialize(),
    }),
  )
  .task(
    'calculateBenefits',
    Builder.task(calculateBenefitsWorkItem).withActivities({
      onEnabled: async ({ workItem }) => await workItem.initialize(),
    }),
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('verifyRecords'))
  .connectTask('verifyRecords', (to) => to.task('calculateBenefits'))
  .connectTask('calculateBenefits', (to) => to.condition('end'))

// ============================================
// PARENT WORKFLOW: Claims Processing
// ============================================
const intakeClaimWorkItem = Builder.workItem('intakeClaim').withActivities({
  onInitialized: async ({ workItem }) => await workItem.start(),
  onStarted: async ({ workItem }) => await workItem.complete(),
})

const finalizeClaimWorkItem = Builder.workItem('finalizeClaim').withActivities({
  onInitialized: async ({ workItem }) => await workItem.start(),
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    await ClaimDomain.finalize(mutationCtx, parent.workflow.id)
    await workItem.complete()
  },
})

const claimsWorkflow = Builder.workflow('claims')
  .startCondition('start')
  .task(
    'intakeClaim',
    Builder.task(intakeClaimWorkItem).withActivities({
      onEnabled: async ({ workItem }) => await workItem.initialize(),
    }),
  )
  // Dynamic composite task - chooses workflow at runtime
  .dynamicCompositeTask(
    'processClaim',
    Builder.dynamicCompositeTask([
      autoClaimWorkflow,
      homeClaimWorkflow,
      healthClaimWorkflow,
    ]).withActivities({
      onEnabled: async ({ workflow, mutationCtx, parent }) => {
        // Determine claim type from domain data
        const claim = await ClaimDomain.getByWorkflowId(
          mutationCtx,
          parent.workflow.id,
        )

        // Initialize the appropriate workflow based on claim type
        switch (claim?.type) {
          case 'auto':
            await workflow.initialize.AutoClaim()
            break
          case 'home':
            await workflow.initialize.HomeClaim()
            break
          case 'health':
            await workflow.initialize.HealthClaim()
            break
          default:
            throw new Error(`Unknown claim type: ${claim?.type}`)
        }
      },
      onWorkflowStateChanged: async ({ workflow, mutationCtx, parent }) => {
        // Optional: React to child workflow state changes
        console.log(`Child workflow state: ${workflow.state}`)
      },
    }),
  )
  .task(
    'finalizeClaim',
    Builder.task(finalizeClaimWorkItem).withActivities({
      onEnabled: async ({ workItem }) => await workItem.initialize(),
    }),
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('intakeClaim'))
  .connectTask('intakeClaim', (to) => to.task('processClaim'))
  .connectTask('processClaim', (to) => to.task('finalizeClaim'))
  .connectTask('finalizeClaim', (to) => to.condition('end'))
```

## How It Works

1. `intakeClaim` collects initial claim information including the claim type
2. `processClaim` dynamic composite task is enabled
3. In `onEnabled`, we read the claim type and call the appropriate `workflow.initialize.WorkflowName()`
4. Only the selected workflow is instantiated (not all three)
5. The selected sub-workflow runs to completion
6. When the sub-workflow completes, the dynamic composite task completes
7. `finalizeClaim` processes the final claim regardless of type

## Key Differences from Static Composite Tasks

| Aspect | Static Composite | Dynamic Composite |
|--------|------------------|-------------------|
| **Workflow selection** | Fixed at definition time | Determined at runtime |
| **Definition** | `Builder.compositeTask(workflow)` | `Builder.dynamicCompositeTask([workflows])` |
| **Initialize call** | `workflow.initialize()` | `workflow.initialize.WorkflowName()` |
| **Use case** | Always run same sub-workflow | Choose based on data |

## Type-Safe Workflow Selection

The `workflow.initialize` object has type-safe methods for each workflow:

```typescript
// TypeScript knows these are the only valid options
await workflow.initialize.AutoClaim()    // ✓ Valid
await workflow.initialize.HomeClaim()    // ✓ Valid
await workflow.initialize.HealthClaim()  // ✓ Valid
await workflow.initialize.UnknownClaim() // ✗ Type error!
```

## Multiple Child Workflows

You can initialize multiple child workflows if needed:

```typescript
.withActivities({
  onEnabled: async ({ workflow, mutationCtx, parent }) => {
    const claim = await ClaimDomain.getByWorkflowId(mutationCtx, parent.workflow.id)

    // Initialize primary workflow
    if (claim?.type === 'auto') {
      await workflow.initialize.AutoClaim()
    }

    // Also initialize fraud check workflow for high-value claims
    if (claim?.amount > 10000) {
      await workflow.initialize.FraudCheck()
    }
  },
})
```

## Workflow State Change Callbacks

Monitor child workflow progress with `onWorkflowStateChanged`:

```typescript
.withActivities({
  onWorkflowStateChanged: async ({ workflow, transition, mutationCtx, parent }) => {
    if (transition.nextState === 'completed') {
      // Child workflow completed
      await ClaimDomain.logProgress(mutationCtx, parent.workflow.id, 'processing_complete')
    }
    if (transition.nextState === 'failed') {
      // Child workflow failed - maybe trigger escalation
      await ClaimDomain.escalate(mutationCtx, parent.workflow.id)
    }
  },
})
```

## Common Use Cases

- **Multi-type processing**: Different types require different workflows (claims, orders, applications)
- **Versioned workflows**: Route to different versions based on feature flags
- **Regional processing**: Different regions have different compliance requirements
- **Customer tier handling**: Premium customers get different processing workflows

## See Also

- [Nested Workflows](./nested-workflows.md) - Static composite tasks
- [XOR Split/Join](./xor-split-join.md) - Alternative: XOR routing to different tasks
- [Root Workflow ID](./root-workflow-id.md) - Accessing parent workflow data
