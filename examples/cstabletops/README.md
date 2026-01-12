# Cybersecurity Tabletop Exercises (TTX) Example

An example Tasquencer + Convex app for running cybersecurity tabletop exercises.

This example models tabletop exercises as a **sequence of cards** (scenario, prompt, discussion), and supports **multiple exercise types** (from the CIS “Six Scenarios” pack). It demonstrates a generalized “platform layer” (sessions, participants, cards, responses/notes) plus **one workflow per exercise**, selected at runtime via a **dynamic composite task**.

## Source Material

- `examples/cstabletops/docs/Cybersecurity-Tabletop-Exercise-Tips_508c.pdf`
- `examples/cstabletops/docs/Six-tabletop-exercises-FINAL.pdf`

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

When a session is created, the app creates **per-session auth groups** and assigns the creator to:
- Facilitator (can present cards / make choices)

Other participants join the session with a **join code**:
- Player (selects exactly one player role for the session, e.g. IT Lead)
- Note-taker (records discussion notes)
- Observer (read-only)

Work items are offered with both `requiredScope` and `requiredGroupId`, so the work queue is automatically session-scoped.

Prompt cards can optionally be assigned to a specific player role. Those work items are offered to a **per-session, per-player-role group**, so only the matching role sees them in their queue.

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

## What to Extend Next

- Multi-player collection (fan-out/gather per prompt card; see `docs/recipes/multiple-work-items.md`)
- Facilitator “override” actions (reassign/skip when someone is blocked)
- After-action review workflow + exports
- Patterns and inspiration: `docs/RECIPES.md` and `docs/recipes/*`
