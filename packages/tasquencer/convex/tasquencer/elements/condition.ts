import { BaseTask } from "./baseTask";
import { ConditionToTaskFlow, TaskToConditionFlow } from "./flow";
import { Workflow } from "./workflow";
import { assertWorkflowExists, assertConditionExists } from "../exceptions";
import { validTaskTransitions } from "../types";
import { type Id } from "../../_generated/dataModel";
import {
  createConditionMarkingSpan,
  completeConditionMarkingSpan,
} from "../audit/integration";
import { ExecutionContext } from "./executionContext";

export class Condition {
  readonly incomingFlows = new Set<TaskToConditionFlow>();
  readonly outgoingFlows = new Set<ConditionToTaskFlow>();
  readonly preSet: Record<string, BaseTask> = {};
  readonly postSet: Record<string, BaseTask> = {};
  constructor(
    readonly name: string,
    readonly versionName: string,
    readonly path: string[],
    readonly workflow: Workflow,
    readonly isImplicit: boolean = false
  ) {}

  addIncomingFlow(flow: TaskToConditionFlow) {
    this.incomingFlows.add(flow);
    this.preSet[flow.prevElement.name] = flow.prevElement;
  }

  addOutgoingFlow(flow: ConditionToTaskFlow) {
    this.outgoingFlows.add(flow);
    this.postSet[flow.nextElement.name] = flow.nextElement;
  }

  getPresetElements() {
    return new Set(Object.values(this.preSet));
  }

  getPostsetElements() {
    return new Set(Object.values(this.postSet));
  }

  async initialize(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">,
    isStartCondition: boolean
  ) {
    const workflow = await executionContext.mutationCtx.db.get(workflowId);
    assertWorkflowExists(workflow, workflowId);

    const initialMarking = isStartCondition ? 1 : 0;

    await executionContext.mutationCtx.db.insert("tasquencerConditions", {
      name: this.name,
      path: this.path,
      versionName: this.versionName,
      realizedPath: [...workflow.realizedPath, workflowId],
      workflowId,
      marking: initialMarking,
    });

    const auditContext = executionContext.auditContext;
    // Record initial marking as a span so it appears in state reconstruction
    if (auditContext && initialMarking > 0) {
      const span = createConditionMarkingSpan({
        operation: "incrementMarking",
        conditionName: this.name,
        workflowId,
        oldMarking: 0,
        newMarking: initialMarking,
        parentContext: auditContext,
      });
      completeConditionMarkingSpan(auditContext.traceId, span);
    }
  }

  async enableTasks(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const tasks = Object.values(this.postSet);
    // Sequential execution is required because parallel task enabling with
    // nested sub-workflow initialization can cause race conditions in the
    // test framework (convex-test) where newly inserted documents become
    // inaccessible during parallel async operations within the same mutation.
    // TODO: Revisit in the future to see if the issue was fixed in convex-test
    for (const task of tasks) {
      await task.enableIfInStateThatCanTransitionToEnabled(
        executionContext,
        workflowId
      );
    }
  }

  async getConditionByName(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const condition = await executionContext.mutationCtx.db
      .query("tasquencerConditions")
      .withIndex("by_workflow_id_and_name", (q) =>
        q.eq("workflowId", workflowId).eq("name", this.name)
      )
      .first();
    assertConditionExists(condition, this.name);
    return condition;
  }

  async getMarking(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const condition = await this.getConditionByName(
      executionContext,
      workflowId
    );
    return condition.marking;
  }

  async incrementMarking(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const condition = await this.getConditionByName(
      executionContext,
      workflowId
    );
    const oldMarking = condition.marking;
    const newMarking = oldMarking + 1;

    const spanResult = createConditionMarkingSpan({
      operation: "incrementMarking",
      conditionName: this.name,
      workflowId,
      oldMarking,
      newMarking,
      parentContext: executionContext.auditContext,
    });

    await executionContext.mutationCtx.db.patch(condition._id, {
      marking: newMarking,
    });

    completeConditionMarkingSpan(
      executionContext.auditContext?.traceId ?? "",
      spanResult
    );
  }

  async decrementMarking(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const condition = await this.getConditionByName(
      executionContext,
      workflowId
    );
    const oldMarking = condition.marking;

    // Clamp to 0 to handle XOR/OR join semantics:
    // When a task with XOR/OR join starts, it decrements ALL its input conditions,
    // but only one (or some) of them actually have tokens. The others are already at 0.
    // This is valid Petri Net behavior, not a structural integrity issue.
    const newMarking = Math.max(oldMarking - 1, 0);

    const spanResult = createConditionMarkingSpan({
      operation: "decrementMarking",
      conditionName: this.name,
      workflowId,
      oldMarking,
      newMarking,
      parentContext: executionContext.auditContext,
    });

    await executionContext.mutationCtx.db.patch(condition._id, {
      marking: newMarking,
    });

    if (newMarking === 0) {
      await this.disableTasks(executionContext, workflowId);
    }

    completeConditionMarkingSpan(
      executionContext.auditContext?.traceId ?? "",
      spanResult
    );
  }

  async disableTasks(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const tasks = Object.values(this.postSet);
    await Promise.all(
      tasks.map(async (taskElement) => {
        const task = await taskElement.getTaskByName(
          executionContext,
          workflowId
        );

        if (validTaskTransitions[task.state].has("disabled")) {
          return taskElement.disable(executionContext, workflowId, task);
        }
      })
    );
  }

  async cancel(
    executionContext: ExecutionContext,
    workflowId: Id<"tasquencerWorkflows">
  ) {
    const condition = await this.getConditionByName(
      executionContext,
      workflowId
    );
    const oldMarking = condition.marking;

    // Create span for cancel (marking reset to 0)
    const spanResult = createConditionMarkingSpan({
      operation: "decrementMarking",
      conditionName: this.name,
      workflowId,
      oldMarking,
      newMarking: 0,
      parentContext: executionContext.auditContext,
    });

    await executionContext.mutationCtx.db.patch(condition._id, {
      marking: 0,
    });
    await this.disableTasks(executionContext, workflowId);

    completeConditionMarkingSpan(
      executionContext.auditContext?.traceId ?? "",
      spanResult
    );
  }
}
