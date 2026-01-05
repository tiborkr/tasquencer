import { type Edge, MarkerType, type Node } from '@xyflow/react'

import {
  type TaskState,
  type ExtractedWorkflowStructure,
} from '@repo/tasquencer'

type ExtractedWorkflowTask = ExtractedWorkflowStructure['tasks'][number]
type ExtractedWorkflowCondition =
  ExtractedWorkflowStructure['conditions'][number]
type ExtractedWorkflowFlow = ExtractedWorkflowStructure['flows'][number]

type TaskWithState = ExtractedWorkflowTask & {
  taskState?: TaskState
  generation?: number
  canceledBy?: string[]
  isCancellationOwner?: boolean
}

type ConditionWithState = ExtractedWorkflowCondition & {
  marking?: number
  canceledBy?: string[]
}

export type TaskNode = Node<TaskWithState, 'task'>
export type ConditionNode = Node<ConditionWithState, 'condition'>

export type WorkflowNode = TaskNode | ConditionNode
export type WorkflowEdge = Edge<
  {
    condition?: string
    marking?: number
  },
  'floating'
>

const position = { x: 0, y: 0 }
const edgeType = 'floating'

const edgeMarkerEnd = {
  type: MarkerType.ArrowClosed,
  width: 20,
  height: 20,
}

export function workflowStructureToNodesAndEdges(
  structure: ExtractedWorkflowStructure,
  state?: {
    conditions: Record<string, { marking: number }>
    tasks: Record<string, { state: TaskState; generation: number }>
  } | null,
) {
  const { explicitConditions } = structure.conditions.reduce<{
    explicitConditions: Record<string, ExtractedWorkflowCondition>
    implicitConditions: Record<string, ExtractedWorkflowCondition>
  }>(
    (acc, condition) => {
      if (condition.isImplicitCondition) {
        acc.implicitConditions[condition.name] = condition
      } else {
        acc.explicitConditions[condition.name] = condition
      }
      return acc
    },
    { explicitConditions: {}, implicitConditions: {} },
  )

  const { explicitFlows, implicitFlows } = structure.flows.reduce<{
    explicitFlows: ExtractedWorkflowFlow[]
    implicitFlows: {
      'task->condition': Record<
        string,
        Extract<ExtractedWorkflowFlow, { type: 'task->condition' }>[]
      >
      'condition->task': Record<
        string,
        Extract<ExtractedWorkflowFlow, { type: 'condition->task' }>
      >
    }
  }>(
    (acc, flow) => {
      if (flow.type === 'task->condition') {
        const { toCondition, fromTask } = flow
        if (explicitConditions[toCondition]) {
          acc.explicitFlows.push(flow)
        } else {
          acc.implicitFlows['task->condition'][fromTask] ||= []
          acc.implicitFlows['task->condition'][fromTask].push(flow)
        }
      } else {
        const { fromCondition } = flow
        if (explicitConditions[fromCondition]) {
          acc.explicitFlows.push(flow)
        } else {
          acc.implicitFlows['condition->task'][fromCondition] = flow
        }
      }
      return acc
    },
    {
      explicitFlows: [],
      implicitFlows: {
        'task->condition': {},
        'condition->task': {},
      },
    },
  )

  const cancellationRegions = structure.cancellationRegions ?? []
  const cancellationOwners = new Set(
    cancellationRegions.map((region) => region.owner),
  )
  const cancellationMembership = cancellationRegions.reduce<{
    tasks: Record<string, string[]>
    conditions: Record<string, string[]>
    owners: Record<
      string,
      {
        tasks: string[]
        conditions: string[]
      }
    >
  }>(
    (acc, region) => {
      const existing = acc.owners[region.owner]
      const ownerRecord = existing ?? {
        tasks: [],
        conditions: [],
      }
      for (const taskName of region.tasks) {
        if (!ownerRecord.tasks.includes(taskName)) {
          ownerRecord.tasks.push(taskName)
        }
      }
      for (const conditionName of region.conditions) {
        if (!ownerRecord.conditions.includes(conditionName)) {
          ownerRecord.conditions.push(conditionName)
        }
      }
      acc.owners[region.owner] = ownerRecord

      for (const taskName of region.tasks) {
        acc.tasks[taskName] ||= []
        acc.tasks[taskName].push(region.owner)
      }
      for (const conditionName of region.conditions) {
        acc.conditions[conditionName] ||= []
        acc.conditions[conditionName].push(region.owner)
      }
      return acc
    },
    { tasks: {}, conditions: {}, owners: {} },
  )

  const nodes: WorkflowNode[] = [
    ...structure.tasks.map((task) => {
      const taskState = state?.tasks[task.name]
      const taskNode: TaskNode = {
        id: `task:${task.name}`,
        type: 'task',
        data: {
          ...task,
          taskState: taskState?.state,
          generation: taskState?.generation,
          canceledBy: cancellationMembership.tasks[task.name] ?? [],
          isCancellationOwner: cancellationOwners.has(task.name),
        },
        position,
      }
      return taskNode
    }),
    ...Object.values(explicitConditions).map((condition) => {
      const conditionState = state?.conditions[condition.name]
      const conditionNode: ConditionNode = {
        id: `condition:${condition.name}`,
        type: 'condition',
        data: {
          ...condition,
          marking: conditionState?.marking,
          canceledBy: cancellationMembership.conditions[condition.name] ?? [],
        },
        position,
      }
      return conditionNode
    }),
  ]

  const edges: WorkflowEdge[] = explicitFlows.map((flow) => {
    if (flow.type === 'task->condition') {
      const source = `task:${flow.fromTask}`
      const target = `condition:${flow.toCondition}`
      return {
        id: `flow:${flow.fromTask}->${flow.toCondition}`,
        source,
        target,
        type: edgeType,
        markerEnd: edgeMarkerEnd,
      }
    }
    const source = `condition:${flow.fromCondition}`
    const target = `task:${flow.toTask}`
    return {
      id: `flow:${flow.fromCondition}->${flow.toTask}`,
      source,
      target,
      type: edgeType,
      markerEnd: edgeMarkerEnd,
      data: {
        condition: flow.fromCondition,
      },
    }
  })

  for (const [key, value] of Object.entries(implicitFlows['task->condition'])) {
    const source = `task:${key}`
    for (const flow of value) {
      const toCondition = flow.toCondition
      const rightFlow = implicitFlows['condition->task'][toCondition]
      if (rightFlow) {
        const target = `task:${rightFlow.toTask}`
        const conditionState = state?.conditions[toCondition]
        edges.push({
          id: `flow:${key}->${rightFlow.toTask}`,
          source,
          target,
          type: edgeType,
          markerEnd: edgeMarkerEnd,
          data: {
            condition: toCondition,
            marking: conditionState?.marking ?? 0,
          },
        })
      }
    }
  }

  return { nodes, edges, cancellationMembership }
}
