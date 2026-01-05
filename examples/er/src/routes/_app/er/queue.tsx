import { createFileRoute } from '@tanstack/react-router'
import { WorkQueuePage } from '@/features/er/components/work-queue'

export const Route = createFileRoute('/_app/er/queue')({
  component: WorkQueuePage,
})
