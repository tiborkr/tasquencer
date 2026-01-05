import { type Id } from '../../_generated/dataModel'
import {
  EntityNotFoundError,
  ConfigurationError,
  ConstraintViolationError,
} from './base'

export class TaskNotFoundError extends EntityNotFoundError {
  constructor(taskName: string, workflowId?: Id<'tasquencerWorkflows'>) {
    super(
      'Task',
      workflowId ? `${taskName} in workflow ${workflowId}` : taskName,
    )
  }
}

export class TaskInvalidJoinTypeError extends ConfigurationError {
  constructor(joinType: string) {
    super(`Invalid join type: ${joinType}`, {
      joinType,
      validTypes: ['and', 'xor', 'or'],
    })
  }
}

export class TaskMissingRouterError extends ConfigurationError {
  constructor(taskName: string) {
    super(`Router not set for task ${taskName} with XOR/OR split`, { taskName })
  }
}

export class TaskInvalidRouteError extends ConstraintViolationError {
  constructor(taskName: string, routeType: string) {
    super(`Invalid route type '${routeType}' for task ${taskName}`, {
      taskName,
      routeType,
    })
  }
}

export class TaskMissingLogItemError extends EntityNotFoundError {
  constructor(taskName: string, workflowId: Id<'tasquencerWorkflows'>) {
    super('TaskLogItem', `${taskName} in workflow ${workflowId}`)
  }
}
