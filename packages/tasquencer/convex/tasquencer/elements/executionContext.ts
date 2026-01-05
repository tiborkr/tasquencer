import type { MutationCtx } from "../../_generated/server";
import type { AuditContext } from "../../components/audit/src/shared/context";
import type { SpanAttributes } from "../../components/audit/src/shared/attributeSchemas";
import type { WorkflowExecutionMode } from "../types";
import { withSpan } from "../../components/audit/src/client/helpers";
import {
  assertExecutionContextExists,
  assertSpanIdExists,
} from "../exceptions/helpers";
import {
  createActionAuditInfo,
  createActivityAuditInfo,
} from "./helpers/auditHelpers";
import { type Id } from "../../_generated/dataModel";
import {
  type AuditFunctionHandles,
  createWorkflowActivitySpan,
} from "../audit/integration";

type InitialExecutionContextContext = {
  mutationCtx: MutationCtx;
  auditContext: AuditContext;
  auditFunctionHandles: AuditFunctionHandles;
  executionMode: WorkflowExecutionMode;
  isInternalMutation: boolean;
  spanId?: string | null;
};

type ExecutionContextContext = {
  parent: ExecutionContext | null;
  mutationCtx: MutationCtx;
  auditContext: AuditContext;
  auditFunctionHandles: AuditFunctionHandles;
  executionMode: WorkflowExecutionMode;
  isInternalMutation: boolean;
  spanId: string | null;
};

export class ExecutionContext {
  static make(initialContext: InitialExecutionContextContext) {
    return new ExecutionContext({
      parent: null,
      spanId: initialContext.spanId ?? null,
      ...initialContext,
    });
  }
  private constructor(private readonly context: ExecutionContextContext) {}

  get mutationCtx() {
    return this.context.mutationCtx;
  }

  get auditContext() {
    return this.context.auditContext;
  }

  get maybeSpanId() {
    return this.context.spanId;
  }

  get spanId() {
    const spanId = this.context.spanId;
    assertSpanIdExists(spanId, "spanId");
    return spanId;
  }

  get executionMode() {
    return this.context.executionMode;
  }

  get isInternalMutation() {
    return this.context.isInternalMutation;
  }

  get parent() {
    const parent = this.context.parent;
    assertExecutionContextExists(parent, "parent");
    return parent;
  }

  get auditFunctionHandles() {
    return this.context.auditFunctionHandles;
  }

  extend(context: Partial<ExecutionContextContext>) {
    return new ExecutionContext({
      ...this.context,
      ...context,
      parent: this,
    });
  }

  withSpan<T>(
    args: {
      operation: string;
      operationType: string;
      resourceType?: string;
      resourceId?: string;
      resourceName?: string;
      attributes?: SpanAttributes;
    },
    fn: (executionContext: ExecutionContext) => Promise<T>
  ): Promise<T> {
    return withSpan(args, this.auditContext, (spanId, childContext) => {
      return fn(
        this.extend({
          spanId,
          auditContext: childContext,
        })
      );
    });
  }

  createActionAuditInfo() {
    return createActionAuditInfo(
      this.parent?.auditContext,
      this.auditContext,
      this.maybeSpanId
    );
  }

  createActivityAuditInfo(
    activitySpan: {
      spanId: string;
      context: AuditContext;
    } | null
  ) {
    return createActivityAuditInfo(
      this.parent?.auditContext,
      this.auditContext,
      this.spanId,
      activitySpan
    );
  }

  createWorkflowActivitySpan(args: {
    activityName: string;
    workflowId: Id<"tasquencerWorkflows">;
    workflowName: string;
  }) {
    return createWorkflowActivitySpan({
      ...args,
      parentContext: this.auditContext,
    });
  }
}
