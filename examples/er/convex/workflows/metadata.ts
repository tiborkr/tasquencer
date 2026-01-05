import { makeGetWorkflowStructureQuery } from "@repo/tasquencer";

import { erPatientJourneyVersionManager } from "./er/definition";

export const { getWorkflowStructure, genericGetWorkflowStructure } =
  makeGetWorkflowStructureQuery([erPatientJourneyVersionManager]);
