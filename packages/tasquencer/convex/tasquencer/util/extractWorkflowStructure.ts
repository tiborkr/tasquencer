import { type TaskJoinType, type TaskSplitType } from '../types'
import {
  TaskFlowBuilder,
  OrTaskFlowBuilder,
  XorTaskFlowBuilder,
} from '../builder/flow'

import { type AnyWorkflowBuilder } from '../builder/workflow'
import {
  CompositeTaskBuilder,
  type AnyCompositeTaskBuilder,
} from '../builder/compositeTask'
import {
  DynamicCompositeTaskBuilder,
  type AnyDynamicCompositeTaskBuilder,
} from '../builder/dynamicCompositeTask'
import { getImplicitConditionName } from '../builder/flow'
import { type AnyTaskBuilder } from '../builder/task'
import {
  DummyTaskBuilder,
  type AnyDummyTaskBuilder,
} from '../builder/dummyTask'

type ExtractedTask = {
  name: string
  description?: string
  joinType: TaskJoinType
  splitType: TaskSplitType
} & (
  | {
      type: 'task'
      workItem: {
        name: string
        description?: string
      }
    }
  | { type: 'dummyTask' }
  | { type: 'compositeTask'; childWorkflow: ExtractedWorkflow }
  | { type: 'dynamicCompositeTask'; childWorkflows: ExtractedWorkflow[] }
)

type ExtractedCondition = {
  name: string
  isStartCondition: boolean
  isEndCondition: boolean
  isImplicitCondition: boolean
}

type ExtractedFlow =
  | {
      type: 'task->condition'
      fromTask: string
      toCondition: string
    }
  | {
      type: 'condition->task'
      fromCondition: string
      toTask: string
    }

export type ExtractedWorkflow = {
  name: string
  description?: string
  tasks: ExtractedTask[]
  conditions: ExtractedCondition[]
  flows: ExtractedFlow[]
  cancellationRegions: {
    owner: string
    tasks: string[]
    conditions: string[]
  }[]
}

// Type guard to check if a task builder is a CompositeTaskBuilder
function isCompositeTaskBuilder(
  taskBuilder:
    | AnyTaskBuilder
    | AnyCompositeTaskBuilder
    | AnyDynamicCompositeTaskBuilder
    | AnyDummyTaskBuilder,
): taskBuilder is AnyCompositeTaskBuilder {
  return taskBuilder instanceof CompositeTaskBuilder
}

// Type guard to check if a task builder is a DynamicCompositeTaskBuilder
function isDynamicCompositeTaskBuilder(
  taskBuilder:
    | AnyTaskBuilder
    | AnyCompositeTaskBuilder
    | AnyDynamicCompositeTaskBuilder
    | AnyDummyTaskBuilder,
): taskBuilder is AnyDynamicCompositeTaskBuilder {
  return taskBuilder instanceof DynamicCompositeTaskBuilder
}

// Type guard to check if a task builder is a DummyTaskBuilder
function isDummyTaskBuilder(
  taskBuilder:
    | AnyTaskBuilder
    | AnyCompositeTaskBuilder
    | AnyDynamicCompositeTaskBuilder
    | AnyDummyTaskBuilder,
): taskBuilder is AnyDummyTaskBuilder {
  return taskBuilder instanceof DummyTaskBuilder
}

