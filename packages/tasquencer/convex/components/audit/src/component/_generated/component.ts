/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    api: {
      computeWorkflowSnapshot: FunctionReference<
        "mutation",
        "internal",
        { retryCount?: number; timestamp: number; traceId: string },
        null,
        Name
      >;
      flushTracePayload: FunctionReference<
        "mutation",
        "internal",
        { spans: Array<any>; trace?: any },
        null,
        Name
      >;
      getAuditContext: FunctionReference<
        "query",
        "internal",
        { workflowId: string },
        {
          _creationTime: number;
          _id: string;
          context: any;
          createdAt: number;
          traceId: string;
          traceMetadata?: any;
          workflowId: string;
        } | null,
        Name
      >;
      getChildSpans: FunctionReference<
        "query",
        "internal",
        { parentSpanId: string; traceId: string },
        Array<{
          _creationTime: number;
          _id: string;
          attributes?:
            | {
                parent?: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workflow";
                versionName: string;
                workflowId?: string;
                workflowName: string;
              }
            | {
                generation: number;
                inputConditions?: Array<{ marking: number; name: string }>;
                joinSatisfied?: boolean;
                joinType?: string;
                outputConditions?: Array<string>;
                splitType?: string;
                state?: string;
                type: "task";
                versionName: string;
                workflowId: string;
              }
            | {
                delta: number;
                newMarking: number;
                oldMarking: number;
                operation: "incrementMarking" | "decrementMarking";
                type: "condition";
                workflowId: string;
              }
            | {
                parent: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workItem";
                versionName: string;
                workflowId: string;
              }
            | {
                activityName: string;
                data?: any;
                type: "activity";
                workflowId: string;
              }
            | { payload: any; type: "custom" };
          causationId?: string;
          depth: number;
          duration?: number;
          endedAt?: number;
          error?: any;
          events?: any;
          operation: string;
          operationType: string;
          parentSpanId?: string;
          path: Array<string>;
          resourceId?: string;
          resourceName?: string;
          resourceType?: string;
          sequenceNumber?: number;
          spanId: string;
          startedAt: number;
          state: "started" | "completed" | "failed" | "canceled";
          traceId: string;
        }>,
        Name
      >;
      getChildWorkflowInstances: FunctionReference<
        "query",
        "internal",
        {
          taskName: string;
          timestamp: number;
          traceId: string;
          workflowName?: string;
        },
        Array<{
          endedAt?: number;
          generation: number;
          startedAt: number;
          state: string;
          workflowId: string;
          workflowName: string;
        }>,
        Name
      >;
      getKeyEvents: FunctionReference<
        "query",
        "internal",
        { traceId: string },
        Array<{
          category: "workflow" | "task" | "condition" | "workItem" | "error";
          depth: number;
          description: string;
          spanId: string;
          timestamp: number;
          type: string;
          workflowName?: string;
        }>,
        Name
      >;
      getRootSpans: FunctionReference<
        "query",
        "internal",
        { traceId: string },
        Array<{
          _creationTime: number;
          _id: string;
          attributes?:
            | {
                parent?: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workflow";
                versionName: string;
                workflowId?: string;
                workflowName: string;
              }
            | {
                generation: number;
                inputConditions?: Array<{ marking: number; name: string }>;
                joinSatisfied?: boolean;
                joinType?: string;
                outputConditions?: Array<string>;
                splitType?: string;
                state?: string;
                type: "task";
                versionName: string;
                workflowId: string;
              }
            | {
                delta: number;
                newMarking: number;
                oldMarking: number;
                operation: "incrementMarking" | "decrementMarking";
                type: "condition";
                workflowId: string;
              }
            | {
                parent: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workItem";
                versionName: string;
                workflowId: string;
              }
            | {
                activityName: string;
                data?: any;
                type: "activity";
                workflowId: string;
              }
            | { payload: any; type: "custom" };
          causationId?: string;
          depth: number;
          duration?: number;
          endedAt?: number;
          error?: any;
          events?: any;
          operation: string;
          operationType: string;
          parentSpanId?: string;
          path: Array<string>;
          resourceId?: string;
          resourceName?: string;
          resourceType?: string;
          sequenceNumber?: number;
          spanId: string;
          startedAt: number;
          state: "started" | "completed" | "failed" | "canceled";
          traceId: string;
        }>,
        Name
      >;
      getSpansByResource: FunctionReference<
        "query",
        "internal",
        { resourceId: string; resourceType: string },
        Array<{
          _creationTime: number;
          _id: string;
          attributes?:
            | {
                parent?: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workflow";
                versionName: string;
                workflowId?: string;
                workflowName: string;
              }
            | {
                generation: number;
                inputConditions?: Array<{ marking: number; name: string }>;
                joinSatisfied?: boolean;
                joinType?: string;
                outputConditions?: Array<string>;
                splitType?: string;
                state?: string;
                type: "task";
                versionName: string;
                workflowId: string;
              }
            | {
                delta: number;
                newMarking: number;
                oldMarking: number;
                operation: "incrementMarking" | "decrementMarking";
                type: "condition";
                workflowId: string;
              }
            | {
                parent: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workItem";
                versionName: string;
                workflowId: string;
              }
            | {
                activityName: string;
                data?: any;
                type: "activity";
                workflowId: string;
              }
            | { payload: any; type: "custom" };
          causationId?: string;
          depth: number;
          duration?: number;
          endedAt?: number;
          error?: any;
          events?: any;
          operation: string;
          operationType: string;
          parentSpanId?: string;
          path: Array<string>;
          resourceId?: string;
          resourceName?: string;
          resourceType?: string;
          sequenceNumber?: number;
          spanId: string;
          startedAt: number;
          state: "started" | "completed" | "failed" | "canceled";
          traceId: string;
        }>,
        Name
      >;
      getSpansByTimeRange: FunctionReference<
        "query",
        "internal",
        { endTime: number; startTime: number; traceId: string },
        Array<{
          _creationTime: number;
          _id: string;
          attributes?:
            | {
                parent?: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workflow";
                versionName: string;
                workflowId?: string;
                workflowName: string;
              }
            | {
                generation: number;
                inputConditions?: Array<{ marking: number; name: string }>;
                joinSatisfied?: boolean;
                joinType?: string;
                outputConditions?: Array<string>;
                splitType?: string;
                state?: string;
                type: "task";
                versionName: string;
                workflowId: string;
              }
            | {
                delta: number;
                newMarking: number;
                oldMarking: number;
                operation: "incrementMarking" | "decrementMarking";
                type: "condition";
                workflowId: string;
              }
            | {
                parent: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workItem";
                versionName: string;
                workflowId: string;
              }
            | {
                activityName: string;
                data?: any;
                type: "activity";
                workflowId: string;
              }
            | { payload: any; type: "custom" };
          causationId?: string;
          depth: number;
          duration?: number;
          endedAt?: number;
          error?: any;
          events?: any;
          operation: string;
          operationType: string;
          parentSpanId?: string;
          path: Array<string>;
          resourceId?: string;
          resourceName?: string;
          resourceType?: string;
          sequenceNumber?: number;
          spanId: string;
          startedAt: number;
          state: "started" | "completed" | "failed" | "canceled";
          traceId: string;
        }>,
        Name
      >;
      getTrace: FunctionReference<
        "query",
        "internal",
        { traceId: string },
        {
          _creationTime: number;
          _id: string;
          attributes?:
            | {
                payload?: any;
                type: "workflow";
                versionName: string;
                workflowId: string;
                workflowName: string;
              }
            | { payload?: any; type: "custom" };
          correlationId?: string;
          endedAt?: number;
          initiatorType?: "user" | "system" | "scheduled";
          initiatorUserId?: string;
          metadata?: any;
          name: string;
          startedAt: number;
          state: "running" | "completed" | "failed" | "canceled";
          traceId: string;
        } | null,
        Name
      >;
      getTraceSpans: FunctionReference<
        "query",
        "internal",
        { traceId: string },
        Array<{
          _creationTime: number;
          _id: string;
          attributes?:
            | {
                parent?: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workflow";
                versionName: string;
                workflowId?: string;
                workflowName: string;
              }
            | {
                generation: number;
                inputConditions?: Array<{ marking: number; name: string }>;
                joinSatisfied?: boolean;
                joinType?: string;
                outputConditions?: Array<string>;
                splitType?: string;
                state?: string;
                type: "task";
                versionName: string;
                workflowId: string;
              }
            | {
                delta: number;
                newMarking: number;
                oldMarking: number;
                operation: "incrementMarking" | "decrementMarking";
                type: "condition";
                workflowId: string;
              }
            | {
                parent: {
                  taskGeneration: number;
                  taskName: string;
                  workflowId: string;
                };
                payload?: any;
                state?: string;
                type: "workItem";
                versionName: string;
                workflowId: string;
              }
            | {
                activityName: string;
                data?: any;
                type: "activity";
                workflowId: string;
              }
            | { payload: any; type: "custom" };
          causationId?: string;
          depth: number;
          duration?: number;
          endedAt?: number;
          error?: any;
          events?: any;
          operation: string;
          operationType: string;
          parentSpanId?: string;
          path: Array<string>;
          resourceId?: string;
          resourceName?: string;
          resourceType?: string;
          sequenceNumber?: number;
          spanId: string;
          startedAt: number;
          state: "started" | "completed" | "failed" | "canceled";
          traceId: string;
        }>,
        Name
      >;
      getWorkflowSnapshots: FunctionReference<
        "query",
        "internal",
        { traceId: string },
        Array<{
          _creationTime: number;
          _id: string;
          sequenceNumber: number;
          state: any;
          timestamp: number;
          traceId: string;
          workflowId: string;
        }>,
        Name
      >;
      getWorkflowStateAtTime: FunctionReference<
        "query",
        "internal",
        { timestamp: number; traceId: string; workflowId?: string },
        {
          conditions: Record<
            string,
            { lastChangedAt: number; marking: number; name: string }
          >;
          sequenceNumber: number;
          tasks: Record<
            string,
            {
              generation: number;
              lastChangedAt: number;
              name: string;
              state:
                | "disabled"
                | "enabled"
                | "started"
                | "completed"
                | "failed"
                | "canceled";
            }
          >;
          timestamp: number;
          workItems: Record<
            string,
            {
              id: string;
              lastChangedAt: number;
              name: string;
              state:
                | "initialized"
                | "started"
                | "completed"
                | "failed"
                | "canceled";
              taskName: string;
            }
          >;
          workflow: {
            name: string;
            state:
              | "initialized"
              | "started"
              | "completed"
              | "failed"
              | "canceled";
          };
        } | null,
        Name
      >;
      listRecentTraces: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          attributes?:
            | {
                payload?: any;
                type: "workflow";
                versionName: string;
                workflowId: string;
                workflowName: string;
              }
            | { payload?: any; type: "custom" };
          correlationId?: string;
          endedAt?: number;
          initiatorType?: "user" | "system" | "scheduled";
          initiatorUserId?: string;
          metadata?: any;
          name: string;
          startedAt: number;
          state: "running" | "completed" | "failed" | "canceled";
          traceId: string;
        }>,
        Name
      >;
      removeAuditContext: FunctionReference<
        "mutation",
        "internal",
        { workflowId: string },
        null,
        Name
      >;
      saveAuditContext: FunctionReference<
        "mutation",
        "internal",
        {
          data: {
            context: {
              causationId?: string;
              correlationId?: string;
              depth: number;
              parentSpanId?: string;
              path: Array<string>;
              traceId: string;
            };
            traceId: string;
            traceMetadata?: any;
          };
          workflowId: string;
        },
        null,
        Name
      >;
    };
  };
