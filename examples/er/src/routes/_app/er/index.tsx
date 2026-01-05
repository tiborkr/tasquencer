import { createFileRoute } from '@tanstack/react-router'
import { PatientListPage } from '@/features/er/components/patient-list'

export const Route = createFileRoute('/_app/er/')({
  component: PatientListPage,
})
