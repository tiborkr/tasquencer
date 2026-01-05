import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import type { Id } from '@/convex/_generated/dataModel'
import { SpinningLoader } from '@/components/spinning-loader'
import { PatientJourneyPage } from '@/features/er/components/patient-journey'

export const Route = createFileRoute('/_app/er/$patientId')({
  component: PatientJourneyRoute,
  params: {
    parse: ({ patientId }) => ({
      patientId: patientId as Id<'erPatients'>,
    }),
  },
})

function PatientJourneyRoute() {
  const { patientId } = Route.useParams()
  return (
    <Suspense fallback={<SpinningLoader />}>
      <PatientJourneyPage patientId={patientId} />
    </Suspense>
  )
}
