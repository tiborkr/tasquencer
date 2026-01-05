import {
  getAuditService,
  setAuditServiceEnabled,
} from "../../components/audit/src/client/service";
import { type Id } from "../../_generated/dataModel";
import { type MutationCtx } from "../../_generated/server";
import { type AuditContext } from "../../components/audit/src/shared/context";
import { getSpanBuffer } from "../../components/audit/src/client/buffer";
import {
  type WorkflowSpanAttributes,
  type TaskSpanAttributes,
  type ConditionSpanAttributes,
  type WorkItemSpanAttributes,
  type ActivitySpanAttributes,
  type SpanAttributes,
  type WorkflowTraceAttributes,
} from "../../components/audit/src/shared/attributeSchemas";
import type { ComponentApi } from "../../components/audit/src/component/_generated/component";
import { createFunctionHandle } from "convex/server";

export async function makeAuditFunctionHandles(component: ComponentApi) {
  const [
    getAuditContext,
    saveAuditContext,
    getTrace,
    flushTracePayload,
    computeWorkflowSnapshot,
  ] = await Promise.all([
    createFunctionHandle(component.api.getAuditContext),
    createFunctionHandle(component.api.saveAuditContext),
    createFunctionHandle(component.api.getTrace),
    createFunctionHandle(component.api.flushTracePayload),
    createFunctionHandle(component.api.computeWorkflowSnapshot),
  ]);
  return {
    getAuditContext,
    saveAuditContext,
    getTrace,
    flushTracePayload,
    computeWorkflowSnapshot,
  };
}

export type AuditFunctionHandles = Awaited<
  ReturnType<typeof makeAuditFunctionHandles>
>;

/**
 * Tasquencer-specific audit integration helpers.
 *
 * This module provides utilities for automatically instrumenting
 * Tasquencer workflows, tasks, and work items with audit traces.
 */

export type TasquencerAuditConfig = {
  enabled: boolean;
  autoFlush: boolean;
  includePayloads: boolean;
};

export type AuditCallbackInfo = {
  context: AuditContext | null;
  spanId: string | null;
};

export function buildAuditInfo(
  context: AuditContext | null,
  spanId: string | null
): AuditCallbackInfo {
  return { context, spanId };
}

export function auditInfoFromSpan(
  fallbackContext: AuditContext | null,
  fallbackSpanId: string | null,
  span?: { spanId: string; context: AuditContext } | null
): AuditCallbackInfo {
  if (span && span.spanId) {
    return { context: span.context, spanId: span.spanId };
  }
  return buildAuditInfo(fallbackContext, fallbackSpanId);
}

// Global config (can be overridden per workflow)
let globalConfig: TasquencerAuditConfig = {
  enabled: true,
  autoFlush: true,
  includePayloads: false, // For security, don't include payloads by default
};

export function setAuditConfig(config: Partial<TasquencerAuditConfig>): void {
  globalConfig = { ...globalConfig, ...config };
  // Update service enabled state
  setAuditServiceEnabled(globalConfig.enabled);
}

export function getAuditConfig(): TasquencerAuditConfig {
  return { ...globalConfig };
}

/**
 * Start a trace for a root workflow
 * Uses workflowId as traceId for easy correlation
 */
export function startWorkflowTrace(args: {
  workflowName: string;
  workflowId: Id<"tasquencerWorkflows">;
  workflowVersionName?: string;
  correlationId?: string;
  initiatorUserId?: string;
  payload?: unknown;
}): AuditContext {
  const auditService = getAuditService();

  // Use workflowId as traceId for easy lookup
  const traceId = args.workflowId;

  // Create strongly typed workflow trace attributes
  const attributes: WorkflowTraceAttributes = {
    type: "workflow",
    workflowId: args.workflowId.toString(),
    workflowName: args.workflowName,
    versionName: args.workflowVersionName ?? "v1",
    ...(globalConfig.includePayloads && args.payload
      ? { payload: args.payload }
      : {}),
  };

  const context = auditService.startTraceWithId({
    traceId,
    name: `workflow:${args.workflowName}`,
    correlationId: args.correlationId,
    initiatorType: args.initiatorUserId ? "user" : "system",
    initiatorUserId: args.initiatorUserId,
    attributes,
    // Keep metadata for backward compatibility (deprecated)
    metadata: {
      workflowId: args.workflowId,
      workflowName: args.workflowName,
      workflowVersionName: args.workflowVersionName,
      ...(globalConfig.includePayloads && args.payload
        ? { payload: args.payload }
        : {}),
    },
  });

  return context;
}

