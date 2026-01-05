export abstract class TasquencerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      stack: this.stack,
    }
  }
}

export abstract class TasquencerInvariantError extends TasquencerError {
  constructor(
    message: string,
    code: string,
    context?: Record<string, unknown>,
  ) {
    super(message, code, context)
  }
}

export class EntityNotFoundError extends TasquencerInvariantError {
  constructor(
    entityType: string,
    identifier: string | Record<string, unknown>,
  ) {
    super(`${entityType} not found`, 'ENTITY_NOT_FOUND', {
      entityType,
      identifier,
    })
  }
}

export class InvalidStateTransitionError extends TasquencerInvariantError {
  constructor(
    entityType: string,
    entityId: string,
    currentState: string,
    expectedStates: string[],
  ) {
    super(
      `${entityType} ${entityId} is in state '${currentState}', expected one of: ${expectedStates.join(', ')}`,
      'INVALID_STATE_TRANSITION',
      { entityType, entityId, currentState, expectedStates },
    )
  }
}

export class ConfigurationError extends TasquencerInvariantError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', context)
  }
}

export class StructuralIntegrityError extends TasquencerInvariantError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'STRUCTURAL_INTEGRITY_ERROR', context)
  }
}

export class DataIntegrityError extends TasquencerInvariantError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'DATA_INTEGRITY_ERROR', context)
  }
}

export class ConstraintViolationError extends TasquencerInvariantError {
  constructor(constraint: string, context?: Record<string, unknown>) {
    super(`Constraint violation: ${constraint}`, 'CONSTRAINT_VIOLATION', {
      constraint,
      ...context,
    })
  }
}

export type BusinessFailureReason = {
  code: string
  message: string
  context?: Record<string, unknown>
}

export class NotInternalMutationError extends TasquencerInvariantError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'NOT_INTERNAL_MUTATION', context)
  }
}
