# Recipe: Failure Policies (Continue on Failure)

> **Prerequisites**: [Advanced Workflows](../WORKFLOWS_ADVANCED.md)
> **Related**: [Multiple Work Items](./multiple-work-items.md) | [Business Exception Retry](./business-exception-retry.md)

This recipe demonstrates how to configure tasks to continue processing despite individual work item failures. By default, when a work item fails, the entire task fails. With custom policies, you can allow the task to continue and complete successfully even when some work items fail.

**Problem**: An email campaign sends to 1000 recipients. If one email fails (invalid address, mailbox full), the entire campaign shouldn't fail. You want to continue sending to remaining recipients and report partial success.

```typescript
// Domain functions
const CampaignDomain = {
  async getRecipients(
    ctx: { db: DatabaseReader },
    workflowId: Id<'tasquencerWorkflows'>,
  ) {
    const campaign = await ctx.db
      .query('campaigns')
      .withIndex('by_workflow', (q) => q.eq('workflowId', workflowId))
      .first()
    return ctx.db
      .query('campaignRecipients')
      .withIndex('by_campaign', (q) => q.eq('campaignId', campaign!._id))
      .collect()
  },

  async sendEmail(
    ctx: { db: DatabaseWriter },
    recipientId: Id<'campaignRecipients'>,
  ) {
    const recipient = await ctx.db.get(recipientId)
    // Simulate email sending - some may fail
    const success = await emailService.send(recipient!.email)
    await ctx.db.patch(recipientId, {
      status: success ? 'sent' : 'failed',
      sentAt: success ? Date.now() : undefined,
    })
    return success
  },
}

// Work item for sending individual emails
const sendEmailWorkItem = Builder.workItem('sendEmail').withActivities({
  onInitialized: async ({ workItem }) => {
    await workItem.start()
  },
  onStarted: async ({ workItem, mutationCtx }) => {
    const payload = workItem.payload as { recipientId: Id<'campaignRecipients'> }
    const success = await CampaignDomain.sendEmail(mutationCtx, payload.recipientId)

    if (success) {
      await workItem.complete()
    } else {
      // This work item fails, but policy will prevent task failure
      await workItem.fail()
    }
  },
})

// Task with custom failure policy
const sendEmailsTask = Builder.task(sendEmailWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Create one work item per recipient
      const recipients = await CampaignDomain.getRecipients(
        mutationCtx,
        parent.workflow.id,
      )
      for (const recipient of recipients) {
        await workItem.initialize({ recipientId: recipient._id })
      }
    },
  })
  .withPolicy(async (ctx) => {
    // When a work item fails, DON'T propagate failure to task
    if (ctx.transition.nextState === 'failed') {
      return 'continue' // <-- Key: absorb the failure
    }

    // Check if all work items are finalized (completed, failed, or canceled)
    const stats = await ctx.task.getStats()
    const allFinalized =
      stats.completed + stats.failed + stats.canceled === stats.total

    // When a work item completes or is canceled, complete task if all done
    if (
      ctx.transition.nextState === 'completed' ||
      ctx.transition.nextState === 'canceled'
    ) {
      return allFinalized ? 'complete' : 'continue'
    }

    return 'continue'
  })

// Summary task to report results
const generateReportWorkItem = Builder.workItem('generateReport').withActivities({
  onInitialized: async ({ workItem }) => {
    await workItem.start()
  },
  onStarted: async ({ workItem, mutationCtx, parent }) => {
    // Generate campaign report with success/failure counts
    const campaign = await ctx.db
      .query('campaigns')
      .withIndex('by_workflow', (q) => q.eq('workflowId', parent.workflow.id))
      .first()

    const recipients = await ctx.db
      .query('campaignRecipients')
      .withIndex('by_campaign', (q) => q.eq('campaignId', campaign!._id))
      .collect()

    const sent = recipients.filter((r) => r.status === 'sent').length
    const failed = recipients.filter((r) => r.status === 'failed').length

    await ctx.db.patch(campaign!._id, {
      completedAt: Date.now(),
      stats: { sent, failed, total: recipients.length },
    })

    await workItem.complete()
  },
})

// Workflow definition
const emailCampaignWorkflow = Builder.workflow('emailCampaign')
  .startCondition('start')
  .task('sendEmails', sendEmailsTask)
  .task(
    'generateReport',
    Builder.task(generateReportWorkItem).withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize()
      },
    }),
  )
  .endCondition('end')
  .connectCondition('start', (to) => to.task('sendEmails'))
  .connectTask('sendEmails', (to) => to.task('generateReport'))
  .connectTask('generateReport', (to) => to.condition('end'))
```

## How It Works

1. `sendEmails` task is enabled and creates 1000 work items (one per recipient)
2. Each work item auto-starts and attempts to send an email
3. **On success**: Work item completes, policy returns `'continue'` (wait for others)
4. **On failure**: Work item fails, policy returns `'continue'` (absorb failure, wait for others)
5. When all work items are finalized, policy returns `'complete'`
6. Task completes successfully (even with some failed work items)
7. `generateReport` runs and summarizes the results

## Policy Return Values

| Return Value | Effect |
|-------------|--------|
| `'continue'` | Absorb the transition, task stays in current state |
| `'complete'` | Complete the task successfully |
| `'fail'` | Fail the task (default behavior when work item fails) |
| `'cancel'` | Cancel the task |

## Policy Context

The policy function receives a context object with:

```typescript
interface PolicyContext {
  transition: {
    nextState: 'completed' | 'failed' | 'canceled'  // Work item's new state
  }
  task: {
    getStats(): Promise<{
      total: number      // Total work items created
      initialized: number
      started: number
      completed: number
      failed: number
      canceled: number
    }>
  }
}
```

## Common Policy Patterns

### Fail on First Failure (Default Behavior)

```typescript
.withPolicy(async (ctx) => {
  if (ctx.transition.nextState === 'failed') {
    return 'fail'  // Propagate failure immediately
  }
  const stats = await ctx.task.getStats()
  const allDone = stats.completed + stats.failed + stats.canceled === stats.total
  return allDone ? 'complete' : 'continue'
})
```

### Continue on Failure, Report at End

```typescript
.withPolicy(async (ctx) => {
  if (ctx.transition.nextState === 'failed') {
    return 'continue'  // Absorb failure
  }
  const stats = await ctx.task.getStats()
  const allDone = stats.completed + stats.failed + stats.canceled === stats.total
  return allDone ? 'complete' : 'continue'
})
```

### Fail if Failure Threshold Exceeded

```typescript
.withPolicy(async (ctx) => {
  const stats = await ctx.task.getStats()
  const failureRate = stats.failed / stats.total

  // Fail if more than 10% failed
  if (failureRate > 0.1) {
    return 'fail'
  }

  if (ctx.transition.nextState === 'failed') {
    return 'continue'  // Below threshold, absorb
  }

  const allDone = stats.completed + stats.failed + stats.canceled === stats.total
  return allDone ? 'complete' : 'continue'
})
```

### Require Minimum Success Count

```typescript
.withPolicy(async (ctx) => {
  const stats = await ctx.task.getStats()
  const allDone = stats.completed + stats.failed + stats.canceled === stats.total

  if (allDone) {
    // Need at least 100 successful sends
    return stats.completed >= 100 ? 'complete' : 'fail'
  }

  return 'continue'
})
```

## See Also

- [Multiple Work Items](./multiple-work-items.md) - Creating multiple work items per task
- [Business Exception Retry](./business-exception-retry.md) - Retrying failed work
- [AI Agent Retry](./ai-agent-retry.md) - Retry patterns with backoff
