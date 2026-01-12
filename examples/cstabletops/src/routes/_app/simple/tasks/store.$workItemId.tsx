import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { Suspense, useState } from 'react'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@repo/ui/components/button'
import { Textarea } from '@repo/ui/components/textarea'
import { Label } from '@repo/ui/components/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card'
import { Separator } from '@repo/ui/components/separator'
import {
  ArrowLeft,
  Loader2,
  ListTodo,
  Play,
  ClipboardCheck,
  Send,
  RefreshCw,
} from 'lucide-react'

export const Route = createFileRoute('/_app/simple/tasks/store/$workItemId')({
  component: WorkItemRoute,
})

function WorkItemRoute() {
  const { workItemId } = Route.useParams()
  return (
    <Suspense fallback={<TaskPageSkeleton />}>
      <TaskPageInner workItemId={workItemId as Id<'tasquencerWorkItems'>} />
    </Suspense>
  )
}

function TaskPageInner({
  workItemId,
}: {
  workItemId: Id<'tasquencerWorkItems'>
}) {
  const navigate = useNavigate()
  const [textValue, setTextValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [localStarted, setLocalStarted] = useState(false)

  const contextQuery = convexQuery(api.workflows.cstabletops.api.getWorkItemContext, {
    workItemId,
  })
  const { data } = useSuspenseQuery(contextQuery)

  const metadata = data?.metadata ?? null
  const session = data?.session ?? null
  const card = data?.card ?? null
  const workItem = data?.workItem ?? null
  const workflowVersion = data?.workflowVersion ?? 'v2'

  const taskType = metadata?.payload?.type ?? null
  const isStarted = localStarted || workItem?.state === 'started'

  const isLegacy = taskType === 'respondToInject'
  const supportedTaskType =
    taskType === 'presentCard' ||
    taskType === 'recordResponse' ||
    taskType === 'recordNotes' ||
    taskType === 'chooseOptionalCard'
      ? taskType
      : null

  const startWorkItemV1 = useConvexMutation(api.workflows.cstabletops.api.startWorkItemV1)
  const startWorkItemV2 = useConvexMutation(api.workflows.cstabletops.api.startWorkItemV2)
  const completeWorkItemV1 = useConvexMutation(
    api.workflows.cstabletops.api.completeWorkItemV1,
  )
  const completeWorkItemV2 = useConvexMutation(
    api.workflows.cstabletops.api.completeWorkItemV2,
  )

  const parseErrorMessage = (err: Error): { message: string; isRetryable: boolean; isConflict: boolean } => {
    const rawMessage = err.message || ''

    if (rawMessage.includes('TASK_ALREADY_COMPLETED')) {
      return { message: 'This task was already completed', isRetryable: false, isConflict: true }
    }
    if (rawMessage.includes('WORK_ITEM_NOT_CLAIMED_BY_USER')) {
      return { message: 'This task has been claimed by another user', isRetryable: false, isConflict: true }
    }
    if (
      rawMessage.toLowerCase().includes('network') ||
      rawMessage.toLowerCase().includes('fetch') ||
      rawMessage.toLowerCase().includes('connection') ||
      rawMessage.toLowerCase().includes('timeout')
    ) {
      return { message: 'Unable to save. Please try again.', isRetryable: true, isConflict: false }
    }

    return { message: rawMessage || 'An error occurred', isRetryable: true, isConflict: false }
  }

  const [errorState, setErrorState] = useState<{ message: string; isRetryable: boolean; isConflict: boolean } | null>(null)

  const startMutation = useMutation({
    mutationFn: async (vars: Parameters<typeof startWorkItemV2>[0]) => {
      if (workflowVersion === 'v1') return await startWorkItemV1(vars)
      return await startWorkItemV2(vars)
    },
    onSuccess: () => setLocalStarted(true),
    onError: (err) => {
      const parsed = parseErrorMessage(err)
      setError(parsed.message)
      setErrorState(parsed)
      if (parsed.isConflict) {
        setTimeout(() => window.location.reload(), 2000)
      }
    },
  })

  const completeMutation = useMutation({
    mutationFn: async (vars: Parameters<typeof completeWorkItemV2>[0]) => {
      if (workflowVersion === 'v1') return await completeWorkItemV1(vars)
      return await completeWorkItemV2(vars)
    },
    onSuccess: () => navigate({ to: '/simple/queue' }),
    onError: (err) => {
      const parsed = parseErrorMessage(err)
      setError(parsed.message)
      setErrorState(parsed)
      if (parsed.isConflict) {
        setTimeout(() => window.location.reload(), 2000)
      }
    },
  })

  const handleStart = () => {
    setError(null)
    setErrorState(null)
    if (!supportedTaskType) return
    startMutation.mutate({ workItemId, args: { name: supportedTaskType } })
  }

  const handleComplete = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setErrorState(null)

    if (!supportedTaskType) return

    if (supportedTaskType === 'presentCard') {
      completeMutation.mutate({ workItemId, args: { name: supportedTaskType } })
      return
    }

    if (supportedTaskType === 'chooseOptionalCard') {
      setError('Use the buttons below to include or skip the optional card.')
      return
    }

    const trimmed = textValue.trim()
    if (!trimmed) {
      setError('Please enter a value')
      return
    }

    completeMutation.mutate({
      workItemId,
      args:
        supportedTaskType === 'recordResponse'
          ? { name: supportedTaskType, payload: { response: trimmed } }
          : { name: supportedTaskType, payload: { notes: trimmed } },
    })
  }

  const handleOptionalChoice = (include: boolean) => {
    setError(null)
    setErrorState(null)
    completeMutation.mutate({
      workItemId,
      args: { name: 'chooseOptionalCard', payload: { include } },
    })
  }

  const isPending = startMutation.isPending || completeMutation.isPending

  const cardTitle = (() => {
    if (card?.title) return card.title
    if (!metadata?.payload) return 'Card'
    switch (metadata.payload.type) {
      case 'chooseOptionalCard':
        return metadata.payload.optionalCardTitle
      case 'presentCard':
      case 'recordResponse':
      case 'recordNotes':
        return metadata.payload.cardTitle
      default:
        return 'Card'
    }
  })()

  const pageTitle =
    taskType === 'presentCard'
      ? 'Present Card'
      : taskType === 'recordResponse'
        ? 'Record Response'
        : taskType === 'recordNotes'
          ? 'Record Notes'
          : taskType === 'chooseOptionalCard'
            ? 'Optional Card'
            : taskType === 'respondToInject'
              ? 'Legacy Task'
            : 'Task'

  return (
    <div className="p-6 lg:p-8 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {pageTitle}
              </h1>
              <p className="text-sm text-muted-foreground">
                {session ? session.title : 'Unknown session'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/simple/queue">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Work Queue
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/simple">
              <ListTodo className="mr-2 h-4 w-4" />
              Sessions
            </Link>
          </Button>
        </div>
      </div>

      <Separator />

      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/30 px-6 py-5">
            <div>
              <CardTitle className="text-lg">
                {taskType === 'chooseOptionalCard' ? 'Optional' : ''}
                {metadata?.payload && 'cardOrder' in metadata.payload
                  ? `Card ${metadata.payload.cardOrder}: `
                  : ''}
                {cardTitle}
              </CardTitle>
              <CardDescription className="text-sm">
                {isStarted
                  ? 'Complete this task to advance the exercise'
                  : 'Claim this task to begin'}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-2">
                <p className="text-sm text-destructive">{error}</p>
                {errorState?.isConflict && (
                  <p className="text-xs text-muted-foreground">Refreshing page...</p>
                )}
                {errorState?.isRetryable && !errorState?.isConflict && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.reload()}
                    className="mt-2"
                  >
                    <RefreshCw className="mr-2 h-3 w-3" />
                    Refresh & Retry
                  </Button>
                )}
              </div>
            )}

            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm whitespace-pre-wrap">
                {isLegacy && data?.legacy
                  ? data.legacy.injectPrompt
                  : card?.body ?? 'No card content available.'}
              </p>
            </div>

            {!isStarted ? (
              <Button
                onClick={handleStart}
                disabled={isPending || !metadata || !supportedTaskType}
                className="w-full"
                size="lg"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Claiming...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    {isLegacy ? 'Legacy task (cannot start)' : 'Claim & Start'}
                  </>
                )}
              </Button>
            ) : (
              <>
                {taskType === 'chooseOptionalCard' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleOptionalChoice(true)}
                    >
                      Include
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => handleOptionalChoice(false)}
                    >
                      Skip
                    </Button>
                  </div>
                ) : taskType === 'presentCard' ? (
                  <form onSubmit={handleComplete}>
                    <Button
                      type="submit"
                      disabled={isPending}
                      className="w-full"
                      size="lg"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Completing...
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" />
                          Mark as Presented
                        </>
                      )}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleComplete} className="space-y-4">
                    {taskType === 'recordNotes' && metadata?.payload?.type === 'recordNotes' ? (
                      <div className="rounded-lg border p-4 space-y-2">
                        <div className="text-sm font-medium">
                          Discussion questions
                        </div>
                        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                          {metadata.payload.questions.map((q) => (
                            <li key={q}>{q}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {taskType === 'recordResponse' &&
                    metadata?.payload?.type === 'recordResponse' ? (
                      <div className="rounded-lg border p-4 text-sm">
                        <div className="font-medium mb-1">Prompt</div>
                        <div className="text-muted-foreground whitespace-pre-wrap">
                          {metadata.payload.prompt}
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label htmlFor="textValue">
                        {taskType === 'recordNotes' ? 'Notes' : 'Response'}
                      </Label>
                      <Textarea
                        id="textValue"
                        value={textValue}
                        onChange={(e) => setTextValue(e.target.value)}
                        rows={8}
                        placeholder={
                          taskType === 'recordNotes'
                            ? 'Capture key discussion points, decisions, and follow-ups...'
                            : 'Think out loud: who do you call, what do you check, what do you decide?'
                        }
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={isPending}
                      className="w-full"
                      size="lg"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" />
                          Submit
                        </>
                      )}
                    </Button>
                  </form>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function TaskPageSkeleton() {
  return (
    <div className="p-6 lg:p-8">
      <div className="animate-pulse space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-8 w-56 bg-muted rounded" />
            <div className="h-4 w-80 bg-muted rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-28 bg-muted rounded" />
            <div className="h-9 w-28 bg-muted rounded" />
          </div>
        </div>
        <div className="h-px bg-muted" />
        <div className="h-96 bg-muted rounded-lg" />
      </div>
    </div>
  )
}
