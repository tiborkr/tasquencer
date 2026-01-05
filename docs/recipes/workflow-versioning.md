# Recipe: Workflow Versioning and Migration

> **Prerequisites**: [Advanced Workflows](../WORKFLOWS_ADVANCED.md)
> **Related**: [Nested Workflows](./nested-workflows.md) | [Dynamic Composite Tasks](./dynamic-composite-tasks.md)

This recipe demonstrates how to version workflows and migrate in-flight workflow instances from one version to another. This is essential for production systems where you need to evolve workflow definitions without losing running workflows.

**Problem**: You have a deployment pipeline workflow in production. You need to add a new security scan step, but hundreds of deployments are currently in progress. You can't just update the workflow definition - you need to migrate running instances.

```typescript
import { versionManagerFor } from '../tasquencer/versionManager'
import { migrate, MigrationMode } from '../tasquencer/versionManager/migration'

// ============================================
// VERSION 1: Original deployment workflow
// ============================================
const buildWorkItem = Builder.workItem('build').withActivities({
  onInitialized: async ({ workItem }) => await workItem.start(),
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    await BuildDomain.runBuild(mutationCtx, parent.workflow.id)
    await workItem.complete()
  },
})

const deployWorkItem = Builder.workItem('deploy').withActivities({
  onInitialized: async ({ workItem }) => await workItem.start(),
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    await DeployDomain.deploy(mutationCtx, parent.workflow.id)
    await workItem.complete()
  },
})

const deploymentWorkflowV1 = Builder.workflow('deployment')
  .startCondition('start')
  .task(
    'build',
    Builder.task(buildWorkItem).withActivities({
      onEnabled: async ({ workItem }) => await workItem.initialize(),
    }),
  )
  .task(
    'deploy',
    Builder.task(deployWorkItem).withActivities({
      onEnabled: async ({ workItem }) => await workItem.initialize(),
    }),
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('build'))
  .connectTask('build', (to) => to.task('deploy'))
  .connectTask('deploy', (to) => to.condition('end'))

// ============================================
// VERSION 2: Added security scan step
// ============================================
const securityScanWorkItem = Builder.workItem('securityScan').withActivities({
  onInitialized: async ({ workItem }) => await workItem.start(),
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    const passed = await SecurityDomain.runScan(mutationCtx, parent.workflow.id)
    if (passed) {
      await workItem.complete()
    } else {
      await workItem.fail()
    }
  },
})

const deploymentWorkflowV2 = Builder.workflow('deployment')
  .startCondition('start')
  .task(
    'build',
    Builder.task(buildWorkItem).withActivities({
      onEnabled: async ({ workItem }) => await workItem.initialize(),
    }),
  )
  .task(
    'securityScan', // <-- New task in v2
    Builder.task(securityScanWorkItem).withActivities({
      onEnabled: async ({ workItem }) => await workItem.initialize(),
    }),
  )
  .task(
    'deploy',
    Builder.task(deployWorkItem).withActivities({
      onEnabled: async ({ workItem }) => await workItem.initialize(),
    }),
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('build'))
  .connectTask('build', (to) => to.task('securityScan'))
  .connectTask('securityScan', (to) => to.task('deploy'))
  .connectTask('deploy', (to) => to.condition('end'))

// ============================================
// MIGRATION: V1 → V2
// ============================================
const migrationV1ToV2 = migrate(deploymentWorkflowV1, deploymentWorkflowV2)
  .withInitializer(async ({ workflow, migratingFromWorkflow, mutationCtx }) => {
    // Called when migration starts
    // Copy any domain data from old workflow to new workflow
    await DeploymentDomain.copyData(
      mutationCtx,
      migratingFromWorkflow.id,
      workflow.id,
    )
    console.log(`Starting migration from ${migratingFromWorkflow.id} to ${workflow.id}`)
  })
  .withFinalizer(async ({ workflow, migratingFromWorkflow, result, mutationCtx }) => {
    // Called when migrated workflow completes/fails/cancels
    console.log(`Migration complete: ${result.state}`)
    await DeploymentDomain.cleanupOldWorkflow(mutationCtx, migratingFromWorkflow.id)
  })
  .withTaskMigrators({
    // For each task, decide: fastForward (skip) or continue (execute)
    'deployment/build': async ({ task, mutationCtx, migratingFromWorkflow }) => {
      // Check if build was already completed in v1
      const buildTask = await getTaskState(mutationCtx, migratingFromWorkflow.id, 'build')
      if (buildTask?.state === 'completed') {
        return MigrationMode.fastForward // Skip - already done
      }
      return MigrationMode.continue // Execute normally
    },
    'deployment/securityScan': async ({ workItem }) => {
      // New task in v2 - always execute
      // But if build was already done, we need to run the scan
      return MigrationMode.continue
    },
    'deployment/deploy': async ({ task, mutationCtx, migratingFromWorkflow }) => {
      const deployTask = await getTaskState(mutationCtx, migratingFromWorkflow.id, 'deploy')
      if (deployTask?.state === 'completed') {
        return MigrationMode.fastForward
      }
      return MigrationMode.continue
    },
  })
  .build()

// ============================================
// VERSION MANAGER
// ============================================
export const deploymentVersionManager = versionManagerFor('deployment')
  .registerVersion('v1', deploymentWorkflowV1)
  .registerVersion('v2', deploymentWorkflowV2)
  .withMigration('v1->v2', migrationV1ToV2)
  .build()

// Register the version manager
versionManagerRegistry.registerVersionManager(deploymentVersionManager)
```

