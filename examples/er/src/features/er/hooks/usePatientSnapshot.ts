import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { api } from '@/convex/_generated/api'
import type { Doc, Id } from '@/convex/_generated/dataModel'

export function usePatientSnapshot(
  patientId: Id<'erPatients'> | undefined,
): Doc<'erPatients'> | null {
  if (!patientId) {
    return null
  }

  const patientQuery = convexQuery(
    api.workflows.er.api.patients.getPatientById,
    {
      patientId,
    },
  )
  const { data } = useSuspenseQuery(patientQuery)
  return data ?? null
}
