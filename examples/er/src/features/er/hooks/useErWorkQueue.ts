import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import type { FunctionReference } from 'convex/server'
import { api } from '@/convex/_generated/api'

type WorkQueueResponse =
  typeof api.workflows.er.api.workItems.getAllAvailableTasks extends FunctionReference<
    any,
    any,
    any,
    infer R,
    any
  >
    ? Awaited<R>
    : never

export type WorkQueueTask = WorkQueueResponse extends Array<infer T> ? T : never

export function useErWorkQueue(): WorkQueueTask[] {
  const workQueueQuery = convexQuery(
    api.workflows.er.api.workItems.getAllAvailableTasks,
    {},
  )
  const { data } = useSuspenseQuery(workQueueQuery)
  return data
}
