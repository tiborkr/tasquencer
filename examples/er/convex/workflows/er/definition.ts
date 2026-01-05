import { versionManagerFor } from '../../tasquencer'
import { erPatientJourneyWorkflow } from './workflows/erPatientJourney.workflow'

export const erPatientJourneyVersionManager = versionManagerFor(
  'erPatientJourney',
)
  .registerVersion('v1', erPatientJourneyWorkflow)
  .build()
