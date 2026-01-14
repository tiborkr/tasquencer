# Campaign Approval Example

An enterprise marketing campaign approval workflow demonstrating Tasquencer with Convex, Better Auth, and React. This example shows how to build complex multi-phase human-in-the-loop workflows with role-based authorization, XOR/AND routing, and revision loops.

## Overview

This example implements a realistic enterprise marketing campaign approval process spanning 8 phases with 35 tasks. It demonstrates advanced workflow patterns including:

- **XOR Routing**: Conditional branching based on approval decisions and budget thresholds
- **AND Split/Join**: Parallel task execution (3 technical setup tasks running concurrently)
- **Revision Loops**: Return to previous tasks when revisions are needed (creative review, legal review, QA)
- **Human-in-the-Loop**: All tasks require human interaction with claim/start/complete lifecycle
- **Role-Based Authorization**: 12 scopes, 10 roles, 10 groups controlling task access
- **Budget-Based Routing**: Automatic routing to director vs executive approval based on amount

The workflow tracks campaigns through initiation, strategy development, budget approval, creative production, technical setup, launch approval, execution monitoring, and closure with comprehensive audit trails.

## Tech Stack

- **Backend**: Convex (serverless database & functions)
- **Workflow Engine**: Tasquencer
- **Authentication**: Better Auth with Convex integration
- **Frontend**: React + TanStack Router + TanStack Query
- **UI**: Radix UI + Tailwind CSS

## Workflow Architecture

The campaign approval workflow implements an 8-phase enterprise marketing campaign lifecycle with 35 tasks, parallel execution, and approval loops:

```
Phase 1: Initiation
[start] → [submitRequest] → [intakeReview] → {XOR: approved/rejected/needs_changes}
    ├── approved → [assignOwner] → Phase 2
    ├── rejected → [end]
    └── needs_changes → [submitRequest] (loop)

Phase 2: Strategy (sequential)
[conductResearch] → [defineMetrics] → [developStrategy] → [createPlan] → Phase 3

Phase 3: Budget
[developBudget] → {XOR: by amount}
    ├── < $50k → [directorApproval]
    └── >= $50k → [executiveApproval]
        → {XOR: approved/rejected/revision}
            ├── approved → [secureResources] → Phase 4
            ├── rejected → [end]
            └── revision → [developBudget] (loop)

Phase 4: Creative Development
[createBrief] → [developConcepts] → [internalReview] → {XOR}
    ├── approved → [legalReview] → {XOR}
    │       ├── approved → [finalApproval] → Phase 5
    │       └── needs_changes → [legalRevise] → [legalReview] (loop)
    └── needs_revision → [reviseAssets] → [internalReview] (loop)

Phase 5: Technical Setup (parallel)
[finalApproval] → {AND split: 3 parallel tasks}
    ├── [buildInfra]
    ├── [configAnalytics]
    └── [setupMedia]
        → {AND join} → [qaTest] → {XOR}
            ├── passed → Phase 6
            └── failed → [fixIssues] → [qaTest] (loop)

Phase 6: Launch
[preLaunchReview] → {XOR}
    ├── ready → [launchApproval] → {XOR}
    │       ├── approved → [internalComms] → Phase 7
    │       ├── concerns → [addressConcerns] → [preLaunchReview] (loop)
    │       └── rejected → [end]
    └── not ready → [addressConcerns] → [preLaunchReview] (loop)

Phase 7: Execution
[launchCampaign] → [monitorPerformance] → [ongoingOptimization] → {XOR}
    ├── continue → [monitorPerformance] (loop)
    └── end → Phase 8

Phase 8: Closure (sequential)
[endCampaign] → [compileData] → [conductAnalysis] → [presentResults] → [archiveMaterials] → [end]
```

### Directory Structure

```
convex/workflows/campaign_approval/
├── definition.ts              # Version manager setup
├── workflows/
│   └── campaign_approval.workflow.ts   # 35-task workflow definition
├── workItems/
│   ├── initiation/            # Phase 1: submitRequest, intakeReview, assignOwner
│   ├── strategy/              # Phase 2: conductResearch, defineMetrics, etc.
│   ├── budget/                # Phase 3: developBudget, approvals, secureResources
│   ├── creative/              # Phase 4: createBrief, reviews, revisions
│   ├── technical/             # Phase 5: buildInfra, configAnalytics, setupMedia, qaTest
│   ├── launch/                # Phase 6: preLaunchReview, launchApproval, internalComms
│   ├── execution/             # Phase 7: launchCampaign, monitor, optimize
│   ├── closure/               # Phase 8: endCampaign, analysis, archive
│   └── authHelpers.ts         # Work item auth initialization
├── api.ts                     # Public API endpoints
├── schema.ts                  # Database tables (campaigns, budgets, creatives, KPIs)
├── scopes.ts                  # 12 authorization scopes
├── db.ts                      # 18 database helpers
├── helpers.ts                 # Work item metadata helpers
└── authSetup.ts               # 10 roles & 10 groups setup
```

