# Recipe: Root Workflow ID for Nested Workflows

> **Prerequisites**: [Advanced Workflows](../WORKFLOWS_ADVANCED.md)
> **Related**: [Domain Modeling](../DOMAIN_MODELING.md)

**Problem:** You need to query aggregate root data from nested workflows (sub-workflows need patient/order/RFP data).

**Solution:** Use the built-in `helpers` from `Tasquencer.build()`.

## Setup

Export the helpers from your tasquencer setup file:

```typescript
// convex/tasquencer.ts
import type { DataModel } from "./_generated/dataModel";
import { Tasquencer } from "@repo/tasquencer";
import { components } from "./_generated/api";

export const { Builder, Authorization, versionManagerFor, helpers } =
  Tasquencer.initialize<DataModel>(
    components.tasquencerAudit,
    components.tasquencerAuthorization
  ).build();
```

## Available Helpers

- `helpers.getRootWorkflowId(db, workflowId)` - Get root workflow ID from a workflow
- `helpers.getRootWorkflowIdForWorkItem(db, workItemId)` - Get root workflow ID from a work item
- `helpers.getWorkflowIdForWorkItem(db, workItemId)` - Get direct parent workflow ID for a work item

## Usage Examples

### Query aggregate root from workflow ID

```typescript
import { helpers } from "../../../tasquencer";

export async function getPatientByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<"tasquencerWorkflows">
): Promise<Doc<"patients"> | null> {
  const rootWorkflowId = await helpers.getRootWorkflowId(db, workflowId);
  return await db
    .query("patients")
    .withIndex("by_workflow_id", (q) => q.eq("workflowId", rootWorkflowId))
    .unique();
}
```

### Query aggregate root from work item ID

```typescript
import { helpers } from "../../../tasquencer";

export async function getRootWorkflowAndPatientForWorkItem(
  db: DatabaseReader,
  workItemId: Id<"tasquencerWorkItems">
): Promise<{
  rootWorkflowId: Id<"tasquencerWorkflows">;
  patient: Doc<"patients">;
}> {
  const rootWorkflowId = await helpers.getRootWorkflowIdForWorkItem(
    db,
    workItemId
  );
  const patient = await getPatientByWorkflowId(db, rootWorkflowId);
  if (!patient) throw new Error("Patient not found");
  return { rootWorkflowId, patient };
}
```

### Get both workflow IDs for a work item

```typescript
import { helpers } from "../../../tasquencer";

export async function getWorkflowIdsForWorkItem(
  db: DatabaseReader,
  workItemId: Id<"tasquencerWorkItems">
): Promise<{
  workflowId: Id<"tasquencerWorkflows">;
  rootWorkflowId: Id<"tasquencerWorkflows">;
}> {
  const [workflowId, rootWorkflowId] = await Promise.all([
    helpers.getWorkflowIdForWorkItem(db, workItemId),
    helpers.getRootWorkflowIdForWorkItem(db, workItemId),
  ]);
  return { workflowId, rootWorkflowId };
}
```

## Why This Works

```
Root Workflow - workflowId: wf_root, realizedPath: [wf_root]
  └─ Sub-workflow - workflowId: wf_sub1, realizedPath: [wf_root, wf_sub1]
      └─ Sub-sub-workflow - workflowId: wf_sub2, realizedPath: [wf_root, wf_sub1, wf_sub2]
```

## When to Use

- Nested workflows (composite tasks)
- Querying aggregate roots from any workflow depth
- Filtering work queues across entire workflow hierarchies

## See Also

- [Domain Modeling - Root Workflow ID Pattern](../DOMAIN_MODELING.md#8-root-workflow-id-pattern)
