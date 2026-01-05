import { type Id } from '../../_generated/dataModel'
import {
  EntityNotFoundError,
  InvalidStateTransitionError,
  StructuralIntegrityError,
  ConstraintViolationError,
} from './base'

export class WorkItemNotFoundError extends EntityNotFoundError {
  constructor(workItemId: Id<'tasquencerWorkItems'>) {
    super('WorkItem', workItemId)
  }
}

export class WorkItemInvalidStateError extends InvalidStateTransitionError {
  constructor(
    workItemId: Id<'tasquencerWorkItems'>,
    currentState: string,
    expectedStates: string[],
  ) {
    super('WorkItem', workItemId, currentState, expectedStates)
  }
}

export class WorkItemMissingParentError extends StructuralIntegrityError {
  constructor(workItemName: string) {
    super(`Work item ${workItemName} has no parent`, { workItemName })
  }
}

export class WorkItemAutoTriggerAlreadySetError extends ConstraintViolationError {
  constructor() {
    super('Auto trigger already set - can only set once per activity')
  }
}

export class WorkItemCannotHaveChildrenError extends StructuralIntegrityError {
  constructor(workItemPath: string[]) {
    super("Work item can't have children", { path: workItemPath })
  }
}