### Authorization Model

**12 Scopes** control access to workflow tasks:
- `campaign:read`, `campaign:request`, `campaign:intake`, `campaign:manage`
- `campaign:creative_write`, `campaign:creative_review`, `campaign:legal_review`
- `campaign:budget_approve_low` (< $50k), `campaign:budget_approve_high` (>= $50k)
- `campaign:launch_approve`, `campaign:ops`, `campaign:media`

**10 Roles** bundle scopes for different personas:
- `campaign_requester`, `campaign_coordinator`, `campaign_manager`
- `campaign_creative`, `campaign_creative_lead`, `campaign_legal`
- `campaign_ops`, `campaign_media`, `campaign_director`, `campaign_executive`

### API Endpoints

| Endpoint | Type | Description |
|----------|------|-------------|
| `initializeRootWorkflow` | Mutation | Start a new campaign workflow |
| `startWorkItem` | Mutation | Claim and start a work item |
| `completeWorkItem` | Mutation | Complete work item with payload |
| `getCampaign` | Query | Get campaign by workflow ID |
| `getCampaigns` | Query | List all campaigns |
| `getMyCampaigns` | Query | Campaigns where user is requester/owner |
| `getCampaignWorkQueue` | Query | Available work items for user |
| `claimCampaignWorkItem` | Mutation | Claim a work item |

## UI Integration

### Pages

| Route | Description |
|-------|-------------|
| `/campaigns` | Campaign list with status badges |
| `/campaigns/new` | Submit new campaign request |
| `/campaigns/$id` | Campaign detail with workflow timeline |
| `/campaigns/$id/budget` | Budget breakdown visualization |
| `/campaigns/$id/creatives` | Creative assets gallery |
| `/simple/queue` | Work queue with claimable tasks |
| `/simple/tasks/$workItemId` | Generic task execution page (all 35 tasks) |

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Convex Development Server

```bash
npx convex dev
```

### 3. Configure Better Auth

Set up environment variables in `.env.local`:

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

### 5. Run Setup Mutations

```bash
# Create superadmin role
npx convex run scaffold:scaffoldSuperadmin

# Create campaign workflow roles and groups
npx convex run workflows:campaign_approval:authSetup
```

### 6. Assign User to Groups

Assign your user to appropriate groups through `/admin/groups`:
- `marketing_requesters` - Submit campaign requests
- `marketing_coordinators` - Review intake
- `marketing_managers` - Manage campaigns
- `creative_team` / `creative_leads` - Creative development
- `legal_team` - Legal review
- `marketing_ops` / `media_team` - Technical setup
- `marketing_directors` - Budget approval < $50k, launch approval
- `marketing_executives` - Budget approval >= $50k

## Usage

1. Navigate to **Campaigns > New Campaign** to submit a request
2. As coordinator, review in **Work Queue** and approve/reject
3. As manager, work through strategy, budget, and creative phases
4. Parallel technical setup runs after creative approval
5. Complete launch approval and internal communications
6. Monitor and optimize during execution
7. Close campaign with analysis and archive

## Admin Features

- `/admin/users` - User management
- `/admin/groups` - Group management and membership
- `/admin/roles` - Role definitions and scope assignments
- `/audit` - Workflow execution traces

## Development

### Running Tests

```bash
# Run all tests (workflow + database)
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode for development
pnpm test:watch
```

### Database Schema

The workflow uses 8 domain tables:

| Table | Description |
|-------|-------------|
| `campaigns` | Core campaign record with status, dates, owner |
| `campaignBudgets` | Budget breakdown by category |
| `campaignCreatives` | Creative assets with storage references |
| `campaignKPIs` | Key performance indicators with targets |
| `campaignResearch` | Market research and audience analysis |
| `campaignStrategy` | Channel strategy and creative approach |
| `campaignTimeline` | Milestones and deadlines |
| `campaignApprovals` | Approval records with decision history |

### Work Item Lifecycle

Each task follows the Tasquencer work item lifecycle:

```
[initialized] → claim → [claimed] → start → [started] → complete → [completed]
```

Work items are created when their task is enabled. Users must:
1. **Claim** the work item (assigns it to them)
2. **Start** the work item (begins execution)
3. **Complete** with a payload (provides task-specific data)

### Workflow Definition

The workflow is defined in `convex/workflows/campaign_approval/workflows/campaign_approval.workflow.ts` using the Tasquencer builder API:

```typescript
const workflow = Builder.workflow('campaign_approval')
  .condition('start')
  .condition('end')
  .condition('approved')
  // ... conditions for routing
  .task(submitRequestTask)
  .task(intakeReviewTask)
  // ... 35 tasks total
  .connect('start').to.task('submitRequest')
  .connect.task('submitRequest').to.condition('submitted')
  .connect.condition('submitted').to.task('intakeReview')
  // ... flow connections
  .build()
```
