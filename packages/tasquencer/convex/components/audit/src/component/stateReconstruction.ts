/**
 * State reconstruction helpers for workflow time-travel debugging
 *
 * This module provides utilities for reconstructing workflow state from audit spans.
 * State is computed by replaying spans in order, which can be expensive for large traces.
 * Snapshots can be used to cache state at major milestones and speed up reconstruction.
 */

import {
  type SpanAttributes,
  type ConditionSpanAttributes,
  type TaskSpanAttributes,
  type WorkItemSpanAttributes,
} from "../shared/attributeSchemas";

export type WorkflowState = {
  timestamp: number;
  sequenceNumber: number;
  workflow: {
    name: string;
    state: "initialized" | "started" | "completed" | "failed" | "canceled";
  };
  conditions: Record<
    string,
    { name: string; marking: number; lastChangedAt: number }
  >;
  tasks: Record<
    string,
    {
      name: string;
      state:
        | "disabled"
        | "enabled"
        | "started"
        | "completed"
        | "failed"
        | "canceled";
      generation: number;
      lastChangedAt: number;
    }
  >;
  workItems: Record<
    string,
    {
      id: string;
      name: string;
      state: "initialized" | "started" | "completed" | "failed" | "canceled";
      taskName: string;
      lastChangedAt: number;
    }
  >;
};

export type SpanData = {
  spanId: string;
  operation: string;
  operationType: string;
  resourceName?: string;
  resourceId?: string;
  startedAt: number;
  sequenceNumber?: number;
  attributes?: SpanAttributes;
};

/**
 * Reconstruct workflow state by replaying spans
 * This is the core state reconstruction algorithm
 */
