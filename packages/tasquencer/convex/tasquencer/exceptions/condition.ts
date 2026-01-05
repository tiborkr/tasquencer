import { EntityNotFoundError } from './base'

export class ConditionNotFoundError extends EntityNotFoundError {
  constructor(conditionName: string, workflowName?: string) {
    super(
      'Condition',
      workflowName
        ? `${conditionName} in workflow ${workflowName}`
        : conditionName,
    )
  }
}
