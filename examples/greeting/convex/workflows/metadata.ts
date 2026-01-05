import { makeGetWorkflowStructureQuery } from '@repo/tasquencer'

import { greetingVersionManager } from './greeting/definition'

export const { getWorkflowStructure, genericGetWorkflowStructure } =
  makeGetWorkflowStructureQuery([greetingVersionManager])