/**
 * Save audit context to database for cross-mutation access
 */
export async function saveAuditContext(
  ctx: MutationCtx,
  auditFunctionHandles: AuditFunctionHandles,
  workflowId: Id<"tasquencerWorkflows">,
  context: AuditContext
): Promise<void> {
  const auditService = getAuditService();
  if (!auditService.isEnabled()) {
    return;
  }

  // Get trace metadata from buffer
  const { trace } = auditService.getBufferedTrace(context.traceId);

  const data = {
    traceId: context.traceId,
    context: context,
    traceMetadata: trace || undefined,
  };

  await ctx.runMutation(auditFunctionHandles.saveAuditContext, {
    workflowId,
    data,
  });
}

/**
 * Load audit context from database and set it in the service
 * Also restores trace metadata to buffer
 *
 * IMPORTANT: Resets depth to 0 because each API call is a new mutation boundary.
 * Depth should only increase for operations within the same mutation.
 *
 * Returns a dummy context when audit is disabled or context not found.
 */
export async function loadAuditContext(
  ctx: MutationCtx,
  auditFunctionHandles: AuditFunctionHandles,
  workflowId: Id<"tasquencerWorkflows">
): Promise<AuditContext> {
  const auditService = getAuditService();
  if (!auditService.isEnabled()) {
    // Return dummy context when disabled
    return { traceId: "noop", depth: 0, path: [] };
  }

  const stored = await ctx.runQuery(auditFunctionHandles.getAuditContext, {
    workflowId: workflowId.toString(),
  });

  if (stored) {
    const context = stored.context as AuditContext;
    const traceMetadata = stored.traceMetadata;

    const buffer = getSpanBuffer();

    // Restore trace metadata to buffer (critical for flush!)
    if (traceMetadata && traceMetadata.traceId) {
      buffer.setTrace(traceMetadata);
    }

    // Reset depth to 0 for new mutation boundary while preserving trace correlation
    // Each API endpoint call should start fresh at depth 0
    return {
      ...context,
      depth: 0,
      parentSpanId: undefined,
      path: [],
    };
  }

  // Attempt recovery from persisted trace when context is missing
  const trace = await ctx.runQuery(auditFunctionHandles.getTrace, {
    traceId: workflowId,
  });

  if (trace) {
    const recoveredContext: AuditContext = {
      traceId: trace.traceId,
      correlationId: trace.correlationId,
      depth: 0,
      path: [],
    };

    // Persist recovered context for future calls
    await saveAuditContext(
      ctx,
      auditFunctionHandles,
      workflowId,
      recoveredContext
    );

    // Restore trace metadata to buffer
    const buffer = getSpanBuffer();
    buffer.setTrace(trace);

    return recoveredContext;
  }

  // As a last resort, create a new trace so downstream operations can continue
  const workflow = await ctx.db.get(workflowId);
  const fallbackTraceId = workflowId as string;
  const newContext = getAuditService().startTraceWithId({
    traceId: fallbackTraceId,
    name: `workflow:${workflow?.name ?? "unknown"}`,
  });

  await saveAuditContext(ctx, auditFunctionHandles, workflowId, newContext);
  return { ...newContext, depth: 0, path: [] };
}

/**
 * Schedule trace flush
 * Persists buffered trace to durable storage before scheduling
 * Safe to call from any context (mutations, actions, scheduled functions)
 */
