# Recipe: Deferred Choice Pattern (Race Condition)

> **Prerequisites**: [Advanced Workflows](../WORKFLOWS_ADVANCED.md)
> **Related**: [XOR Split/Join](./xor-split-join.md) | [Human-in-the-Loop](./human-in-the-loop.md)

This recipe demonstrates the deferred choice pattern (YAWL Pattern 16) where multiple paths are enabled simultaneously, and the first one to be acted upon "wins" while others are automatically canceled.

**Problem**: A support ticket should be visible to multiple agents, but only one agent can claim it. The first agent to click "claim" wins; other agents should see the ticket disappear.

```typescript
// Domain function to assign ticket to agent
const TicketDomain = {
  async getByWorkflowId(
    ctx: { db: DatabaseReader },
    workflowId: Id<'tasquencerWorkflows'>,
  ) {
    return await ctx.db
      .query('tickets')
      .withIndex('by_workflow', (q) => q.eq('workflowId', workflowId))
      .first()
  },

  async assignToAgent(
    ctx: { db: DatabaseWriter },
    ticketId: Id<'tickets'>,
    agentId: string,
  ) {
    await ctx.db.patch(ticketId, { assignedTo: agentId, status: 'claimed' })
  },
}

// Work item for claiming - each agent gets one
const claimWorkItem = Builder.workItem('claim')

// Create a claim task for a specific agent queue
function createClaimTask(agentQueue: string) {
  return Builder.task(claimWorkItem)
    .withActivities({
      onEnabled: async ({ workItem }) => {
        // Initialize with the agent queue this work item is for
        await workItem.initialize({ agentQueue })
      },
    })
}

// Task to process the ticket after claiming
const processTicketTask = Builder.task(
  Builder.workItem('processTicket').withActivities({
    onInitialized: async ({ workItem }) => {
      await workItem.start()
    },
  }),
).withActivities({
  onEnabled: async ({ workItem }) => {
    await workItem.initialize()
  },
})

// Workflow definition
const ticketClaimWorkflow = Builder.workflow('ticketClaim')
  .startCondition('start')
  .task('claimTier1', createClaimTask('tier1'))
  .task('claimTier2', createClaimTask('tier2'))
  .task('claimTier3', createClaimTask('tier3'))
  .task('processTicket', processTicketTask)
  .endCondition('end')
  // Enable ALL claim tasks simultaneously - this is the deferred choice
  .connectCondition('start', (to) =>
    to.task('claimTier1').task('claimTier2').task('claimTier3'),
  )
  .connectTask('claimTier1', (to) => to.task('processTicket'))
  .connectTask('claimTier2', (to) => to.task('processTicket'))
  .connectTask('claimTier3', (to) => to.task('processTicket'))
  .connectTask('processTicket', (to) => to.condition('end'))
```

## Helper Functions

```typescript
// Factory helpers for the workflow
const ticketClaimHelpers = factory.helpers(ticketClaimWorkflow)

// Get claimable tickets for an agent's queue
export const getClaimableTickets = query({
  args: { agentQueue: v.string() },
  handler: async (ctx, args) => {
    // Get all work items for this agent queue that are initialized (claimable)
    const workItems = await ctx.db
      .query('tasquencerWorkItems')
      .withIndex('by_state', (q) => q.eq('state', 'initialized'))
      .collect()

    // Filter to ones matching this agent's queue
    return workItems.filter((wi) => wi.payload?.agentQueue === args.agentQueue)
  },
})

// Claim a ticket - starts the work item which triggers the deferred choice
export const claimTicket = mutation({
  args: {
    workItemId: v.id('tasquencerWorkItems'),
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    const workItem = await ctx.db.get(args.workItemId)
    if (!workItem || workItem.state !== 'initialized') {
      throw new Error('Ticket already claimed or not available')
    }

    // Get workflow to assign the ticket
    const workflow = await ctx.db.get(workItem.workflowId)
    const ticket = await TicketDomain.getByWorkflowId(ctx, workflow!._id)

    if (ticket) {
      await TicketDomain.assignToAgent(ctx, ticket._id, args.agentId)
    }

    // Start the work item - this triggers the deferred choice
    // Other claim tasks will be automatically canceled
    await ticketClaimHelpers.startWorkItem(ctx, args.workItemId)
    await ticketClaimHelpers.completeWorkItem(ctx, args.workItemId)
  },
})
```

## How It Works

1. When a ticket workflow starts, ALL three claim tasks are enabled simultaneously
2. Each claim task creates a work item visible to its respective agent queue
3. Agents see the ticket in their queue and can click "claim"
4. When ANY agent starts their work item (claims the ticket):
   - That work item transitions to `started`
   - **All other claim tasks are automatically disabled**
   - **All other work items are automatically canceled**
5. The winning claim task completes and enables `processTicket`
6. Only the agent who claimed the ticket sees the processing work item

## The Deferred Choice Mechanism

The key insight is that tasquencer automatically implements deferred choice when:

1. Multiple tasks are enabled from the same condition (implicit OR-split from start)
2. Starting a work item on one task triggers cancellation of sibling tasks

This happens because when a task transitions from `enabled` → `started`, the workflow engine evaluates the graph and cancels tasks that can no longer be reached.

## Visual Timeline

```
Time →
─────────────────────────────────────────────────────────────

[Workflow Starts]
    ├── claimTier1: enabled (work item: initialized)
    ├── claimTier2: enabled (work item: initialized)
    └── claimTier3: enabled (work item: initialized)

[Tier2 Agent Claims]
    ├── claimTier1: disabled (work item: canceled)
    ├── claimTier2: started → completed
    └── claimTier3: disabled (work item: canceled)

[Processing Continues]
    └── processTicket: enabled → started → completed

[Workflow Completes]
```

## Real-World Use Cases

- **Support ticket claiming**: Multiple agents see a ticket, first to claim wins
- **Auction bidding**: Multiple bidders, first valid bid wins
- **Resource allocation**: Multiple requesters for a single resource
- **Approval racing**: Send to multiple approvers, first response decides

## See Also

- [XOR Split/Join](./xor-split-join.md) - When the choice is made by the system, not users
- [Human-in-the-Loop](./human-in-the-loop.md) - General human interaction patterns
- [Authorization Work Queues](./authorization-work-queues.md) - Role-based work assignment
