import { type Id } from '../../_generated/dataModel'
import { type MutationCtx } from '../../_generated/server'

type ScheduledRecord = {
  _id: Id<'tasquencerScheduledInitializations'>
  scheduledFunctionId: Id<'_scheduled_functions'>
}

const TASK_PREFIX = 'task'
const WORKFLOW_PREFIX = 'workflow'
const WORK_ITEM_PREFIX = 'workItem'

function workflowKey(workflowId: Id<'tasquencerWorkflows'>) {
  return `${WORKFLOW_PREFIX}/${workflowId}`
}

function taskKey(taskId: Id<'tasquencerTasks'>, taskGeneration: number) {
  return `${TASK_PREFIX}/${taskId}/${taskGeneration}`
}

function workItemKey(workItemId: Id<'tasquencerWorkItems'>) {
  return `${WORK_ITEM_PREFIX}/${workItemId}`
}

async function cancelEntries(
  mutationCtx: MutationCtx,
  entries: ScheduledRecord[],
  options: { cancelScheduler?: boolean } = {},
) {
  const shouldCancel = options.cancelScheduler ?? true
  await Promise.all(
    entries.map(async ({ _id, scheduledFunctionId }) => {
      if (shouldCancel) {
        try {
          const scheduledFunction =
            await mutationCtx.db.system.get(scheduledFunctionId)
          if (scheduledFunction?.state.kind === 'pending') {
            await mutationCtx.scheduler.cancel(scheduledFunctionId)
          }
        } catch (error) {
          // Scheduler may have already executed this function, ignore.
        }
      }
      await mutationCtx.db.delete(_id)
    }),
  )
}

async function storeEntry(
  mutationCtx: MutationCtx,
  key: string,
  scheduled: Promise<Id<'_scheduled_functions'>>,
) {
  /**
   * This table keeps scheduled entries per element/key even after the
   * function has fired. The entries act as a reverse index so cancellations
   * can locate `_scheduled_functions` records and tear them down; the source
   * of truth for execution state still lives in Convex's internal scheduler collection.
   */
  const scheduledFunctionId = await scheduled

  await mutationCtx.db.insert('tasquencerScheduledInitializations', {
    scheduledFunctionId,
    key,
    createdAt: Date.now(),
  })

  return scheduledFunctionId
}

async function deleteByKey(
  mutationCtx: MutationCtx,
  key: string,
  options: { cancelScheduler?: boolean } = {},
) {
  const records = await mutationCtx.db
    .query('tasquencerScheduledInitializations')
    .withIndex('by_key', (q) => q.eq('key', key))
    .collect()

  if (records.length > 0) {
    await cancelEntries(mutationCtx, records, options)
  }
}

function taskPrefix(taskId: Id<'tasquencerTasks'>) {
  return `${TASK_PREFIX}/${taskId}/`
}

async function listTaskEntries(
  mutationCtx: MutationCtx,
  taskId: Id<'tasquencerTasks'>,
) {
  const prefix = taskPrefix(taskId)
  const upperBound = `${prefix}`

  return await mutationCtx.db
    .query('tasquencerScheduledInitializations')
    .withIndex('by_key', (q) => q.gte('key', prefix).lt('key', upperBound))
    .collect()
}

export async function registerWorkflowScheduled(args: {
  mutationCtx: MutationCtx
  scheduled: Promise<Id<'_scheduled_functions'>>
  workflowId: Id<'tasquencerWorkflows'>
}) {
  return await storeEntry(
    args.mutationCtx,
    workflowKey(args.workflowId),
    args.scheduled,
  )
}

export async function registerTaskScheduled(args: {
  mutationCtx: MutationCtx
  scheduled: Promise<Id<'_scheduled_functions'>>
  taskId: Id<'tasquencerTasks'>
  taskGeneration: number
}) {
  return await storeEntry(
    args.mutationCtx,
    taskKey(args.taskId, args.taskGeneration),
    args.scheduled,
  )
}

export async function registerCompositeTaskScheduled(args: {
  mutationCtx: MutationCtx
  scheduled: Promise<Id<'_scheduled_functions'>>
  taskId: Id<'tasquencerTasks'>
  taskGeneration: number
}) {
  return await registerTaskScheduled(args)
}

export async function registerWorkItemScheduled(args: {
  mutationCtx: MutationCtx
  scheduled: Promise<Id<'_scheduled_functions'>>
  workItemId: Id<'tasquencerWorkItems'>
}) {
  return await storeEntry(
    args.mutationCtx,
    workItemKey(args.workItemId),
    args.scheduled,
  )
}

export async function cancelScheduledForWorkflow(
  mutationCtx: MutationCtx,
  workflowId: Id<'tasquencerWorkflows'>,
) {
  await deleteByKey(mutationCtx, workflowKey(workflowId))
}

export async function cancelScheduledForTask(
  mutationCtx: MutationCtx,
  taskId: Id<'tasquencerTasks'>,
) {
  const records = await listTaskEntries(mutationCtx, taskId)
  await cancelEntries(mutationCtx, records)
}

export async function cancelScheduledForWorkItem(
  mutationCtx: MutationCtx,
  workItemId: Id<'tasquencerWorkItems'>,
  options: { cancelScheduler?: boolean } = {},
) {
  await deleteByKey(mutationCtx, workItemKey(workItemId), options)
}

export { taskKey, workflowKey, workItemKey }
