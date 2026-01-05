import type {
  SpanAttributes,
  WorkflowSpanAttributes,
  TaskSpanAttributes,
  WorkItemSpanAttributes,
  ConditionSpanAttributes,
  ActivitySpanAttributes,
  CustomSpanAttributes,
} from "../../components/audit/src/shared/attributeSchemas";

/**
 * Type guard functions for narrowing discriminated union types.
 * These enable type-safe access to span attributes without unsafe casts.
 */

export function isWorkflowAttributes(
  attrs: SpanAttributes | undefined | null
): attrs is WorkflowSpanAttributes {
  return attrs?.type === "workflow";
}

export function isTaskAttributes(
  attrs: SpanAttributes | undefined | null
): attrs is TaskSpanAttributes {
  return attrs?.type === "task";
}

export function isWorkItemAttributes(
  attrs: SpanAttributes | undefined | null
): attrs is WorkItemSpanAttributes {
  return attrs?.type === "workItem";
}

export function isConditionAttributes(
  attrs: SpanAttributes | undefined | null
): attrs is ConditionSpanAttributes {
  return attrs?.type === "condition";
}

export function isActivityAttributes(
  attrs: SpanAttributes | undefined | null
): attrs is ActivitySpanAttributes {
  return attrs?.type === "activity";
}

export function isCustomAttributes(
  attrs: SpanAttributes | undefined | null
): attrs is CustomSpanAttributes {
  return attrs?.type === "custom";
}
