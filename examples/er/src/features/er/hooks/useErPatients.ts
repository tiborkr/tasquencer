import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { api } from '@/convex/_generated/api'
import type { Doc } from '@/convex/_generated/dataModel'

export function useErPatients(): Doc<'erPatients'>[] {
  const listPatientsQuery = convexQuery(
    api.workflows.er.api.patients.listAllPatients,
    {},
  )
  const { data } = useSuspenseQuery(listPatientsQuery)
  return data
}
