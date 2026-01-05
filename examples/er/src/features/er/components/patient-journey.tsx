import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import type { Id, Doc } from '@/convex/_generated/dataModel'
import { api } from '@/convex/_generated/api'
import { SpinningLoader } from '@/components/spinning-loader'
import { PatientDashboard } from '@/features/er/components/patient-dashboard'
import { TriageView } from '@/features/er/components/triage-view'
import { DiagnosticsView } from '@/features/er/components/diagnostics-view'
import { EmergencySurgeryView } from '@/features/er/components/emergency-surgery-view'
import { HospitalStayView } from '@/features/er/components/hospital-stay-view'
import { ReviewView } from '@/features/er/components/review-view'
import { ConsultationView } from '@/features/er/components/consultation-view'
import { TreatmentView } from '@/features/er/components/treatment-view'
import { DischargedView } from '@/features/er/components/discharged-view'
import type { TaskMetadata, PatientJourneyDetails } from '@/types/er'

type TaskState =
  | 'disabled'
  | 'enabled'
  | 'started'
  | 'completed'
  | 'failed'
  | 'canceled'

type PatientStatus =
  | 'triage'
  | 'diagnostics'
  | 'emergency_surgery'
  | 'hospital_stay'
  | 'review'
  | 'consultation'
  | 'treatment'
  | 'discharged'

type JourneyDataContextValue = {
  patient: Doc<'erPatients'>
  taskStates: Record<string, TaskState> | null
  setTaskStates: (value: Record<string, TaskState>) => void
  hospitalStayTaskStates: Record<string, TaskState> | null
  setHospitalStayTaskStates: (value: Record<string, TaskState>) => void
  humanTasks: TaskMetadata[] | null
  setHumanTasks: (value: TaskMetadata[]) => void
  journeyDetails: PatientJourneyDetails | null
  setJourneyDetails: (value: PatientJourneyDetails) => void
}

const JourneyDataContext = createContext<JourneyDataContextValue | null>(null)

function normalizeTaskStateMap(
  data: Record<string, TaskState | undefined> | null | undefined,
): Record<string, TaskState> {
  if (!data) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      (value ?? 'disabled') as TaskState,
    ]),
  )
}

function JourneyDataProvider({
  patient,
  children,
}: {
  patient: Doc<'erPatients'>
  children: ReactNode
}) {
  const [taskStates, setTaskStatesState] = useState<Record<
    string,
    TaskState
  > | null>(null)
  const [hospitalStayTaskStates, setHospitalStayTaskStatesState] =
    useState<Record<string, TaskState> | null>(null)
  const [humanTasks, setHumanTasksState] = useState<TaskMetadata[] | null>(null)
  const [journeyDetails, setJourneyDetailsState] =
    useState<PatientJourneyDetails | null>(null)

  const setTaskStates = useCallback((value: Record<string, TaskState>) => {
    setTaskStatesState(value)
  }, [])

  const setHospitalStayTaskStates = useCallback(
    (value: Record<string, TaskState>) => {
      setHospitalStayTaskStatesState(value)
    },
    [],
  )

  const setHumanTasks = useCallback((value: TaskMetadata[]) => {
    setHumanTasksState(value)
  }, [])

  const setJourneyDetails = useCallback((value: PatientJourneyDetails) => {
    setJourneyDetailsState(value)
  }, [])

  const contextValue = useMemo(
    () => ({
      patient,
      taskStates,
      setTaskStates,
      hospitalStayTaskStates,
      setHospitalStayTaskStates,
      humanTasks,
      setHumanTasks,
      journeyDetails,
      setJourneyDetails,
    }),
    [
      patient,
      taskStates,
      setTaskStates,
      hospitalStayTaskStates,
      setHospitalStayTaskStates,
      humanTasks,
      setHumanTasks,
      journeyDetails,
      setJourneyDetails,
    ],
  )

  return (
    <JourneyDataContext.Provider value={contextValue}>
      {children}
    </JourneyDataContext.Provider>
  )
}

function useJourneyDataContext() {
  const context = useContext(JourneyDataContext)
  if (!context) {
    throw new Error('JourneyDataContext not found')
  }
  return context
}

function PatientLoader({ patientId }: { patientId: Id<'erPatients'> }) {
  const patientQuery = convexQuery(
    api.workflows.er.api.patients.getPatientById,
    {
      patientId,
    },
  )
  const { data: patient } = useSuspenseQuery(patientQuery)

  if (!patient) {
    return (
      <JourneyScaffold>
        <div className="text-center text-muted-foreground">
          Patient not found
        </div>
      </JourneyScaffold>
    )
  }

  return (
    <JourneyDataProvider patient={patient}>
      <Suspense fallback={null}>
        <TaskStatesResource workflowId={patient.workflowId} />
      </Suspense>
      <Suspense fallback={null}>
        <HospitalStayTaskStatesResource patientId={patient._id} />
      </Suspense>
      <Suspense fallback={null}>
        <HumanTasksResource patientId={patient._id} />
      </Suspense>
      <Suspense fallback={null}>
        <JourneyDetailsResource patientId={patient._id} />
      </Suspense>
      <PatientJourneyRenderer />
    </JourneyDataProvider>
  )
}