export function extractWorkflowStructure(workflow: AnyWorkflowBuilder) {
  // Access private elements property through type assertion
  const elements = workflow.elements

  const extracted: ExtractedWorkflow = {
    name: workflow.name,
    description: workflow.description,
    tasks: [],
    conditions: [],
    flows: [],
    cancellationRegions: [],
  }

  // Extract tasks
  for (const [name, taskBuilder] of Object.entries(elements.tasks)) {
    const initialData = {
      name,
      description: taskBuilder.description,
      joinType: (taskBuilder.joinType ?? 'and') as TaskJoinType,
      splitType: (taskBuilder.splitType ?? 'and') as TaskSplitType,
    }

    if (isCompositeTaskBuilder(taskBuilder)) {
      const childWorkflowBuilder =
        taskBuilder.workflowBuilder as AnyWorkflowBuilder
      const childWorkflow = extractWorkflowStructure(childWorkflowBuilder)
      extracted.tasks.push({
        ...initialData,
        type: 'compositeTask',
        childWorkflow,
      })
    } else if (isDynamicCompositeTaskBuilder(taskBuilder)) {
      const childWorkflows = taskBuilder.workflowBuilders.map(
        (workflowBuilder) =>
          extractWorkflowStructure(workflowBuilder as AnyWorkflowBuilder),
      )
      extracted.tasks.push({
        ...initialData,
        type: 'dynamicCompositeTask',
        childWorkflows,
      })
    } else if (isDummyTaskBuilder(taskBuilder)) {
      extracted.tasks.push({
        ...initialData,
        type: 'dummyTask',
      })
    } else {
      const workItemBuilder = taskBuilder.getWorkItemBuilder()
      extracted.tasks.push({
        ...initialData,
        type: 'task',
        workItem: {
          name: workItemBuilder.name,
          description: workItemBuilder.description,
        },
      })
    }
  }

  // Extract conditions (explicit ones from the array)
  for (const conditionName of elements.conditions) {
    const data = {
      name: conditionName,
      isStartCondition: elements.startCondition === conditionName,
      isEndCondition: elements.endCondition === conditionName,
      isImplicitCondition: false,
    }
    extracted.conditions.push(data)
  }

  // Extract flows from tasks
  for (const [taskName, flow] of Object.entries(elements.flows.tasks)) {
    if (flow instanceof TaskFlowBuilder) {
      // Handle simple TaskFlowBuilder (AND split)
      for (const toCondition of flow.toConditions) {
        extracted.flows.push({
          type: 'task->condition',
          fromTask: taskName,
          toCondition,
        })
      }
      for (const toTask of flow.toTasks) {
        const implicitConditionName = getImplicitConditionName(taskName, toTask)
        extracted.conditions.push({
          name: implicitConditionName,
          isStartCondition: false,
          isEndCondition: false,
          isImplicitCondition: true,
        })
        extracted.flows.push({
          type: 'task->condition',
          fromTask: taskName,
          toCondition: implicitConditionName,
        })
        extracted.flows.push({
          type: 'condition->task',
          fromCondition: implicitConditionName,
          toTask: toTask,
        })
      }
    } else if (
      flow instanceof OrTaskFlowBuilder ||
      flow instanceof XorTaskFlowBuilder
    ) {
      // Handle OrTaskFlowBuilder and XorTaskFlowBuilder (OR/XOR split)
      // These builders use router functions for routing, so we extract the static connections
      for (const toCondition of flow.toConditions) {
        extracted.flows.push({
          type: 'task->condition',
          fromTask: taskName,
          toCondition,
        })
      }

      for (const toTask of flow.toTasks) {
        const implicitConditionName = getImplicitConditionName(taskName, toTask)
        extracted.conditions.push({
          name: implicitConditionName,
          isStartCondition: false,
          isEndCondition: false,
          isImplicitCondition: true,
        })
        extracted.flows.push({
          type: 'task->condition',
          fromTask: taskName,
          toCondition: implicitConditionName,
        })
        extracted.flows.push({
          type: 'condition->task',
          fromCondition: implicitConditionName,
          toTask: toTask,
        })
      }
    }
  }

  // Extract flows from conditions
  for (const [conditionName, flow] of Object.entries(
    elements.flows.conditions,
  )) {
    for (const taskName of Array.from(flow.toTasks) as string[]) {
      extracted.flows.push({
        type: 'condition->task',
        fromCondition: conditionName,
        toTask: taskName,
      })
    }
  }

  const cancellationRegions =
    (
      workflow as unknown as {
        cancellationRegions?: Record<
          string,
          { tasks: Set<string>; conditions: Set<string> }
        >
      }
    ).cancellationRegions ?? {}

  for (const [owner, region] of Object.entries(cancellationRegions)) {
    extracted.cancellationRegions.push({
      owner,
      tasks: Array.from(region.tasks),
      conditions: Array.from(region.conditions),
    })
  }

  return extracted
}

export type ExtractedWorkflowStructure = ReturnType<
  typeof extractWorkflowStructure
>
