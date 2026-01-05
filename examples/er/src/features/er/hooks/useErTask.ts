import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { usePatientSnapshot } from './usePatientSnapshot'

export function useErTask(workItemId: Id<'tasquencerWorkItems'>) {
  const metadataQuery = convexQuery(
    api.workflows.er.api.workItems.getWorkItemMetadataByWorkItemId,
    { workItemId },
  )
  const { data: task } = useSuspenseQuery(metadataQuery)

  const patient = usePatientSnapshot(task?.patientId)

  const canClaimQuery = convexQuery(api.workflows.er.api.permissions.canClaimWorkItem, {
    workItemId,
  })
  const { data: canClaimWorkItem } = useQuery({
    ...canClaimQuery,
    enabled: task?.status === 'pending',
  })

  const startWorkItem = useMutation(api.workflows.er.api.workflow.startWorkItem)
  const completeWorkItem = useMutation(api.workflows.er.api.workflow.completeWorkItem)

  return {
    task,
    patient,
    canClaimWorkItem,
    startWorkItem,
    completeWorkItem,
  }
}
