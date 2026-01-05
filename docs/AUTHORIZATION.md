# Authorization with Scope-Based System

> **Prerequisites**: [Workflow Basics](./WORKFLOWS_BASIC.md), [Domain Modeling](./DOMAIN_MODELING.md)
> **Related**: [Work Item Patterns](./WORK_ITEM_PATTERNS.md) | [Getting Started](./GETTING_STARTED.md)
> **Authorization Docs**: [Authorization README](../../authorization/docs/README.md) | [Roles](../../authorization/docs/ROLES.md) | [API Reference](../../authorization/docs/USAGE.md)

This guide explains how to implement scope-based authorization for Tasquencer workflows using the Authorization system.

> **⚡️ Quick Start**: Always use `authService.builders.workItemActions` for work item authorization. This provides automatic, type-safe authorization enforcement. Manual authorization checks are low-level and error-prone - only use them when absolutely necessary (e.g., in queries or custom mutations).

## Table of Contents

- [Core Concepts](#core-concepts)
- [Authorization Service and Builders](#authorization-service-and-builders)
- [Defining Scopes](#defining-scopes)
- [Setting Up Authorization](#setting-up-authorization)
- [Work Item Authorization](#work-item-authorization)
- [Querying Work Queues](#querying-work-queues)
- [Best Practices](#best-practices)
- [Low-Level Manual Authorization](#low-level-manual-authorization-not-recommended)

---

## Core Concepts

### Authorization Model: Scopes → Roles → Groups

The Authorization system uses a three-tier model:

1. **Scopes** (defined in code) - Atomic permissions
   - Example: `lead:capture:write`, `er:triage:write`
   - Defined using scope modules
   - Type-safe at compile time

2. **Roles** (stored in database) - Bundles of scopes
   - Example: `lead_sdr` role = `['lead:staff', 'lead:capture:write', 'lead:scoring:write']`
   - Created via Authorization API
   - Can be updated at runtime

3. **Groups** (stored in database) - Organizational units that grant roles
   - Example: `sdr_team`, `ae_team`, `sales_management`
   - Members get all roles assigned to the group
   - Flat structure (no hierarchy)

### Authorization Flow

```
User → Member of Groups → Groups grant Roles → Roles provide Scopes → Check Scope
```

### Work Item Authorization

Work items use:
- `requiredScope` (required) - Which scope is needed to claim
- `requiredGroupId` (optional) - Which group this work is assigned to

```typescript
offer: {
  type: 'human',
  requiredScope: 'lead:capture:write',  // Capability required
  requiredGroupId: sdrTeamId,           // Organizational filter (optional)
}
```

**To claim:** User must have the `requiredScope` (from any role) AND be in the group (if specified).

---

## Setting Up UserProvider

Before creating the authorization service, you need to configure a `UserProvider` that connects your authentication system to the authorization layer:

```typescript
// convex/authorization.ts
import { Authorization } from './tasquencer'
import { authComponent } from './auth'

const userProvider = Authorization.UserProvider.withGetUser((ctx) => {
  return authComponent.safeGetAuthUser(ctx)
}).withUserToUserId((user) => {
  return user._id
})
```

The `UserProvider` maps your auth system's user representation to user IDs that the authorization system can use for scope checks.

---

## Authorization Service and Builders

### The Central Authorization Service

The `AuthorizationService` is your central hub for all authorization in Tasquencer:

```typescript
// convex/authorization.ts
import { Authorization } from './tasquencer'
import { createSystemScopeModule } from '@repo/tasquencer'
import { erScopeModule } from './workflows/er/scopes'
import { leadManagementScopeModule } from './workflows/leadManagement/scopes'
import { authComponent } from './auth'

// Set up user provider first
const userProvider = Authorization.UserProvider.withGetUser((ctx) => {
  return authComponent.safeGetAuthUser(ctx)
}).withUserToUserId((user) => {
  return user._id
})

// System scope module (common across all apps)
const systemScopeModule = createSystemScopeModule('system')
  .withScope('admin', { description: 'Full administrative access' })
  .withScope('read', { description: 'Read-only access' })
  .withScope('write', { description: 'Write access' })

// Build the authorization service
export const authService = Authorization.Service.make(userProvider)
  .withScopeModule(systemScopeModule)
  .withScopeModule(erScopeModule)
  .withScopeModule(leadManagementScopeModule)
  // ... add all your scope modules
  .build()
```

**The service provides:**

1. **`authService.builders`** - Type-safe action builders with automatic authorization
   - `authService.builders.workItemActions` - For work item actions
   - `authService.builders.workflowActions` - For workflow actions

2. **`authService.policies`** - Reusable policy helpers
   - `authService.policies.requireScope(scope)` - Single scope check
   - `authService.policies.requireAnyScope([scopes])` - OR logic
   - `authService.policies.requireAllScopes([scopes])` - AND logic
   - `authService.policies.anyPolicy(...policies)` - Combine with OR
   - `authService.policies.allPolicies(...policies)` - Combine with AND

### Declarative Authorization Pattern

**Always use the declarative builders for work item and workflow actions:**

```typescript
import { authService } from '../../../appAuthorization'

// ✅ Define policy once
const triagePolicy = authService.policies.requireScope('er:triage:write')

// ✅ Use declarative builder - authorization automatic
const triageWorkItemActions = authService.builders.workItemActions
  .initialize(schema, triagePolicy, async (ctx, payload) => { ... })
  .start(schema, triagePolicy, async (ctx, payload) => { ... })
  .complete(schema, triagePolicy, async (ctx, payload) => { ... })
  .build()

export const triageWorkItem = Builder.workItem('triage')
  .withActions(triageWorkItemActions)
```

**Key benefits:**

- **Type safety** - Scope names are type-checked at compile time
- **Automatic enforcement** - Policy runs before your callback
- **Internal bypass** - Internal mutations automatically skip policies
- **Clean code** - Business logic separate from authorization
- **Impossible to forget** - Can't skip authorization by accident

### How Authorization Builders Work

When you use `authService.builders.workItemActions`:

1. **Policy evaluation** - Before your callback runs, the policy is evaluated
2. **Authentication check** - User must be authenticated (automatic)
3. **Authorization check** - Policy must return `ALLOW`
4. **Internal bypass** - If `isInternalMutation` is true, policy is skipped
5. **Context enrichment** - Your callback gets `authorization` context with the authenticated user

```typescript
.start(
  z.never(),
  authService.policies.requireScope('er:triage:write'),
  async ({ mutationCtx, workItem, authorization }) => {
    // ✅ Policy already enforced
    // ✅ authorization.user is guaranteed non-null
    // ✅ User guaranteed to have 'er:triage:write' scope

    await workItem.start()
  }
)
```

---

## Defining Scopes

### Step 1: Create Scope Module

Define scopes for your workflow using hierarchical namespacing:

```typescript
// convex/workflows/myWorkflow/scopes.ts
import { createScopeModule } from '@repo/tasquencer'

const reviewScopeModule = createScopeModule('review')
  .withScope('write', {
    description: 'Complete review tasks',
    tags: ['review', 'write'],
  })

const approvalScopeModule = createScopeModule('approval')
  .withScope('write', {
    description: 'Approve reviewed items',
    tags: ['approval', 'write'],
  })

export const myWorkflowScopeModule = createScopeModule('myWorkflow')
  .withScope('staff', {
    description: 'Base scope for workflow staff',
    tags: ['myWorkflow', 'staff'],
  })
  .withNestedModule(reviewScopeModule)      // myWorkflow:review:write
  .withNestedModule(approvalScopeModule)    // myWorkflow:approval:write

// Scopes created:
// - myWorkflow:staff
// - myWorkflow:review:write
// - myWorkflow:approval:write
```

### Step 2: Register Scope Module

Register your scope module in the central authorization service:

```typescript
// convex/authorization.ts
import { Authorization } from './tasquencer'
import { myWorkflowScopeModule } from './workflows/myWorkflow/scopes'

export const authService = Authorization.Service.make(userProvider)
  // ... other modules
  .withScopeModule(myWorkflowScopeModule)
  .build()
```

---

## Setting Up Authorization

### Step 1: Create Groups and Roles

Create groups and roles with scope bundles. There are two patterns available:

#### Pattern A: Individual API Calls (Recommended for clarity)

```typescript
// convex/workflows/myWorkflow/authSetup.ts
import { internalMutation } from '../../_generated/server'
import { components } from '../../_generated/api'

export const setupMyWorkflowAuthorization = internalMutation({
  handler: async (ctx) => {
    // Create groups
    const reviewTeamId = await ctx.runMutation(
      components.tasquencerAuthorization.api.createAuthGroup,
      {
        name: 'myWorkflow_review_team',
        description: 'Review Team',
      },
    )

    const approvalTeamId = await ctx.runMutation(
      components.tasquencerAuthorization.api.createAuthGroup,
      {
        name: 'myWorkflow_approval_team',
        description: 'Approval Team',
      },
    )

    // Create roles with scope bundles
    const reviewerRoleId = await ctx.runMutation(
      components.tasquencerAuthorization.api.createAuthRole,
      {
        name: 'myWorkflow_reviewer',
        description: 'Reviewer role',
        scopes: ['myWorkflow:staff', 'myWorkflow:review:write'],
      },
    )

    const approverRoleId = await ctx.runMutation(
      components.tasquencerAuthorization.api.createAuthRole,
      {
        name: 'myWorkflow_approver',
        description: 'Approver role',
        scopes: ['myWorkflow:staff', 'myWorkflow:approval:write'],
      },
    )

    // Assign roles to groups
    await ctx.runMutation(
      components.tasquencerAuthorization.api.assignAuthRoleToGroup,
      {
        groupId: reviewTeamId,
        roleId: reviewerRoleId,
      },
    )

    await ctx.runMutation(
      components.tasquencerAuthorization.api.assignAuthRoleToGroup,
      {
        groupId: approvalTeamId,
        roleId: approverRoleId,
      },
    )

    return { reviewTeamId, approvalTeamId, reviewerRoleId, approverRoleId }
  },
})
```

#### Pattern B: Batch API Calls (More efficient for bulk setup)

```typescript
// convex/workflows/myWorkflow/authSetup.ts
import { internalMutation } from '../../_generated/server'
import { components } from '../../_generated/api'

export const setupMyWorkflowAuthorization = internalMutation({
  handler: async (ctx) => {
    // Create roles in batch
    const roleIds = await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthRoles,
      {
        roles: [
          {
            name: 'myWorkflow_reviewer',
            description: 'Reviewer role',
            scopes: ['myWorkflow:staff', 'myWorkflow:review:write'],
            isActive: true,
          },
          {
            name: 'myWorkflow_approver',
            description: 'Approver role',
            scopes: ['myWorkflow:staff', 'myWorkflow:approval:write'],
            isActive: true,
          },
        ],
      },
    )

    // Create groups in batch
    const groupIds = await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthGroups,
      {
        groups: [
          {
            name: 'myWorkflow_review_team',
            description: 'Review Team',
            isActive: true,
          },
          {
            name: 'myWorkflow_approval_team',
            description: 'Approval Team',
            isActive: true,
          },
        ],
      },
    )

    // Assign roles to groups in batch
    await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthGroupRoleAssignments,
      {
        assignments: [
          { groupId: groupIds[0], roleId: roleIds[0], assignedAt: Date.now() },
          { groupId: groupIds[1], roleId: roleIds[1], assignedAt: Date.now() },
        ],
      },
    )

    return {
      reviewTeamId: groupIds[0],
      approvalTeamId: groupIds[1],
      reviewerRoleId: roleIds[0],
      approverRoleId: roleIds[1],
    }
  },
})
```

### Step 2: Add Users to Groups

```typescript
// Add user to review team
await ctx.runMutation(
  components.tasquencerAuthorization.api.addUserToAuthGroup,
  {
    userId: aliceId,
    groupId: reviewTeamId,
  },
)

// Alice now has: myWorkflow:staff, myWorkflow:review:write scopes
```

---

## Work Item Authorization

### ✅ Recommended: Declarative Authorization with Policy Builders

**Always use `authService.builders.workItemActions` for safe, type-checked authorization:**

```typescript
import { authService } from '../../../appAuthorization'
import { initializeMyWorkflowWorkItemAuth } from './helpersAuth'

// Define policy once (type-safe scope names)
const reviewWritePolicy = authService.policies.requireScope('myWorkflow:review:write')

// Use declarative builders - authorization is AUTOMATICALLY enforced
const reviewWorkItemActions = authService.builders.workItemActions
  .initialize(
    z.object({ itemId: zid('items') }),
    reviewWritePolicy,  // 👈 Policy parameter
    async ({ mutationCtx, workItem, authorization }, payload) => {
      // ✅ User is GUARANTEED to be authenticated
      // ✅ User is GUARANTEED to have 'myWorkflow:review:write' scope
      // ✅ authorization.user is available (non-null)

      const workItemId = await workItem.initialize()

      await initializeMyWorkflowWorkItemAuth(mutationCtx, workItemId, {
        scope: 'myWorkflow:review:write',
        groupId: reviewTeamId,
        itemId: payload.itemId,
        payload: { type: 'review', priority: 'high' },
      })
    },
  )
  .start(
    z.never(),
    reviewWritePolicy,
    async ({ mutationCtx, workItem }) => {
      // Already authorized - just claim and start
      await startAndClaimWorkItem(mutationCtx, workItem)
    },
  )
  .complete(
    z.object({ result: z.string() }),
    reviewWritePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      // Already authorized - safe to complete
      await workItem.complete()
    },
  )
  .build()

// Attach to work item
export const reviewWorkItem = Builder.workItem('review')
  .withActions(reviewWorkItemActions)
```

**Why use declarative builders?**

- ✅ **Type-safe** - TypeScript errors on invalid scope names
- ✅ **Automatic enforcement** - Policy runs before your callback
- ✅ **Impossible to forget** - Can't accidentally skip authorization
- ✅ **Clean separation** - Policy is separate from business logic
- ✅ **Internal bypass** - Internal mutations automatically skip policies
- ✅ **Better errors** - Clear authorization failures
- ✅ **Less boilerplate** - No manual auth checks needed

### Helper Pattern: Authorization Initialize Function

Create a helper for consistent work item initialization:

```typescript
// convex/workflows/myWorkflow/workItems/helpersAuth.ts
import type { MutationCtx } from '../../../_generated/server'
import type { Id, Doc } from '../../../_generated/dataModel'

export async function initializeMyWorkflowWorkItemAuth(
  mutationCtx: MutationCtx,
  workItemId: Id<'tasquencerWorkItems'>,
  config: {
    scope: string
    groupId?: Id<'authGroups'>
    itemId: Id<'items'>
    payload: Doc<'myWorkflowWorkItems'>['payload']
  },
): Promise<Id<'myWorkflowWorkItems'>> {
  return await mutationCtx.db.insert('myWorkflowWorkItems', {
    workItemId,
    workflowName: 'myWorkflow',
    offer: {
      type: 'human',
      requiredScope: config.scope,
      ...(config.groupId !== undefined && { requiredGroupId: config.groupId }),
    },
    aggregateTableId: config.itemId,
    payload: config.payload,
  })
}
```

**Usage:**

```typescript
// In your work item action
.initialize(
  z.object({ itemId: zid('items') }),
  reviewWritePolicy,  // Policy
  async ({ mutationCtx, workItem }, payload) => {
    const workItemId = await workItem.initialize()

    await initializeMyWorkflowWorkItemAuth(mutationCtx, workItemId, {
      scope: 'myWorkflow:review:write',
      groupId: reviewTeamId,
      itemId: payload.itemId,
      payload: { type: 'review', priority: 'high' },
    })
  },
)
```

### Complex Policies with Policy Helpers

Compose policies for complex authorization requirements:

```typescript
import { authService } from '../../../appAuthorization'

// Policy: User must have admin scope OR (review scope AND be in review team)
const complexPolicy = authService.policies.anyPolicy(
  authService.policies.requireScope('system:admin'),
  authService.policies.allPolicies(
    authService.policies.requireScope('myWorkflow:review:write'),
    // Custom policy for group check
    async ({ mutationCtx, authorization }) => {
      const userGroups = await getUserGroups(
        mutationCtx,
        authorization.user.userId as Id<'users'>
      )
      return userGroups.includes(reviewTeamId)
        ? PolicyResult.ALLOW
        : PolicyResult.DENY
    }
  )
)

// Use in action
const workItemActions = authService.builders.workItemActions
  .start(
    z.never(),
    complexPolicy,  // Complex policy enforced automatically
    async ({ workItem }) => {
      await workItem.start()
    }
  )
```

**Available policy helpers:**

```typescript
// Single scope
authService.policies.requireScope('myWorkflow:review:write')

// Any of multiple scopes (OR)
authService.policies.requireAnyScope(['scope1', 'scope2'])

// All of multiple scopes (AND)
authService.policies.requireAllScopes(['scope1', 'scope2'])

// Combine policies with OR
authService.policies.anyPolicy(policy1, policy2)

// Combine policies with AND
authService.policies.allPolicies(policy1, policy2)
```

---

## ⚠️ Low-Level: Manual Authorization (Not Recommended)

**Only use manual authorization when you cannot use declarative builders** (e.g., in non-action contexts like queries or custom mutations).

### Manual Pattern: Requires Extra Care

When you can't use builders, you must manually implement all authorization checks:

```typescript
import { userHasScope } from '../../../authorization'
import { authComponent } from '../../../auth'

// ⚠️ NOT RECOMMENDED - use authService.builders instead
const reviewWorkItem = Builder.workItem('review').withActions(
  Builder.workItemActions()
    .start(
      z.never(),
      async ({ mutationCtx, workItem }) => {
        // ⚠️ EASY TO FORGET - must manually check auth
        const authUser = await authComponent.safeGetAuthUser(mutationCtx)
        if (!authUser) {
          throw new Error('User not authenticated')
        }

        const userId = authUser.userId as Id<'users'>

        // ⚠️ EASY TO FORGET - must manually check scope
        const hasScope = await userHasScope(
          mutationCtx,
          userId,
          'myWorkflow:review:write',
        )

        if (!hasScope) {
          throw new Error('Unauthorized: missing myWorkflow:review:write scope')
        }

        // ⚠️ NO TYPE SAFETY - scope string is not checked
        // ⚠️ NO INTERNAL BYPASS - must manually handle internal mutations

        // Finally do the work
        await MyWorkflowWorkItemHelpers.claimWorkItem(
          mutationCtx.db,
          workItem.id,
          userId,
        )
        await workItem.start()
      },
    )
)
```

**Problems with manual authorization:**

- ❌ Easy to forget authorization checks
- ❌ No compile-time type safety on scope names
- ❌ Must manually handle internal mutations
- ❌ Repetitive boilerplate in every action
- ❌ Business logic mixed with authorization logic
- ❌ Inconsistent error messages

**When manual authorization is acceptable:**

- In **queries** (cannot use builders)
- In **custom mutations** outside work items
- In **utility functions** that need auth checks
- When you need **very custom authorization logic** that can't be expressed as a policy

---

## Querying Work Queues

### Pattern: User-Specific Work Queue

Show only work items the user can claim:

```typescript
import { getUserScopes, getUserAuthGroups } from '@repo/tasquencer/components/authorization/helpers'
import { authComponent } from '../../../auth'
import { components } from '../../../_generated/api'

export const myWorkQueue = query({
  handler: async (ctx) => {
    const authUser = await authComponent.safeGetAuthUser(ctx)
    if (!authUser) return []

    const userId = authUser.userId as Id<'users'>

    // Get user's scopes and groups using the component API
    const userScopes = await getUserScopes(
      ctx,
      components.tasquencerAuthorization,
      userId,
    )
    const userGroups = await getUserAuthGroups(
      ctx,
      components.tasquencerAuthorization,
      userId,
    )
    const userGroupIds = userGroups.map((g) => g._id)

    // Get all unclaimed work items
    const allWorkItems = await ctx.db
      .query('myWorkflowWorkItems')
      .collect()

    // Filter by user's scopes and groups
    return allWorkItems.filter((item) => {
      // Skip claimed items
      if (item.claim) return false

      // Check scope
      if (item.offer?.requiredScope) {
        if (!userScopes.includes(item.offer.requiredScope)) {
          return false
        }
      }

      // Check group if specified
      if (item.offer?.requiredGroupId) {
        if (!userGroupIds.includes(item.offer.requiredGroupId)) {
          return false
        }
      }

      return true
    })
  },
})
```

### Pattern: Team Work Queue

Show all work for a specific team:

```typescript
export const teamWorkQueue = query({
  handler: async (ctx, { groupId }: { groupId: Id<'authGroups'> }) => {
    const workItems = await ctx.db
      .query('myWorkflowWorkItems')
      .collect()

    return workItems.filter((item) => {
      return item.offer?.requiredGroupId === groupId && !item.claim
    })
  },
})
```

### Pattern: My Claimed Work

Show work items claimed by the current user:

```typescript
export const myClaimedWork = query({
  handler: async (ctx) => {
    const authUser = await authComponent.safeGetAuthUser(ctx)
    if (!authUser) return []

    const userId = authUser.userId as Id<'users'>

    const workItems = await ctx.db
      .query('myWorkflowWorkItems')
      .collect()

    return workItems.filter((item) => {
      return item.claim?.type === 'human' && item.claim.userId === userId
    })
  },
})
```

---

## Best Practices

### ✅ DO

**1. ALWAYS use declarative authorization builders**

```typescript
✅ authService.builders.workItemActions
     .start(z.never(), policy, async ({ workItem }) => { ... })

❌ Builder.workItemActions()
     .start(z.never(), async ({ mutationCtx, workItem }) => {
       await requireScope(...)(mutationCtx)  // Manual, error-prone
     })
```

**2. Define policies once, reuse everywhere**

```typescript
✅ const triagePolicy = authService.policies.requireScope('er:triage:write')
   // Use triagePolicy in .initialize(), .start(), .complete(), etc.

❌ Inline policy logic in every action
```

**3. Use descriptive scope names with hierarchy**

```typescript
✅ 'er:triage:write', 'er:diagnostics:read', 'lead:capture:write'
❌ 'action1', 'perm2', 'reviewScope'
```

**4. Use groups for organizational filtering**

```typescript
✅ requiredScope: 'lead:capture:write', requiredGroupId: sdrTeamId
   // Scope = capability, Group = organizational assignment
```

**5. Initialize work item metadata in .initialize()**

```typescript
✅ Always create metadata when work item is initialized
❌ Don't skip metadata creation
```

**6. Use helper functions for consistent work item setup**

```typescript
✅ await initializeMyWorkflowWorkItemAuth(mutationCtx, workItemId, {
     scope: 'myWorkflow:review:write',
     groupId: reviewTeamId,
     ...
   })
```

**7. Compose policies for complex authorization**

```typescript
✅ authService.policies.anyPolicy(
     authService.policies.requireScope('system:admin'),
     authService.policies.requireScope('er:triage:write')
   )
```

**8. Filter work queues by user scopes**

```typescript
✅ const userScopes = await getUserScopes(ctx, userId)
✅ workItems.filter(item => userScopes.includes(item.offer.requiredScope))
```

### ❌ DON'T

**1. Don't use manual authorization in work item actions**

```typescript
❌ Builder.workItemActions()
     .start(z.never(), async ({ mutationCtx, workItem }) => {
       const user = await authComponent.safeGetAuthUser(mutationCtx)
       if (!user) throw new Error(...)
       const hasScope = await userHasScope(...)
       if (!hasScope) throw new Error(...)
       // Easy to forget, not type-safe, verbose
     })

✅ authService.builders.workItemActions
     .start(z.never(), policy, async ({ workItem }) => {
       // Already authorized!
     })
```

**2. Don't check roles, check scopes**

```typescript
❌ const userRoles = await getUserRoles(ctx, userId)
    if (userRoles.includes('reviewer')) { ... }

✅ const hasScope = await userHasScope(ctx, userId, 'myWorkflow:review:write')
✅ Better: Use authService.builders with policies
```

**3. Don't hardcode group IDs**

```typescript
❌ requiredGroupId: 'j57abc123' as Id<'authGroups'>

✅ Store group IDs in workflow constants or configuration
✅ Look up groups by name in setup functions
```

**4. Don't forget group filtering in queries**

```typescript
❌ Only checking scope, forgetting to check requiredGroupId

✅ Check both scope and group membership when filtering work queues
```

**5. Don't create metadata after initialize**

```typescript
❌ Create metadata in .start() or .complete()

✅ Create metadata in .initialize() action
```

**6. Don't use deprecated patterns**

```typescript
❌ assignedRoleId, assignedGroupId (old RBAC system)
❌ UserGroupDomain, RoleDomain (removed)
❌ canClaimWorkAssignedTo (old authorization model)

✅ requiredScope, requiredGroupId (Authorization system)
✅ authService.builders (declarative authorization)
✅ authService.policies (policy composition)
✅ Scope bundles in roles (Authorization)
```

---

## Complete Example: Lead Management Workflow

### 1. Define Scopes

```typescript
// convex/workflows/leadManagement/scopes.ts
import { createScopeModule } from '@repo/tasquencer'

const captureScopeModule = createScopeModule('capture')
  .withScope('write', { description: 'Capture lead data' })

const scoringScopeModule = createScopeModule('scoring')
  .withScope('write', { description: 'Score leads' })

export const leadManagementScopeModule = createScopeModule('lead')
  .withScope('staff', { description: 'Base scope' })
  .withNestedModule(captureScopeModule)   // lead:capture:write
  .withNestedModule(scoringScopeModule)   // lead:scoring:write
```

### 2. Setup Authorization

```typescript
// convex/workflows/leadManagement/authSetup.ts
import { internalMutation } from '../../_generated/server'
import { components } from '../../_generated/api'

export const setupLeadAuthorization = internalMutation({
  handler: async (ctx) => {
    const sdrTeamId = await ctx.runMutation(
      components.tasquencerAuthorization.api.createAuthGroup,
      { name: 'lead_sdr_team', description: 'SDR Team' },
    )

    const sdrRoleId = await ctx.runMutation(
      components.tasquencerAuthorization.api.createAuthRole,
      {
        name: 'lead_sdr',
        description: 'SDR role',
        scopes: ['lead:staff', 'lead:capture:write', 'lead:scoring:write'],
      },
    )

    await ctx.runMutation(
      components.tasquencerAuthorization.api.assignAuthRoleToGroup,
      {
        groupId: sdrTeamId,
        roleId: sdrRoleId,
      },
    )

    return { sdrTeamId, sdrRoleId }
  },
})
```

### 3. Define Work Item with Declarative Authorization

```typescript
// convex/workflows/leadManagement/workItems/captureData.workItem.ts
import { authService } from '../../../authorization'
import { initializeLeadWorkItemAuth } from './helpersAuth'
import { startAndClaimWorkItem } from './helpers'

// Define policy once - type-safe scope name
const captureWritePolicy = authService.policies.requireScope('lead:capture:write')

// Use declarative builders - authorization enforced automatically
const captureDataWorkItemActions = authService.builders.workItemActions
  .initialize(
    z.object({ leadId: zid('leadManagementLeads') }),
    captureWritePolicy,
    async ({ mutationCtx, workItem, authorization }, payload) => {
      // User is guaranteed authenticated and authorized
      const workItemId = await workItem.initialize()

      await initializeLeadWorkItemAuth(mutationCtx, workItemId, {
        scope: 'lead:capture:write',
        groupId: sdrTeamId,
        leadId: payload.leadId,
        payload: { type: 'captureData', priority: 'high' },
      })
    },
  )
  .start(
    z.never(),
    captureWritePolicy,
    async ({ mutationCtx, workItem }) => {
      // Already authorized - just claim and start
      await startAndClaimWorkItem(mutationCtx, workItem)
    },
  )
  .complete(
    z.object({ companyName: z.string(), contactEmail: z.string() }),
    captureWritePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      // Already authorized - update lead and complete
      const lead = await getLeadByWorkflowId(mutationCtx, workItem.workflowId)
      await mutationCtx.db.patch(lead._id, {
        companyName: payload.companyName,
        contactEmail: payload.contactEmail,
        status: 'data_captured',
      })

      await workItem.complete()
    },
  )
  .build()

// Attach to work item
export const captureDataWorkItem = Builder.workItem('captureData')
  .withActions(captureDataWorkItemActions)
```

**Notice how much cleaner this is:**
- ✅ Policy defined once, reused 3 times
- ✅ No manual auth checks in callbacks
- ✅ Type-safe scope names
- ✅ Focused business logic

### 4. Query Work Queue

```typescript
// convex/workflows/leadManagement/queries.ts
import { getUserScopes, getUserAuthGroups } from '@repo/tasquencer/components/authorization/helpers'
import { authComponent } from '../../../auth'
import { components } from '../../../_generated/api'

export const leadWorkQueue = query({
  handler: async (ctx) => {
    const authUser = await authComponent.safeGetAuthUser(ctx)
    if (!authUser) return []

    const userId = authUser.userId as Id<'users'>
    const userScopes = await getUserScopes(
      ctx,
      components.tasquencerAuthorization,
      userId,
    )
    const userGroups = await getUserAuthGroups(
      ctx,
      components.tasquencerAuthorization,
      userId,
    )
    const userGroupIds = userGroups.map((g) => g._id)

    const workItems = await ctx.db
      .query('leadManagementWorkItems')
      .collect()

    return workItems.filter((item) => {
      if (item.claim) return false

      if (item.offer?.requiredScope) {
        if (!userScopes.includes(item.offer.requiredScope)) return false
      }

      if (item.offer?.requiredGroupId) {
        if (!userGroupIds.includes(item.offer.requiredGroupId)) return false
      }

      return true
    })
  },
})
```

---

## Related Documentation

### Authorization System
- [Authorization README](../../authorization/docs/README.md) - Core concepts
- [Roles](../../authorization/docs/ROLES.md) - Roles as scope bundles
- [API Reference](../../authorization/docs/USAGE.md) - Complete API
- [Advanced Patterns](../../authorization/docs/ADVANCED_USAGE.md) - Complex use cases

### Tasquencer
- [Workflow Basics](./WORKFLOWS_BASIC.md) - Work items and tasks
- [Work Item Patterns](./WORK_ITEM_PATTERNS.md) - Common patterns
- [Domain Modeling](./DOMAIN_MODELING.md) - Domain functions
- [Getting Started](./GETTING_STARTED.md) - Quick start guide
