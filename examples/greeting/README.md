# Greeting Example

A simple workflow example demonstrating Tasquencer with Convex, Better Auth, and React. This example shows how to build a human-in-the-loop workflow where users can claim and complete tasks through a work queue.

## Tech Stack

- **Backend**: Convex (serverless database & functions)
- **Workflow Engine**: Tasquencer
- **Authentication**: Better Auth with Convex integration
- **Frontend**: React + TanStack Router + TanStack Query
- **UI**: Radix UI + Tailwind CSS

## Workflow Architecture

The greeting workflow is a minimal example that demonstrates the core Tasquencer patterns:

```
[start] → [storeGreeting] → [end]
```

### Directory Structure

```
convex/workflows/greeting/
├── definition.ts          # Version manager setup
├── workflows/
│   └── greeting.workflow.ts   # Workflow definition
├── workItems/
│   ├── storeGreeting.workItem.ts  # Human task implementation
│   └── authHelpers.ts     # Work item auth initialization
├── api.ts                 # Public API endpoints
├── schema.ts              # Database tables
├── scopes.ts              # Authorization scopes
├── db.ts                  # Database helpers
├── helpers.ts             # Work item metadata helpers
└── authSetup.ts           # Role & group setup
```

### Workflow Definition

**[greeting.workflow.ts](convex/workflows/greeting/workflows/greeting.workflow.ts)**

The workflow initializes by creating a greeting record with an empty message:

```typescript
const greetingWorkflowActions = Builder.workflowActions().initialize(
  z.any(),
  async ({ mutationCtx, workflow }) => {
    const workflowId = await workflow.initialize()

    // Create greeting aggregate root with empty message
    await insertGreeting(mutationCtx.db, {
      workflowId,
      message: '',
      createdAt: Date.now(),
    })
  },
)

export const greetingWorkflow = Builder.workflow('greeting')
  .withActions(greetingWorkflowActions)
  .startCondition('start')
  .task('storeGreeting', storeGreetingTask)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('storeGreeting'))
  .connectTask('storeGreeting', (to) => to.condition('end'))
```

### Work Item (Human Task)

**[storeGreeting.workItem.ts](convex/workflows/greeting/workItems/storeGreeting.workItem.ts)**

The `storeGreeting` work item is a human task with claim-based assignment:

1. **Start Action**: Claims the work item for the authenticated user
2. **Complete Action**: Validates the user claimed the item, then updates the greeting message

```typescript
const storeGreetingActions = authService.builders.workItemActions
  .start(z.never(), storeWritePolicy, async ({ mutationCtx, workItem }) => {
    // Automatically claims work item for current user
    await GreetingWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId)
    await workItem.start()
  })
  .complete(
    z.object({ message: z.string().min(1) }),
    storeWritePolicy,
    async ({ mutationCtx, workItem, parent }, payload) => {
      // Verify user claimed this item before completing
      // Update greeting message in database
    },
  )
```

### Authorization Scopes

**[scopes.ts](convex/workflows/greeting/scopes.ts)**

Two scopes control access to the greeting workflow:

- `greeting:staff` - Base scope for viewing greetings and work queue
- `greeting:write` - Permission to claim and complete greeting tasks

### API Endpoints

**[api.ts](convex/workflows/greeting/api.ts)**

| Endpoint | Type | Description |
|----------|------|-------------|
| `initializeRootWorkflow` | Mutation | Start a new greeting workflow |
| `startWorkItem` | Mutation | Claim and start a work item |
| `completeWorkItem` | Mutation | Complete work item with message |
| `getGreetings` | Query | List all greetings |
| `getGreetingWorkQueue` | Query | Get available work items for user |
| `claimGreetingWorkItem` | Mutation | Claim a work item |

## UI Integration

The frontend uses TanStack Router with file-based routing and TanStack Query for data fetching.

### Pages

| Route | Description |
|-------|-------------|
| `/simple` | List all greetings with stats |
| `/simple/new` | Create new greeting workflow |
| `/simple/queue` | Work queue with claimable tasks |
| `/simple/tasks/store/$workItemId` | Claim & complete a greeting task |

### Data Flow Pattern

```
User Action (Click)
    ↓
useMutation + useConvexMutation
    ↓
Convex API (api.workflows.greeting.api.*)
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
  mutationFn: useConvexMutation(api.workflows.greeting.api.initializeRootWorkflow),
  onSuccess: () => navigate({ to: '/simple/queue' }),
})

// Trigger workflow creation
initializeMutation.mutate({ payload: {} })
```

### Example: Completing a Task

```typescript
const completeMutation = useMutation({
  mutationFn: useConvexMutation(api.workflows.greeting.api.completeWorkItem),
})

// Complete with message payload
completeMutation.mutate({
  workItemId,
  args: {
    name: 'storeGreeting',
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

# Create greeting workflow roles and groups
npx convex run workflows:greeting:authSetup
```

See the [Convex CLI documentation](https://docs.convex.dev/cli#run-convex-functions) for more details on running functions.

### 6. Assign User to Greeting Team

After running the setup mutations, assign your user to the `greeting_team` group through the Admin UI at `/admin/groups` to grant access to the greeting workflow.

## Usage

1. Navigate to **Simple Greeting > New Greeting** to create a workflow
2. Go to **Work Queue** to see pending tasks
3. Click **Claim & Start** on a work item
4. Enter a greeting message and click **Complete Task**
5. View completed greetings in **All Greetings**

## Admin Features

- `/admin/users` - User management
- `/admin/groups` - Group management and membership
- `/admin/roles` - Role definitions and scope assignments
- `/audit` - Workflow execution traces
