# UcampaignUapproval Example

A simple workflow example demonstrating Tasquencer with Convex, Better Auth, and React. This example shows how to build a human-in-the-loop workflow where users can claim and complete tasks through a work queue.

## Tech Stack

- **Backend**: Convex (serverless database & functions)
- **Workflow Engine**: Tasquencer
- **Authentication**: Better Auth with Convex integration
- **Frontend**: React + TanStack Router + TanStack Query
- **UI**: Radix UI + Tailwind CSS

## Workflow Architecture

The campaignApproval workflow is a minimal example that demonstrates the core Tasquencer patterns:

```
[start] → [storeUcampaignUapproval] → [end]
```

### Directory Structure

```
convex/workflows/campaign_approval/
├── definition.ts          # Version manager setup
├── workflows/
│   └── campaignApproval.workflow.ts   # Workflow definition
├── workItems/
│   ├── storeUcampaignUapproval.workItem.ts  # Human task implementation
│   └── authHelpers.ts     # Work item auth initialization
├── api.ts                 # Public API endpoints
├── schema.ts              # Database tables
├── scopes.ts              # Authorization scopes
├── db.ts                  # Database helpers
├── helpers.ts             # Work item metadata helpers
└── authSetup.ts           # Role & group setup
```

### Workflow Definition

**[campaignApproval.workflow.ts](convex/workflows/campaign_approval/workflows/campaignApproval.workflow.ts)**

The workflow initializes by creating a campaignApproval record with an empty message:

```typescript
const campaignApprovalWorkflowActions = Builder.workflowActions().initialize(
  z.any(),
  async ({ mutationCtx, workflow }) => {
    const workflowId = await workflow.initialize()

    // Create campaignApproval aggregate root with empty message
    await insertUcampaignUapproval(mutationCtx.db, {
      workflowId,
      message: '',
      createdAt: Date.now(),
    })
  },
)

export const campaignApprovalWorkflow = Builder.workflow('campaign_approval')
  .withActions(campaignApprovalWorkflowActions)
  .startCondition('start')
  .task('storeUcampaignUapproval', storeUcampaignUapprovalTask)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('storeUcampaignUapproval'))
  .connectTask('storeUcampaignUapproval', (to) => to.condition('end'))
```

### Work Item (Human Task)

**[storeUcampaignUapproval.workItem.ts](convex/workflows/campaign_approval/workItems/storeUcampaignUapproval.workItem.ts)**

The `storeUcampaignUapproval` work item is a human task with claim-based assignment:

1. **Start Action**: Claims the work item for the authenticated user
2. **Complete Action**: Validates the user claimed the item, then updates the campaignApproval message

```typescript
const storeUcampaignUapprovalActions = authService.builders.workItemActions
  .start(z.never(), storeWritePolicy, async ({ mutationCtx, workItem }) => {
    // Automatically claims work item for current user
    await UcampaignUapprovalWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({ message: z.string().min(1) }),
    storeWritePolicy,
    async ({ mutationCtx, workItem, parent }, payload) => {
      // Verify user claimed this item before completing
      // Update campaignApproval message in database
    },
  )
```

### Authorization Scopes

**[scopes.ts](convex/workflows/campaign_approval/scopes.ts)**

Two scopes control access to the campaignApproval workflow:

- `campaignApproval:staff` - Base scope for viewing campaignApprovals and work queue
- `campaignApproval:write` - Permission to claim and complete campaignApproval tasks

### API Endpoints

**[api.ts](convex/workflows/campaign_approval/api.ts)**

| Endpoint | Type | Description |
|----------|------|-------------|
| `initializeRootWorkflow` | Mutation | Start a new campaignApproval workflow |
| `startWorkItem` | Mutation | Claim and start a work item |
| `completeWorkItem` | Mutation | Complete work item with message |
| `getUcampaignUapprovals` | Query | List all campaignApprovals |
| `getUcampaignUapprovalWorkQueue` | Query | Get available work items for user |
| `claimUcampaignUapprovalWorkItem` | Mutation | Claim a work item |

## UI Integration

The frontend uses TanStack Router with file-based routing and TanStack Query for data fetching.

### Pages

| Route | Description |
|-------|-------------|
| `/simple` | List all campaignApprovals with stats |
| `/simple/new` | Create new campaignApproval workflow |
| `/simple/queue` | Work queue with claimable tasks |
| `/simple/tasks/store/$workItemId` | Claim & complete a campaignApproval task |

### Data Flow Pattern

```
User Action (Click)
    ↓
useMutation + useConvexMutation
    ↓
Convex API (api.workflows.campaignApproval.api.*)
    ↓
Tasquencer Workflow Engine
    ↓
Database Update
    ↓
Real-time Subscription (convexQuery)
    ↓
useSuspenseQuery Re-render
```

### Example: Creating a Workflow

```typescript
const initializeMutation = useMutation({
  mutationFn: useConvexMutation(api.workflows.campaignApproval.api.initializeRootWorkflow),
  onSuccess: () => navigate({ to: '/simple/queue' }),
})

// Trigger workflow creation
initializeMutation.mutate({ payload: {} })
```

### Example: Completing a Task

```typescript
const completeMutation = useMutation({
  mutationFn: useConvexMutation(api.workflows.campaignApproval.api.completeWorkItem),
})

// Complete with message payload
completeMutation.mutate({
  workItemId,
  args: {
    name: 'storeUcampaignUapproval',
    payload: { message: 'Hello, World!' },
  },
})
```

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Convex Development Server

```bash
npx convex dev
```

This will:
- Create a new Convex project (if first time)
- Generate `.env.local` with your deployment URLs
- Start the Convex dev server

### 3. Configure Better Auth

Set up the required environment variables. See the [Better Auth + TanStack Start guide](https://labs.convex.dev/better-auth/framework-guides/tanstack-start#set-environment-variables) for details.

Your `.env.local` should contain:

```bash
CONVEX_DEPLOYMENT=dev:your-project-name
VITE_CONVEX_URL=https://your-project-name.convex.cloud
VITE_CONVEX_SITE_URL=https://your-project-name.convex.site
SITE_URL=http://localhost:3000
```

### 4. Start the App & Register a User

```bash
pnpm dev
```

Open `http://localhost:3000` and register a new user account.

### 5. Run Setup Mutations

After registering your first user, run these Convex mutations from the CLI:

```bash
# Create superadmin role and assign to your user
npx convex run scaffold:scaffoldSuperadmin

# Create campaignApproval workflow roles and groups
npx convex run workflows:campaignApproval:authSetup
```

See the [Convex CLI documentation](https://docs.convex.dev/cli#run-convex-functions) for more details on running functions.

### 6. Assign User to UcampaignUapproval Team

After running the setup mutations, assign your user to the `campaignApproval_team` group through the Admin UI at `/admin/groups` to grant access to the campaignApproval workflow.

## Usage

1. Navigate to **Simple UcampaignUapproval > New UcampaignUapproval** to create a workflow
2. Go to **Work Queue** to see pending tasks
3. Click **Claim & Start** on a work item
4. Enter a campaignApproval message and click **Complete Task**
5. View completed campaignApprovals in **All UcampaignUapprovals**

## Admin Features

- `/admin/users` - User management
- `/admin/groups` - Group management and membership
- `/admin/roles` - Role definitions and scope assignments
- `/audit` - Workflow execution traces