function TaskStatesResource({
  workflowId,
}: {
  workflowId: Id<'tasquencerWorkflows'>
}) {
  const { setTaskStates } = useJourneyDataContext()
  const taskStatesQuery = convexQuery(
    api.workflows.er.api.patients.getPatientJourneyTaskStates,
    { workflowId },
  )
  const { data } = useSuspenseQuery(taskStatesQuery)

  useEffect(() => {
    setTaskStates(
      normalizeTaskStateMap(data as Record<string, TaskState | undefined>),
    )
  }, [data, setTaskStates])

  return null
}

function HospitalStayTaskStatesResource({
  patientId,
}: {
  patientId: Id<'erPatients'>
}) {
  const { setHospitalStayTaskStates } = useJourneyDataContext()
  const hospitalStayTaskStatesQuery = convexQuery(
    api.workflows.er.api.patients.getHospitalStayTaskStates,
    { patientId },
  )
  const { data } = useSuspenseQuery(hospitalStayTaskStatesQuery)

  useEffect(() => {
    setHospitalStayTaskStates(
      normalizeTaskStateMap(data as Record<string, TaskState | undefined>),
    )
  }, [data, setHospitalStayTaskStates])

  return null
}

function HumanTasksResource({ patientId }: { patientId: Id<'erPatients'> }) {
  const { setHumanTasks } = useJourneyDataContext()
  const humanTasksQuery = convexQuery(
    api.workflows.er.api.workItems.getTasksByPatient,
    {
      patientId,
    },
  )
  const { data } = useSuspenseQuery(humanTasksQuery)

  useEffect(() => {
    setHumanTasks(data ?? [])
  }, [data, setHumanTasks])

  return null
}

function JourneyDetailsResource({
  patientId,
}: {
  patientId: Id<'erPatients'>
}) {
  const { setJourneyDetails } = useJourneyDataContext()
  const journeyDetailsQuery = convexQuery(
    api.workflows.er.api.patients.getPatientJourneyDetails,
    { patientId },
  )
  const { data } = useSuspenseQuery(journeyDetailsQuery)

  useEffect(() => {
    if (data) {
      setJourneyDetails(data)
    }
  }, [data, setJourneyDetails])

  return null
}

function PatientJourneyRenderer() {
  const {
    patient,
    taskStates,
    hospitalStayTaskStates,
    humanTasks,
    journeyDetails,
  } = useJourneyDataContext()

  if (
    !taskStates ||
    !hospitalStayTaskStates ||
    !humanTasks ||
    !journeyDetails
  ) {
    return (
      <JourneyScaffold>
        <div className="flex justify-center py-12">
          <SpinningLoader />
        </div>
      </JourneyScaffold>
    )
  }

  const typedTaskStates = taskStates as Record<string, TaskState | undefined>
  const hospitalStayState = typedTaskStates?.hospitalStay
  const performSurgeryState = typedTaskStates?.performSurgery

  const isInHospitalStay =
    hospitalStayState &&
    (hospitalStayState === 'started' || hospitalStayState === 'enabled') &&
    performSurgeryState === 'completed'

  const status = patient.status as PatientStatus | undefined
  const effectiveStatus: PatientStatus | undefined = isInHospitalStay
    ? 'hospital_stay'
    : status

  const payload = {
    patient,
    taskStates,
    humanTasks,
    journeyDetails,
  }

  switch (effectiveStatus) {
    case 'triage':
      return (
        <JourneyScaffold>
          <TriageView {...payload} />
        </JourneyScaffold>
      )
    case 'diagnostics':
      return (
        <JourneyScaffold>
          <DiagnosticsView {...payload} />
        </JourneyScaffold>
      )
    case 'emergency_surgery':
      return (
        <JourneyScaffold>
          <EmergencySurgeryView {...payload} />
        </JourneyScaffold>
      )
    case 'hospital_stay':
      return (
        <JourneyScaffold>
          <HospitalStayView
            patient={patient}
            taskStates={hospitalStayTaskStates ?? {}}
            humanTasks={humanTasks}
            journeyDetails={journeyDetails}
          />
        </JourneyScaffold>
      )
    case 'review':
      return (
        <JourneyScaffold>
          <ReviewView {...payload} />
        </JourneyScaffold>
      )
    case 'consultation':
      return (
        <JourneyScaffold>
          <ConsultationView {...payload} />
        </JourneyScaffold>
      )
    case 'treatment':
      return (
        <JourneyScaffold>
          <TreatmentView {...payload} />
        </JourneyScaffold>
      )
    case 'discharged':
      return (
        <JourneyScaffold>
          <DischargedView {...payload} />
        </JourneyScaffold>
      )
    default:
      return (
        <JourneyScaffold>
          <PatientDashboard {...payload} />
        </JourneyScaffold>
      )
  }
}

export function PatientJourneyPage({
  patientId,
}: {
  patientId: Id<'erPatients'>
}) {
  return (
    <Suspense
      fallback={
        <JourneyScaffold>
          <div className="flex justify-center py-12">
            <SpinningLoader />
          </div>
        </JourneyScaffold>
      }
    >
      <PatientLoader patientId={patientId} />
    </Suspense>
  )
}

function JourneyScaffold({ children }: { children: ReactNode }) {
  return <div className="overflow-y-auto">{children}</div>
}
