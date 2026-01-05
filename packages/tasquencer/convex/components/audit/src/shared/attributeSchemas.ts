/**
 * Convex validators and TypeScript types for audit span and trace attributes.
 *
 * This module defines discriminated unions of attribute types that can be
 * attached to audit spans and traces. Each attribute type has a `type` field that acts
 * as the discriminator, enabling both runtime validation at the database layer
 * and compile-time type narrowing in TypeScript.
 *
 * The discriminated union pattern provides:
 * - Database-level validation through Convex validators
 * - Type-safe attribute access through TypeScript discriminated unions
 * - Extensibility through the "custom" attribute type for general-purpose use
 */

import { v, type Infer } from "convex/values";

// ============================================================================
// TRACE ATTRIBUTES
// ============================================================================

/**
 * Workflow trace attributes
 *
 * Used for traces that represent workflow execution.
 * Contains the essential metadata to identify and reconstruct workflow state.
 *
 * @example
 * ```typescript
 * const attributes: WorkflowTraceAttributes = {
 *   type: "workflow",
 *   workflowId: "j12345...",
 *   workflowName: "erPatientJourney",
 *   versionName: "v1",
 *   payload: { patientId: "123", ... },
 * }
 * ```
 */
export const workflowTraceAttributes = v.object({
  type: v.literal("workflow"),
  workflowId: v.string(), // Stored as string in buffer, converted to ID when persisted
  workflowName: v.string(),
  versionName: v.string(),
  payload: v.optional(v.any()),
});

/**
 * Custom trace attributes
 *
 * Escape hatch for general-purpose audit traces that don't fit the standard patterns.
 * This allows the audit layer to remain flexible for use cases beyond the core
 * tasquencer engine (e.g., business process traces, custom operations).
 *
 * @example
 * ```typescript
 * const attributes: CustomTraceAttributes = {
 *   type: "custom",
 *   payload: {
 *     operationType: "businessProcess",
 *     customField1: "value",
 *     // ... any structure
 *   },
 * }
 * ```
 */
export const customTraceAttributes = v.object({
  type: v.literal("custom"),
  payload: v.optional(v.any()),
});

/**
 * Discriminated union of all trace attribute types
 *
 * This validator enforces that trace attributes must be one of the defined types
 * at the database layer. Convex will reject any traces with attributes that don't
 * match one of these validators.
 */
export const traceAttributes = v.union(
  workflowTraceAttributes,
  customTraceAttributes
);

// TypeScript types derived from Convex validators
export type WorkflowTraceAttributes = Infer<typeof workflowTraceAttributes>;
export type CustomTraceAttributes = Infer<typeof customTraceAttributes>;
export type TraceAttributes = Infer<typeof traceAttributes>;

// ============================================================================
// SPAN ATTRIBUTES
// ============================================================================

/**
 * Workflow span attributes
 *
 * Used for spans that represent workflow operations (initialize, start, complete, etc.)
 *
 * @example
 * ```typescript
 * const attributes: WorkflowSpanAttributes = {
 *   type: "workflow",
 *   workflowId: "j12345...",
 *   workflowName: "patientAdmission",
 *   versionName: "v1",
 *   state: "starting",
 * }
 * ```
 */
export const workflowSpanAttributes = v.object({
  type: v.literal("workflow"),
  workflowId: v.optional(v.string()),
  workflowName: v.string(),
  versionName: v.string(),
  parent: v.optional(
    v.object({
      workflowId: v.string(),
      taskName: v.string(),
      taskGeneration: v.number(),
    })
  ),
  state: v.optional(v.string()),
  payload: v.optional(v.any()),
});

/**
 * Task span attributes
 *
 * Used for spans that represent task operations (initialize, enable, start, complete, etc.)
 *
 * @example
 * ```typescript
 * const attributes: TaskSpanAttributes = {
 *   type: "task",
 *   workflowId: "j12345...",
 *   generation: 1,
 *   state: "enabled",
 *   versionName: "v1",
 * }
 * ```
 */