## How Migration Works

1. **Trigger migration**: Call the `migrate` action with workflow ID and target version
2. **Create new workflow**: A new v2 workflow instance is created
3. **Run initializer**: `withInitializer` callback copies data to new workflow
4. **Fast-forward tasks**: For each task, call its migrator to decide:
   - `MigrationMode.fastForward`: Mark as completed without executing
   - `MigrationMode.continue`: Execute normally when reached
5. **Cancel old workflow**: The v1 workflow is marked as canceled
6. **Continue execution**: The new v2 workflow continues from where v1 left off
7. **Run finalizer**: When v2 completes/fails/cancels, `withFinalizer` is called

## Migration Modes

| Mode | Effect |
|------|--------|
| `MigrationMode.fastForward` | Skip this task (mark completed immediately) |
| `MigrationMode.continue` | Execute this task normally when enabled |

## Triggering Migration

```typescript
// In your Convex action or scheduled job
export const migrateDeployment = action({
  args: {
    workflowId: v.id('tasquencerWorkflows'),
    targetVersion: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal.tasquencer.migrate, {
      workflowId: args.workflowId,
      nextVersionName: args.targetVersion,
    })
  },
})

// Usage: Migrate a specific workflow
await migrateDeployment({ workflowId: 'abc123', targetVersion: 'v2' })

// Usage: Migrate all v1 workflows
const v1Workflows = await ctx.db
  .query('tasquencerWorkflows')
  .filter((q) =>
    q.and(
      q.eq(q.field('name'), 'deployment'),
      q.eq(q.field('versionName'), 'v1'),
      q.eq(q.field('state'), 'started'),
    ),
  )
  .collect()

for (const workflow of v1Workflows) {
  await migrateDeployment({ workflowId: workflow._id, targetVersion: 'v2' })
}
```

## Multi-Version Migration Chains

You can define migrations between multiple versions:

```typescript
const versionManager = versionManagerFor('deployment')
  .registerVersion('v1', deploymentWorkflowV1)
  .registerVersion('v2', deploymentWorkflowV2)
  .registerVersion('v3', deploymentWorkflowV3)
  .withMigration('v1->v2', migrationV1ToV2)
  .withMigration('v2->v3', migrationV2ToV3)
  .build()
```

When migrating from v1 to v3, the system will chain migrations: v1 → v2 → v3.

## Task Migrator Context

Task migrators receive rich context:

```typescript
.withTaskMigrators({
  'workflow/task': async (ctx) => {
    // ctx.mutationCtx - Convex mutation context
    // ctx.migratingFromWorkflow.id - Old workflow ID
    // ctx.migratingFromWorkflow.name - Workflow name
    // ctx.parent.workflow.id - New workflow ID
    // ctx.task.name - Task name
    // ctx.task.generation - Task generation
    // ctx.workItem.initialize() - Initialize work items if needed
    // ctx.registerScheduled() - Register scheduled functions
    // ctx.audit - Audit context

    return MigrationMode.continue
  },
})
```

## Best Practices

### 1. Always Copy Domain Data

```typescript
.withInitializer(async ({ workflow, migratingFromWorkflow, mutationCtx }) => {
  // Copy all domain data to new workflow
  await copyAllDomainData(mutationCtx, migratingFromWorkflow.id, workflow.id)
})
```

### 2. Check Actual Task State

```typescript
'workflow/task': async ({ mutationCtx, migratingFromWorkflow }) => {
  const task = await getTaskFromOldWorkflow(mutationCtx, migratingFromWorkflow.id, 'task')

  // Only fast-forward if actually completed
  if (task?.state === 'completed') {
    return MigrationMode.fastForward
  }
  return MigrationMode.continue
}
```

### 3. Handle New Tasks

```typescript
'workflow/newTask': async () => {
  // New tasks in target version should continue (execute normally)
  return MigrationMode.continue
}
```

### 4. Clean Up After Migration

```typescript
.withFinalizer(async ({ migratingFromWorkflow, mutationCtx }) => {
  // Clean up old workflow data
  await cleanupOldWorkflowData(mutationCtx, migratingFromWorkflow.id)
})
```

## Visual Migration Flow

```
V1 Workflow (source)           V2 Workflow (target)
────────────────────           ────────────────────

[build] completed ─────────────► [build] fast-forwarded (completed)
                                        │
                                        ▼
                               [securityScan] continue (executes)
                                        │
                                        ▼
[deploy] enabled ──────────────► [deploy] continue (waits for scan)
```

## See Also

- [Nested Workflows](./nested-workflows.md) - Composite task migration
- [Dynamic Composite Tasks](./dynamic-composite-tasks.md) - Dynamic composite migration
- [Looping Patterns](./looping-patterns.md) - Task generation in migrations