export function reconstructStateFromSpans(
  workflowName: string,
  spans: SpanData[],
  targetTimestamp: number,
  targetWorkflowId?: string
): WorkflowState {
  const conditions: WorkflowState["conditions"] = {};
  const tasks: WorkflowState["tasks"] = {};
  const workItems: WorkflowState["workItems"] = {};

  let workflowState: WorkflowState["workflow"] = {
    name: workflowName,
    state: "initialized",
  };

  let lastSequence = 0;
  let processedCount = 0;
  let filteredCount = 0;

  // Replay spans up to target timestamp
  for (const span of spans) {
    if (span.startedAt > targetTimestamp) break;

    // Filter spans to only include those belonging to the target workflow
    let spanWorkflowId: string | undefined;
    if (span.attributes && span.attributes.type !== "custom") {
      spanWorkflowId = span.attributes.workflowId;
    }

    if (
      targetWorkflowId &&
      spanWorkflowId &&
      spanWorkflowId !== targetWorkflowId
    ) {
      filteredCount++;
      continue;
    }

    processedCount++;
    lastSequence = span.sequenceNumber ?? 0;

    // Workflow state changes
    if (span.operationType === "workflow") {
      const operation = span.operation.split(".")[1];
      if (operation === "start") workflowState.state = "started";
      else if (operation === "complete") workflowState.state = "completed";
      else if (operation === "fail") workflowState.state = "failed";
      else if (operation === "cancel") workflowState.state = "canceled";
    }

    // Condition marking changes
    if (
      span.operationType === "condition" &&
      span.attributes?.type === "condition"
    ) {
      const conditionName = span.resourceName!;
      const attrs: ConditionSpanAttributes = span.attributes;

      // Initialize condition if not seen before
      if (!conditions[conditionName]) {
        conditions[conditionName] = {
          name: conditionName,
          marking: attrs.oldMarking,
          lastChangedAt: span.startedAt,
        };
      }

      conditions[conditionName] = {
        name: conditionName,
        marking: attrs.newMarking,
        lastChangedAt: span.startedAt,
      };
    }

    // Task state changes
    if (span.operationType === "task" && span.attributes?.type === "task") {
      const taskName = span.resourceName!;
      const operation = span.operation.split(".")[1];
      const attrs: TaskSpanAttributes = span.attributes;

      // Initialize task if not seen before
      if (!tasks[taskName]) {
        tasks[taskName] = {
          name: taskName,
          state: "disabled",
          generation: 0,
          lastChangedAt: span.startedAt,
        };
      }

      if (operation === "enable") {
        tasks[taskName] = {
          name: taskName,
          state: "enabled",
          generation: attrs.generation,
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "disable") {
        tasks[taskName] = {
          ...tasks[taskName],
          state: "disabled",
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "start") {
        tasks[taskName] = {
          ...tasks[taskName],
          state: "started",
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "complete") {
        tasks[taskName] = {
          ...tasks[taskName],
          state: "completed",
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "fail") {
        tasks[taskName] = {
          ...tasks[taskName],
          state: "failed",
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "cancel") {
        tasks[taskName] = {
          ...tasks[taskName],
          state: "canceled",
          lastChangedAt: span.startedAt,
        };
      }
    }

    // WorkItem state changes
    if (
      span.operationType === "workItem" &&
      span.attributes?.type === "workItem"
    ) {
      const workItemId = span.resourceId!;
      const workItemName = span.resourceName!;
      const operation = span.operation.split(".")[1];
      const attrs: WorkItemSpanAttributes = span.attributes;

      if (operation === "initialize") {
        workItems[workItemId] = {
          id: workItemId,
          name: workItemName,
          state: "initialized",
          taskName: attrs.parent.taskName,
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "start") {
        workItems[workItemId] = {
          ...workItems[workItemId],
          state: "started",
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "complete") {
        workItems[workItemId] = {
          ...workItems[workItemId],
          state: "completed",
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "fail") {
        workItems[workItemId] = {
          ...workItems[workItemId],
          state: "failed",
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "cancel") {
        workItems[workItemId] = {
          ...workItems[workItemId],
          state: "canceled",
          lastChangedAt: span.startedAt,
        };
      }
    }
  }

  return {
    timestamp: targetTimestamp,
    sequenceNumber: lastSequence,
    workflow: workflowState,
    conditions,
    tasks,
    workItems,
  };
}

/**
 * Apply incremental spans to an existing state
 * Used when we have a snapshot and need to fast-forward
 */
export function applySpansToState(
  baseState: WorkflowState,
  spans: SpanData[],
  targetTimestamp: number,
  targetWorkflowId?: string
): WorkflowState {
  // Clone the base state
  const state: WorkflowState = {
    ...baseState,
    workflow: { ...baseState.workflow },
    conditions: { ...baseState.conditions },
    tasks: { ...baseState.tasks },
    workItems: { ...baseState.workItems },
  };

  let lastSequence = baseState.sequenceNumber;

  // Apply each span
  for (const span of spans) {
    if (span.startedAt > targetTimestamp) break;

    // Filter spans to only include those belonging to the target workflow
    const spanWorkflowId = (span.attributes as any)?.workflowId;
    if (
      targetWorkflowId &&
      spanWorkflowId &&
      spanWorkflowId !== targetWorkflowId
    ) {
      continue;
    }

    lastSequence = span.sequenceNumber ?? lastSequence;

    // Workflow state changes
    if (span.operationType === "workflow") {
      const operation = span.operation.split(".")[1];
      if (operation === "start") state.workflow.state = "started";
      else if (operation === "complete") state.workflow.state = "completed";
      else if (operation === "fail") state.workflow.state = "failed";
      else if (operation === "cancel") state.workflow.state = "canceled";
    }

    // Condition marking changes
    if (span.operationType === "condition") {
      const conditionName = span.resourceName!;
      const attrs = span.attributes as any;

      // Initialize condition if not seen before
      if (!state.conditions[conditionName]) {
        state.conditions[conditionName] = {
          name: conditionName,
          marking: attrs.oldMarking ?? 0,
          lastChangedAt: span.startedAt,
        };
      }

      state.conditions[conditionName] = {
        name: conditionName,
        marking: attrs.newMarking,
        lastChangedAt: span.startedAt,
      };
    }

    // Task state changes
    if (span.operationType === "task") {
      const taskName = span.resourceName!;
      const operation = span.operation.split(".")[1];
      const attrs = span.attributes as any;

      // Initialize task if not seen before
      if (!state.tasks[taskName]) {
        state.tasks[taskName] = {
          name: taskName,
          state: "disabled",
          generation: 0,
          lastChangedAt: span.startedAt,
        };
      }

      if (operation === "enable") {
        state.tasks[taskName] = {
          name: taskName,
          state: "enabled",
          generation:
            attrs.generation ?? state.tasks[taskName]?.generation ?? 0,
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "disable") {
        state.tasks[taskName] = {
          ...state.tasks[taskName],
          state: "disabled",
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "start") {
        state.tasks[taskName] = {
          ...state.tasks[taskName],
          state: "started",
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "complete") {
        state.tasks[taskName] = {
          ...state.tasks[taskName],
          state: "completed",
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "fail") {
        state.tasks[taskName] = {
          ...state.tasks[taskName],
          state: "failed",
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "cancel") {
        state.tasks[taskName] = {
          ...state.tasks[taskName],
          state: "canceled",
          lastChangedAt: span.startedAt,
        };
      }
    }

    // WorkItem state changes
    if (span.operationType === "workItem") {
      const workItemId = span.resourceId!;
      const workItemName = span.resourceName!;
      const operation = span.operation.split(".")[1];
      const attrs = span.attributes as any;

      if (operation === "initialize") {
        state.workItems[workItemId] = {
          id: workItemId,
          name: workItemName,
          state: "initialized",
          taskName: attrs.parent?.taskName ?? "unknown",
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "start") {
        state.workItems[workItemId] = {
          ...state.workItems[workItemId],
          state: "started",
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "complete") {
        state.workItems[workItemId] = {
          ...state.workItems[workItemId],
          state: "completed",
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "fail") {
        state.workItems[workItemId] = {
          ...state.workItems[workItemId],
          state: "failed",
          lastChangedAt: span.startedAt,
        };
      } else if (operation === "cancel") {
        state.workItems[workItemId] = {
          ...state.workItems[workItemId],
          state: "canceled",
          lastChangedAt: span.startedAt,
        };
      }
    }
  }

  state.timestamp = targetTimestamp;
  state.sequenceNumber = lastSequence;

  return state;
}
