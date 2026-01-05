import type {
  WorkflowSpanAttributes,
  TaskSpanAttributes,
  WorkItemSpanAttributes,
  ConditionSpanAttributes,
} from "../../components/audit/src/shared/attributeSchemas";
import type { Id } from "../../_generated/dataModel";

/**
 * Helper functions for constructing properly-typed span attributes.
 * These ensure compile-time type safety and reduce boilerplate.
 */

export function createWorkflowAttributes(args: {
  workflowId?: Id<"tasquencerWorkflows">;
  workflowName: string;
  versionName: string;
  state?: string;
  parent?: {
    workflowId: Id<"tasquencerWorkflows">;
    taskName: string;
    taskGeneration: number;
  };
  payload?: unknown;
}): WorkflowSpanAttributes {
  const base: WorkflowSpanAttributes = {
    type: "workflow",
    workflowId: args.workflowId,
    workflowName: args.workflowName,
    versionName: args.versionName,
    state: args.state,
    parent: args.parent,
  };

  if (args.payload !== undefined) {
    base.payload = args.payload;
  }

  return base;
}

export function createTaskAttributes(args: {
  workflowId: Id<"tasquencerWorkflows">;
  generation: number;
  versionName: string;
  state?: string;
  joinType?: string;
  splitType?: string;
  joinSatisfied?: boolean;
  inputConditions?: Array<{ name: string; marking: number }>;
  outputConditions?: string[];
}): TaskSpanAttributes {
  return {
    type: "task",
    workflowId: args.workflowId,
    generation: args.generation,
    versionName: args.versionName,
    state: args.state,
    joinType: args.joinType,
    splitType: args.splitType,
    joinSatisfied: args.joinSatisfied,
    inputConditions: args.inputConditions,
    outputConditions: args.outputConditions,
  };
}

export function createWorkItemAttributes(args: {
  workflowId: Id<"tasquencerWorkflows">;
  parent: {
    workflowId: Id<"tasquencerWorkflows">;
    taskName: string;
    taskGeneration: number;
  };
  versionName: string;
  state?: string;
  payload?: unknown;
}): WorkItemSpanAttributes {
  const base: WorkItemSpanAttributes = {
    type: "workItem",
    workflowId: args.workflowId,
    parent: args.parent,
    versionName: args.versionName,
    state: args.state,
  };

  if (args.payload !== undefined) {
    base.payload = args.payload;
  }

  return base;
}

export function createConditionAttributes(args: {
  workflowId: Id<"tasquencerWorkflows">;
  operation: "incrementMarking" | "decrementMarking";
  oldMarking: number;
  newMarking: number;
}): ConditionSpanAttributes {
  return {
    type: "condition",
    workflowId: args.workflowId,
    operation: args.operation,
    oldMarking: args.oldMarking,
    newMarking: args.newMarking,
    delta: args.newMarking - args.oldMarking,
  };
}
