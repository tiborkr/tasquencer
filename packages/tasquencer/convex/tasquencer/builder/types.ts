import { type Id } from '../../_generated/dataModel'
import { type MutationCtx } from '../../_generated/server'
import { type AuditCallbackInfo } from '../audit/integration'
import { type WorkflowExecutionMode } from '../types'

export type WorkflowInfo = {
  name: string
  id: Id<'tasquencerWorkflows'>
}

export type TaskInfo = {
  name: string
  generation: number
  path: string[]
}

export type TaskParent = {
  workflow: WorkflowInfo
}

export type SharedActivityTaskContext = {
  mutationCtx: MutationCtx
  isInternalMutation: boolean
  executionMode: WorkflowExecutionMode
  parent: {
    workflow: WorkflowInfo
  }
  task: TaskInfo
  audit: AuditCallbackInfo
}

export type WorkItemParentInfo = {
  workflow: WorkflowInfo
  task: TaskInfo
}

export type WorkItemInfo = {
  name: string
  id: Id<'tasquencerWorkItems'>
}
