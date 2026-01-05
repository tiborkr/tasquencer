import { greetingWorkflow } from './workflows/greeting.workflow'
import { versionManagerFor } from '../../tasquencer'

export const greetingVersionManager = versionManagerFor('greeting')
  .registerVersion('v1', greetingWorkflow)
  .build()
