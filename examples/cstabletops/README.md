# Cybersecurity Tabletop Exercises (TTX) Example

An example Tasquencer + Convex app for running cybersecurity tabletop exercises.

This example now ships as a small “platform”:
- **Exercise library** with metadata (difficulty, duration, threat actor, impacted assets, CIS controls) for all six CIS scenarios.
- **Sessions** (create, list, dashboard, reporting, live presentation).
- **Participants** (join via code; roles: facilitator, player with role assignment, note‑taker, observer).
- **Work queue** with Pending vs Claimed sections and role-based filtering.
- **Execution** flows per exercise (cards → work items), optional injects, and live presentation mode.
- **Authorization**: facilitators can create/manage; others can join and see only what they’re allowed to.

## Source Material

This example was built using the following reference documents:

- [Cybersecurity Tabletop Exercise Tips](https://www.cisa.gov/sites/default/files/publications/Cybersecurity-Tabletop-Exercise-Tips_508c.pdf) (CISA)
- [Six Tabletop Exercises to Help Prepare Your Cybersecurity Team](https://www.cisecurity.org/insights/white-papers/six-tabletop-exercises-prepare-cybersecurity-team) (CIS)


## Workflow Architecture

```
[start] → [exercise (dynamic composite)] → [end]
```

Each exercise workflow is a small linear flow, e.g.:

```
[Present Scenario] → [Record Response] → [Record Notes]
```

The “Financial Break-in” workflow includes an **optional inject** via a facilitator choice.

## Roles & Work Queue

When a session is created, per-session auth groups are created and the creator is a **facilitator**.

Participants join via **join code**:
- **Player** (must choose one player role, e.g., IT Lead, Comms, Legal, Finance, Exec)
- **Note-taker** (records discussion notes)
- **Observer** (read-only)
- Facilitators can also join/log in later.

Work items are offered with `requiredScope` + `requiredGroupId`; prompt cards assigned to a specific player role are only visible to that role’s group. Claimed tasks stay visible in the queue until completed.

### Exercise library (6 scenarios, CIS “Six Scenarios” pack)
Each exercise has metadata: difficulty, duration, threat actor, impacted assets, and CIS controls touched.
- Quick Fix (beginner, 30m, Insider (unintentional), CIS 4/7)
- Malware Infection (beginner, 30m, External (malware), CIS 8/10)
- Unplanned Attack (intermediate, 45m, Hacktivist, CIS 7/17)
- Cloud Compromise (intermediate, 45m, External (third-party breach), CIS 15/3)
- Financial Break-in (advanced, 60m, External (financial crime), CIS 5/6; optional inject)
- Flood Zone (advanced, 60m, External (ransomware), CIS 11/17)

## Convex Layout

```
convex/workflows/cstabletops/
├── definition.ts
├── workflows/
│   ├── cstabletops.workflow.ts
│   ├── quickFix.workflow.ts
│   ├── malwareInfection.workflow.ts
│   ├── unplannedAttack.workflow.ts
│   ├── cloudCompromise.workflow.ts
│   ├── financialBreakIn.workflow.ts
│   └── floodZone.workflow.ts
├── workItems/
│   ├── presentCard.workItem.ts
│   ├── recordResponse.workItem.ts
│   ├── recordNotes.workItem.ts
│   ├── chooseOptionalCard.workItem.ts
│   └── cardTasks.ts
│   └── authHelpers.ts
├── api.ts
├── schema.ts
├── scopes.ts
├── db.ts
├── helpers.ts
└── authSetup.ts
```

## Setup

### 1) Install

From repo root:

```bash
pnpm install
```

### 2) Start Convex + Web

From repo root:

```bash
pnpm --filter @repo/cstabletops-example dev
```

### 3) Scaffold Authorization

After registering your first user in the UI:

```bash
cd examples/cstabletops
npx convex run scaffold:scaffoldSuperadmin
npx convex run workflows/cstabletops/authSetup:setupAuthCstabletopsAuthorization
```

## Key Features (UI)

- **Sessions list** (`/simple`): Shows sessions the user participates in. Facilitators see “New Session”; others get a “Join Session” CTA.
- **New session** (`/simple/new`): Exercise browser with metadata cards and a details panel. Facilitators only.
- **Join session** (`/simple/join`): Enter join code, pick role; players pick a specific player role.
- **Work queue** (`/simple/queue`): Pending vs Claimed sections; role-filtered tasks; claimed tasks stay visible.
- **Task detail** (`/simple/tasks/store/$workItemId`): Present, respond, note-take, optional inject; better error handling for conflicts/network.
- **Dashboard** (`/simple/session/$sessionId`): Facilitators see roster, join code, bottlenecks, and progress; players see their role/progress; completed sessions add Summary + export.
- **Reporting**: Summary tab + “Export Report” (Markdown) after completion.
- **Live presentation** (`/simple/presentation/$sessionId`): Facilitator-led synchronous mode; participants stay in sync; responses collected live; pause/resume/show responses/end.

## Implementation Notes

- **Authorization**: `getUserCapabilities` gates creation; API queries return empty for non-authorized viewers instead of throwing.
- **Work items**: Offered with scope + group; per-role groups for player prompts. Claimed items are returned in the queue to allow resuming.
- **Live presentation state**: Stored in `ttxPresentationState`; one active presentation per session.
- **Backwards compatibility**: Legacy `respondToInject` kept; v1/v2 workflow versioning for structural changes.

## What to Extend Next

- Draft persistence for long responses.
- Presentation history / timeline view.
- Optional modal to preview full scenario text from the exercise cards.
- “Leave session” / reassign roles; facilitator overrides for stuck tasks.
