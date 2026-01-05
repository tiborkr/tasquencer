import { Condition } from './condition'
import { BaseTask } from './baseTask'

export class ConditionToTaskFlow {
  constructor(
    readonly prevElement: Condition,
    readonly nextElement: BaseTask,
  ) {}
}

export class TaskToConditionFlow {
  constructor(
    readonly prevElement: BaseTask,
    readonly nextElement: Condition,
  ) {}
}
