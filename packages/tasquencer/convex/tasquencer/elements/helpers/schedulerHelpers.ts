import { type Id } from '../../../_generated/dataModel'
import { type MutationCtx } from '../../../_generated/server'
import {
  registerTaskScheduled,
  registerCompositeTaskScheduled,
  registerWorkItemScheduled,
} from '../../util/scheduler'

export function createTaskRegisterScheduled(
  mutationCtx: MutationCtx,
  taskId: Id<'tasquencerTasks'>,
  taskGeneration: number,
) {
  return async (scheduled: Promise<Id<'_scheduled_functions'>>) =>
    await registerTaskScheduled({
      mutationCtx,
      taskId,
      taskGeneration,
      scheduled,
    })
}

export function createCompositeTaskRegisterScheduled(
  mutationCtx: MutationCtx,
  taskId: Id<'tasquencerTasks'>,
  taskGeneration: number,
) {
  return async (scheduled: Promise<Id<'_scheduled_functions'>>) =>
    await registerCompositeTaskScheduled({
      mutationCtx,
      taskId,
      taskGeneration,
      scheduled,
    })
}

export function createWorkItemRegisterScheduled(
  mutationCtx: MutationCtx,
  resolveWorkItemId: () =>
    | Id<'tasquencerWorkItems'>
    | Promise<Id<'tasquencerWorkItems'>>,
) {
  return async (scheduled: Promise<Id<'_scheduled_functions'>>) => {
    const workItemId = await resolveWorkItemId()
    return await registerWorkItemScheduled({
      mutationCtx,
      workItemId,
      scheduled,
    })
  }
}
