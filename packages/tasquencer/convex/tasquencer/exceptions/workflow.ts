import { type Id } from '../../_generated/dataModel'
import {
  EntityNotFoundError,
  InvalidStateTransitionError,
  ConfigurationError,
  StructuralIntegrityError,
} from './base'

export class WorkflowNotFoundError extends EntityNotFoundError {
  constructor(workflowId: Id<'tasquencerWorkflows'>) {
    super('Workflow', workflowId)
  }
}

export class WorkflowInvalidStateError extends InvalidStateTransitionError {
  constructor(
    workflowId: Id<'tasquencerWorkflows'>,
    currentState: string,
    expectedStates: string[],
  ) {
    super('Workflow', workflowId, currentState, expectedStates)
  }
}

export class WorkflowMissingStartConditionError extends ConfigurationError {
  constructor(workflowName: string) {
    super(`Start condition not found for workflow ${workflowName}`, {
      workflowName,
    })
  }
}

export class WorkflowMissingEndConditionError extends ConfigurationError {
  constructor(workflowName: string) {
    super(`End condition not found for workflow ${workflowName}`, {
      workflowName,
    })
  }
}

export class WorkflowMissingParentError extends StructuralIntegrityError {
  constructor(workflowId: Id<'tasquencerWorkflows'>) {
    super(`Workflow ${workflowId} has no parent but parent is required`, {
      workflowId,
    })
  }
}

export class WorkflowDeprecatedError extends ConfigurationError {
  constructor(workflowName: string) {
    super(`Workflow ${workflowName} is deprecated`, {
      workflowName,
    })
  }
}

export class WorkflowMigrationNotFoundError extends EntityNotFoundError {
  constructor(workflowId: Id<'tasquencerWorkflows'>) {
    super('WorkflowMigration', workflowId)
  }
}