export async function scheduleTraceFlush(
  ctx: MutationCtx,
  auditFunctionHandles: AuditFunctionHandles,
  traceId: string
): Promise<void> {
  const auditService = getAuditService();
  if (!auditService.isEnabled() || !globalConfig.autoFlush) {
    return;
  }
  const { trace, spans } = auditService.getBufferedTrace(traceId);

  if (!trace && spans.length === 0) {
    return;
  }

  // Schedule flush BEFORE clearing buffer to ensure all spans are captured
  await ctx.scheduler.runAfter(0, auditFunctionHandles.flushTracePayload, {
    trace,
    spans,
  });

  // Clear buffer AFTER scheduling to avoid losing spans created during flush scheduling
  auditService.clearBufferedTrace(traceId);

  // Preserve trace metadata so subsequent spans within the same mutation
  // continue to have trace context until the flush completes.
  if (trace) {
    const buffer = getSpanBuffer();
    buffer.setTrace(trace);
  }
}

/**
 * Create a span for a workflow operation
 */
export function createWorkflowSpan(args: {
  operation: string;
  workflowId?: Id<"tasquencerWorkflows">;
  workflowName: string;
  versionName: string;
  state?: string;
  payload?: unknown;
  parent?: {
    workflowId: Id<"tasquencerWorkflows">;
    taskName: string;
    taskGeneration: number;
  };
  parentContext: AuditContext;
}): { spanId: string; context: AuditContext } {
  const auditService = getAuditService();

  const attributes: WorkflowSpanAttributes = {
    type: "workflow",
    workflowId: args.workflowId,
    workflowName: args.workflowName,
    versionName: args.versionName,
    state: args.state,
    parent: args.parent,
    ...(globalConfig.includePayloads && args.payload
      ? { payload: args.payload }
      : {}),
  };

  const result = auditService.startSpan({
    operation: `Workflow.${args.operation}`,
    operationType: "workflow",
    resourceType: "workflow",
    resourceId: args.workflowId,
    resourceName: args.workflowName,
    attributes,
    context: args.parentContext,
  });

  return result;
}

/**
 * Create a span for a task operation
 */
