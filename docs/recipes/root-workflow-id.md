# Recipe: Root Workflow ID for Nested Workflows

> **Prerequisites**: [Advanced Workflows](../WORKFLOWS_ADVANCED.md)
> **Related**: [Domain Modeling](../DOMAIN_MODELING.md)

**Problem:** You need to query aggregate root data from nested workflows (sub-workflows need patient/order/RFP data).

**Solution:** Use `realizedPath[0]` to get root workflow ID.

```typescript
// Domain function extracts root workflow ID
export async function getRootWorkflowId(
  db: DatabaseReader,
  workflowId: Id<'tasquencerWorkflows'>,
): Promise<Id<'tasquencerWorkflows'>> {
  const workflow = await db.get(workflowId)
  if (!workflow) throw new Error('Workflow not found')

  // realizedPath[0] is always the root workflow ID
  return (workflow.realizedPath[0] as Id<'tasquencerWorkflows'>) || workflowId
}

// Bake it into domain functions
export const PatientDomain = {
  async getByWorkflowId(
    ctx: { db: DatabaseReader },
    workflowId: Id<'tasquencerWorkflows'>,
  ) {
    const rootWorkflowId = await getRootWorkflowId(ctx.db, workflowId)
    const patient = await ctx.db
      .query('patients')
      .withIndex('by_workflow_id', (q) => q.eq('workflowId', rootWorkflowId))
      .unique()

    if (!patient) throw new Error('Patient not found')
    return patient
  },
}

// Usage in nested workflow
const bloodTestTask = Builder.task(collectSampleWorkItem).withActivities({
  onEnabled: async ({ mutationCtx, workItem, parent }) => {
    // Works for both root and nested workflows!
    const patient = await PatientDomain.getByWorkflowId(
      mutationCtx,
      parent.workflow.id,
    )

    await workItem.initialize({ patientId: patient._id })
  },
})
```

## Why This Works

```
Root Workflow - workflowId: wf_root, realizedPath: [wf_root]
  └─ Sub-workflow - workflowId: wf_sub1, realizedPath: [wf_root, wf_sub1]
      └─ Sub-sub-workflow - workflowId: wf_sub2, realizedPath: [wf_root, wf_sub1, wf_sub2]
```

All workflows can extract `wf_root` from `realizedPath[0]` to query the aggregate root.

## When to Use

- Nested workflows (composite tasks)
- Querying aggregate roots from any workflow depth
- Filtering work queues across entire workflow hierarchies

## See Also

- [Domain Modeling - Root Workflow ID Pattern](../DOMAIN_MODELING.md#8-root-workflow-id-pattern)
