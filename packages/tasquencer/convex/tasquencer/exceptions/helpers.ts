import { type Id } from "../../_generated/dataModel";
import {
  EntityNotFoundError,
  NotInternalMutationError,
  StructuralIntegrityError,
} from "./base";
import {
  WorkflowNotFoundError,
  WorkflowInvalidStateError,
  WorkflowDeprecatedError,
  WorkflowMigrationNotFoundError,
} from "./workflow";
import { TaskNotFoundError } from "./task";
import { WorkItemNotFoundError, WorkItemInvalidStateError } from "./workItem";
import { ConditionNotFoundError } from "./condition";
import { Workflow } from "../elements/workflow";
import { ExecutionContext } from "../elements/executionContext";
import type { AuditContext } from "../../components/audit/src/shared/context";
import type { Doc } from "../../_generated/dataModel";

export function assertExists<T>(
  value: T | null | undefined,
  entityType: string,
  identifier: string | Record<string, unknown>
): asserts value is T {
  if (value === null || value === undefined) {
    throw new EntityNotFoundError(entityType, identifier);
  }
}

export function assertWorkflowExists(
  workflow: unknown,
  workflowId: Id<"tasquencerWorkflows">
): asserts workflow is NonNullable<Doc<"tasquencerWorkflows">> {
  if (!workflow) {
    throw new WorkflowNotFoundError(workflowId);
  }
}

export function assertWorkflowState(
  workflow: { state: string; _id: Id<"tasquencerWorkflows"> },
  expectedStates: string[]
) {
  if (!expectedStates.includes(workflow.state)) {
    throw new WorkflowInvalidStateError(
      workflow._id,
      workflow.state,
      expectedStates
    );
  }
}

export function assertTaskExists(
  task: unknown,
  taskName: string,
  workflowId?: Id<"tasquencerWorkflows">
): asserts task is NonNullable<typeof task> {
  if (!task) {
    throw new TaskNotFoundError(taskName, workflowId);
  }
}

export function assertWorkItemExists(
  workItem: unknown,
  workItemId: Id<"tasquencerWorkItems">
): asserts workItem is NonNullable<Doc<"tasquencerWorkItems">> {
  if (!workItem) {
    throw new WorkItemNotFoundError(workItemId);
  }
}

export function assertWorkItemState(
  workItem: { state: string; _id: Id<"tasquencerWorkItems"> },
  expectedStates: string[]
) {
  if (!expectedStates.includes(workItem.state)) {
    throw new WorkItemInvalidStateError(
      workItem._id,
      workItem.state,
      expectedStates
    );
  }
}

export function assertConditionExists(
  condition: unknown,
  conditionName: string,
  workflowName?: string
): asserts condition is NonNullable<typeof condition> {
  if (!condition) {
    throw new ConditionNotFoundError(conditionName, workflowName);
  }
}

export function assertParentExists<T extends { parent?: unknown }>(
  entity: T,
  entityType: string,
  entityId: string
): asserts entity is T & { parent: NonNullable<T["parent"]> } {
  if (!entity.parent) {
    throw new StructuralIntegrityError(
      `${entityType} ${entityId} has no parent but parent is required`,
      { entityType, entityId }
    );
  }
}

export function assertIsInternalMutation(isInternalMutation: boolean) {
  if (!isInternalMutation) {
    throw new NotInternalMutationError("Mutation is not internal");
  }
}

export function assertWorkflowIsNotDeprecated(workflow: Workflow) {
  if (workflow.isVersionDeprecated) {
    throw new WorkflowDeprecatedError(workflow.name);
  }
}

export function assertExecutionContextExists(
  executionContext: ExecutionContext | null,
  executionContextName: string
): asserts executionContext is NonNullable<typeof executionContext> {
  if (!executionContext) {
    throw new StructuralIntegrityError(
      `${executionContextName} is null but is required`,
      { executionContextName }
    );
  }
}

export function assertAuditContextExists(
  auditContext: AuditContext | null,
  auditContextName: string
): asserts auditContext is NonNullable<typeof auditContext> {
  if (!auditContext) {
    throw new StructuralIntegrityError(
      `${auditContextName} is null but is required`,
      { auditContextName }
    );
  }
}

export function assertSpanIdExists(
  spanId: string | null,
  spanIdName: string
): asserts spanId is NonNullable<typeof spanId> {
  if (!spanId) {
    throw new StructuralIntegrityError(
      `${spanIdName} is null but is required`,
      { spanIdName }
    );
  }
}

export function assertWorkflowMigrationExists(
  migration: unknown,
  migrationId: Id<"tasquencerWorkflows">
): asserts migration is NonNullable<typeof migration> {
  if (!migration) {
    throw new WorkflowMigrationNotFoundError(migrationId);
  }
}