export function createTaskSpan(args: {
  operation: string;
  taskName: string;
  workflowId: Id<"tasquencerWorkflows">;
  versionName: string;
  generation: number;
  state?: string;
  joinType?: string;
  splitType?: string;
  joinSatisfied?: boolean;
  inputConditions?: Array<{ name: string; marking: number }>;
  outputConditions?: string[];
  parentContext: AuditContext;
}): { spanId: string; context: AuditContext } {
  const auditService = getAuditService();

  const attributes: TaskSpanAttributes = {
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

  const result = auditService.startSpan({
    operation: `Task.${args.operation}`,
    operationType: "task",
    resourceType: "task",
    resourceId: `${args.workflowId}:${args.taskName}`,
    resourceName: args.taskName,
    attributes,
    context: args.parentContext,
  });

  return result;
}

/**
 * Create a span for a work item operation
 */
export function createWorkItemSpan(args: {
  operation: string;
  workItemId: Id<"tasquencerWorkItems">;
  workItemName: string;
  workflowId: Id<"tasquencerWorkflows">;
  versionName: string;
  state?: string;
  payload?: unknown;
  parent: {
    workflowId: Id<"tasquencerWorkflows">;
    taskName: string;
    taskGeneration: number;
  };
  parentContext: AuditContext;
}): { spanId: string; context: AuditContext } {
  const auditService = getAuditService();

  const attributes: WorkItemSpanAttributes = {
    type: "workItem",
    workflowId: args.workflowId,
    parent: args.parent,
    versionName: args.versionName,
    state: args.state,
    ...(globalConfig.includePayloads && args.payload
      ? { payload: args.payload }
      : {}),
  };

  const result = auditService.startSpan({
    operation: `WorkItem.${args.operation}`,
    operationType: "workItem",
    resourceType: "workItem",
    resourceId: args.workItemId,
    resourceName: args.workItemName,
    attributes,
    context: args.parentContext,
  });

  return result;
}

/**
 * Create a NON-ADOPTING span for a workflow activity callback
 * Activities are leaf spans that don't wrap subsequent operations
 */
export function createWorkflowActivitySpan(args: {
  activityName: string;
  workflowId: Id<"tasquencerWorkflows">;
  workflowName: string;
  parentContext: AuditContext;
}): { spanId: string; context: AuditContext } {
  const auditService = getAuditService();

  const attributes: ActivitySpanAttributes = {
    type: "activity",
    workflowId: args.workflowId,
    activityName: args.activityName,
  };

  const result = auditService.startSpan({
    operation: `WorkflowActivity.${args.activityName}`,
    operationType: "workflow_activity",
    resourceType: "workflow",
    resourceId: args.workflowId,
    resourceName: args.workflowName,
    attributes,
    context: args.parentContext,
  });

  // DO NOT adopt context - activities should not wrap operations
  return result;
}

/**
 * Create a NON-ADOPTING span for a task activity callback
 * Activities are leaf spans that don't wrap subsequent operations
 */
export function createTaskActivitySpan(args: {
  activityName: string;
  taskName: string;
  workflowId: Id<"tasquencerWorkflows">;
  parentContext: AuditContext;
}): { spanId: string; context: AuditContext } {
  const auditService = getAuditService();

  const attributes: ActivitySpanAttributes = {
    type: "activity",
    workflowId: args.workflowId,
    activityName: args.activityName,
  };

  const result = auditService.startSpan({
    operation: `TaskActivity.${args.activityName}`,
    operationType: "task_activity",
    resourceType: "task",
    resourceId: `${args.workflowId}:${args.taskName}`,
    resourceName: args.taskName,
    attributes,
    context: args.parentContext,
  });

  // DO NOT adopt context - activities should not wrap operations
  return result;
}

/**
 * Create a NON-ADOPTING span for a work item activity callback
 * Activities are leaf spans that don't wrap subsequent operations
 */
export function createWorkItemActivitySpan(args: {
  activityName: string;
  workItemId: Id<"tasquencerWorkItems">;
  workItemName: string;
  workflowId: Id<"tasquencerWorkflows">;
  parentContext: AuditContext;
}): { spanId: string; context: AuditContext } {
  const auditService = getAuditService();

  const attributes: ActivitySpanAttributes = {
    type: "activity",
    workflowId: args.workflowId,
    activityName: args.activityName,
  };

  const result = auditService.startSpan({
    operation: `WorkItemActivity.${args.activityName}`,
    operationType: "workItem_activity",
    resourceType: "workItem",
    resourceId: args.workItemId,
    resourceName: args.workItemName,
    attributes,
    context: args.parentContext,
  });

  // DO NOT adopt context - activities should not wrap operations
  return result;
}

/**
 * @deprecated Use createTaskActivitySpan, createWorkItemActivitySpan, or createWorkflowActivitySpan instead
 * Create a span for an activity callback
 */
export function createActivitySpan(args: {
  activityName: string;
  taskName: string;
  workflowId: Id<"tasquencerWorkflows">;
  parentContext: AuditContext;
}): { spanId: string; context: AuditContext } {
  const auditService = getAuditService();

  const attributes: ActivitySpanAttributes = {
    type: "activity",
    workflowId: args.workflowId,
    activityName: args.activityName,
  };

  const result = auditService.startSpan({
    operation: `Activity.${args.activityName}`,
    operationType: "activity",
    resourceType: "task",
    resourceId: `${args.workflowId}:${args.taskName}`,
    resourceName: args.taskName,
    attributes,
    context: args.parentContext,
  });

  return result;
}

/**
 * Create a span for an action
 */
export function createActionSpan(args: {
  actionName: string;
  workItemName: string;
  workItemId?: Id<"tasquencerWorkItems">;
  payload?: unknown;
  parentContext: AuditContext;
}): { spanId: string; context: AuditContext } {
  const auditService = getAuditService();

  const attributes: SpanAttributes = {
    type: "custom",
    payload: {
      actionName: args.actionName,
      ...(globalConfig.includePayloads && args.payload
        ? { payload: args.payload }
        : {}),
    },
  };

  const result = auditService.startSpan({
    operation: `Action.${args.actionName}`,
    operationType: "action",
    resourceType: "workItem",
    resourceId: args.workItemId,
    resourceName: args.workItemName,
    attributes,
    context: args.parentContext,
  });

  return result;
}

/**
 * Complete a span
 */
export function completeSpan(
  traceId: string,
  spanId: string,
  attributes?: SpanAttributes
): void {
  const auditService = getAuditService();
  auditService.completeSpan(traceId, spanId, { attributes });
}

/**
 * Fail a span
 */
export function failSpan(
  traceId: string,
  spanId: string,
  error: Error,
  attributes?: SpanAttributes
): void {
  const auditService = getAuditService();
  auditService.failSpan(traceId, spanId, { error, attributes });
}

/**
 * Cancel a span
 */
export function cancelSpan(
  traceId: string,
  spanId: string,
  attributes?: SpanAttributes
): void {
  const auditService = getAuditService();
  auditService.cancelSpan(traceId, spanId, { attributes });
}

/**
 * Add event to a span
 */
export function addAuditEvent(
  traceId: string,
  spanId: string,
  eventName: string,
  data?: Record<string, unknown>
): void {
  const auditService = getAuditService();
  auditService.addEvent(traceId, spanId, { name: eventName, data });
}

/**
 * Update trace state on workflow completion/failure/cancellation
 */
export function updateTraceState(
  traceId: string,
  state: "running" | "completed" | "failed" | "canceled"
): void {
  const auditService = getAuditService();
  auditService.updateTraceState(traceId, state);
}

/**
 * Start a trace for a business operation that will contain workflow(s)
 * Returns context to pass to initializeRootWorkflow
 */
export function startBusinessTrace(args: {
  name: string;
  correlationId?: string;
  initiatorUserId?: string;
  metadata?: Record<string, unknown>;
}): AuditContext {
  const auditService = getAuditService();
  return auditService.startTrace({
    name: args.name,
    correlationId: args.correlationId,
    initiatorType: args.initiatorUserId ? "user" : "system",
    initiatorUserId: args.initiatorUserId,
    metadata: args.metadata,
  });
}

/**
 * Create a span for condition marking changes
 * This shows token flow in the Petri net
 */
export function createConditionMarkingSpan(args: {
  operation: "incrementMarking" | "decrementMarking";
  conditionName: string;
  workflowId: Id<"tasquencerWorkflows">;
  oldMarking: number;
  newMarking: number;
  parentContext: AuditContext;
}): { spanId: string; context: AuditContext } {
  const auditService = getAuditService();

  const attributes: ConditionSpanAttributes = {
    type: "condition",
    workflowId: args.workflowId,
    operation: args.operation,
    oldMarking: args.oldMarking,
    newMarking: args.newMarking,
    delta: args.newMarking - args.oldMarking,
  };

  const result = auditService.startSpan({
    operation: `Condition.${args.operation}`,
    operationType: "condition",
    resourceType: "condition",
    resourceId: `${args.workflowId}:${args.conditionName}`,
    resourceName: args.conditionName,
    attributes,
    context: args.parentContext,
  });

  return result;
}

/**
 * Complete a condition marking span
 */
export function completeConditionMarkingSpan(
  traceId: string,
  spanResult: ReturnType<typeof createConditionMarkingSpan>
): void {
  completeSpan(traceId, spanResult.spanId);
}

/**
 * Schedule snapshot computation after major workflow events
 */
export async function scheduleSnapshotComputation(
  ctx: MutationCtx,
  auditFunctionHandles: AuditFunctionHandles,
  traceId: string,
  timestamp: number
): Promise<void> {
  const auditService = getAuditService();
  if (!auditService.isEnabled()) return;
  const buffered = auditService.getBufferedTrace(traceId);

  // Ensure we flush the latest buffer for this trace before snapshotting
  await ctx.scheduler.runAfter(0, auditFunctionHandles.flushTracePayload, {
    trace: buffered.trace,
    spans: buffered.spans,
  });

  // Schedule snapshot after the flush job with initial retry count
  await ctx.scheduler.runAfter(
    1,
    auditFunctionHandles.computeWorkflowSnapshot,
    {
      traceId,
      timestamp,
      retryCount: 0,
    }
  );
}