export const taskSpanAttributes = v.object({
  type: v.literal("task"),
  workflowId: v.string(),
  generation: v.number(),
  state: v.optional(v.string()),
  joinType: v.optional(v.string()),
  splitType: v.optional(v.string()),
  joinSatisfied: v.optional(v.boolean()),
  inputConditions: v.optional(
    v.array(
      v.object({
        name: v.string(),
        marking: v.number(),
      })
    )
  ),
  outputConditions: v.optional(v.array(v.string())),
  versionName: v.string(),
});

/**
 * Condition span attributes
 *
 * Used for spans that represent condition marking changes (increment/decrement tokens)
 * These are critical for state reconstruction as they track token flow in the Petri net.
 *
 * @example
 * ```typescript
 * const attributes: ConditionSpanAttributes = {
 *   type: "condition",
 *   workflowId: "j12345...",
 *   operation: "incrementMarking",
 *   oldMarking: 0,
 *   newMarking: 1,
 *   delta: 1,
 * }
 * ```
 */
export const conditionSpanAttributes = v.object({
  type: v.literal("condition"),
  workflowId: v.string(),
  operation: v.union(
    v.literal("incrementMarking"),
    v.literal("decrementMarking")
  ),
  oldMarking: v.number(),
  newMarking: v.number(),
  delta: v.number(),
});

/**
 * Work item span attributes
 *
 * Used for spans that represent work item operations (initialize, start, complete, etc.)
 *
 * @example
 * ```typescript
 * const attributes: WorkItemSpanAttributes = {
 *   type: "workItem",
 *   workflowId: "j12345...",
 *   parent: {
 *     workflowId: "j12345...",
 *     taskName: "reviewPatient",
 *     taskGeneration: 1,
 *   },
 *   state: "started",
 *   versionName: "v1",
 * }
 * ```
 */
export const workItemSpanAttributes = v.object({
  type: v.literal("workItem"),
  workflowId: v.string(),
  parent: v.object({
    workflowId: v.string(),
    taskName: v.string(),
    taskGeneration: v.number(),
  }),
  state: v.optional(v.string()),
  versionName: v.string(),
  payload: v.optional(v.any()),
});

/**
 * Activity span attributes
 *
 * Used for spans that represent activity callbacks (onEnabled, onStarted, etc.)
 * Activities are non-adopting spans (leaf nodes) that don't wrap subsequent operations.
 *
 * @example
 * ```typescript
 * const attributes: ActivitySpanAttributes = {
 *   type: "activity",
 *   workflowId: "j12345...",
 *   activityName: "onEnabled",
 *   data: { additionalContext: "..." },
 * }
 * ```
 */
export const activitySpanAttributes = v.object({
  type: v.literal("activity"),
  workflowId: v.string(),
  activityName: v.string(),
  data: v.optional(v.any()),
});

/**
 * Custom span attributes
 *
 * Escape hatch for general-purpose audit spans that don't fit the standard patterns.
 * This allows the audit layer to remain flexible for use cases beyond the core
 * tasquencer engine.
 *
 * @example
 * ```typescript
 * const attributes: CustomSpanAttributes = {
 *   type: "custom",
 *   payload: {
 *     customField1: "value",
 *     customField2: 123,
 *     // ... any structure
 *   },
 * }
 * ```
 */
export const customSpanAttributes = v.object({
  type: v.literal("custom"),
  payload: v.any(),
});

/**
 * Discriminated union of all span attribute types
 *
 * This validator enforces that attributes must be one of the defined types at the
 * database layer. Convex will reject any spans with attributes that don't match
 * one of these validators.
 */
export const spanAttributes = v.union(
  workflowSpanAttributes,
  taskSpanAttributes,
  conditionSpanAttributes,
  workItemSpanAttributes,
  activitySpanAttributes,
  customSpanAttributes
);

// TypeScript types derived from Convex validators
export type WorkflowSpanAttributes = Infer<typeof workflowSpanAttributes>;
export type TaskSpanAttributes = Infer<typeof taskSpanAttributes>;
export type ConditionSpanAttributes = Infer<typeof conditionSpanAttributes>;
export type WorkItemSpanAttributes = Infer<typeof workItemSpanAttributes>;
export type ActivitySpanAttributes = Infer<typeof activitySpanAttributes>;
export type CustomSpanAttributes = Infer<typeof customSpanAttributes>;
export type SpanAttributes = Infer<typeof spanAttributes>;
