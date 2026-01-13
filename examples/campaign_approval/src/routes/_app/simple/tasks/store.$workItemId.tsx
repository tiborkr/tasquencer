import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { Suspense, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useConvexMutation } from '@convex-dev/react-query'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@repo/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card'
import { Separator } from '@repo/ui/components/separator'
import {
  FileEdit,
  ArrowLeft,
  Check,
  Loader2,
  ListTodo,
  Play,
  Send,
} from 'lucide-react'

export const Route = createFileRoute('/_app/simple/tasks/store/$workItemId')({
  component: SubmitRequestTask,
})

/**
 * UI for the submitRequest work item
 * This is the first task in Phase 1: Initiation
 * User confirms their campaign request for intake review
 */
function SubmitRequestTask() {
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
  const [error, setError] = useState<string | null>(null)
  const [isStarted, setIsStarted] = useState(false)

  const startMutation = useMutation({
    mutationFn: useConvexMutation(
      api.workflows.campaign_approval.api.startWorkItem,
    ),
    onSuccess: () => {
      setIsStarted(true)
    },
    onError: (err) => {
      setError(err.message || 'Failed to start work item')
    },
  })

  const completeMutation = useMutation({
    mutationFn: useConvexMutation(
      api.workflows.campaign_approval.api.completeWorkItem,
    ),
    onSuccess: () => {
      navigate({ to: '/simple' })
    },
    onError: (err) => {
      setError(err.message || 'Failed to complete work item')
    },
  })

  const handleStart = () => {
    setError(null)
    startMutation.mutate({
      workItemId,
      args: { name: 'submitRequest' },
    })
  }

  const handleComplete = () => {
    setError(null)
    completeMutation.mutate({
      workItemId,
      args: {
        name: 'submitRequest',
        payload: { confirmed: true },
      },
    })
  }

  const isPending = startMutation.isPending || completeMutation.isPending

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileEdit className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Submit Campaign Request
              </h1>
              <p className="text-sm text-muted-foreground">
                {isStarted
                  ? 'Confirm your campaign request for review'
                  : 'Claim this task to get started'}
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
              All Campaigns
            </Link>
          </Button>
        </div>
      </div>

      <Separator />

      {/* Task Card - Centered */}
      <div className="max-w-lg mx-auto">
        {!isStarted ? (
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/30 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                  <Play className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Claim Work Item</CardTitle>
                  <CardDescription className="text-sm">
                    This task is waiting to be claimed
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {error && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}

                <div className="rounded-lg border bg-muted/30 p-4">
                  <h4 className="text-sm font-medium mb-2">
                    What happens when you claim?
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium flex-shrink-0">
                        1
                      </span>
                      <span>The task is assigned to you</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium flex-shrink-0">
                        2
                      </span>
                      <span>Review and confirm your campaign request</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium flex-shrink-0">
                        3
                      </span>
                      <span>The campaign moves to intake review</span>
                    </li>
                  </ul>
                </div>

                <Button
                  onClick={handleStart}
                  disabled={isPending}
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
                      Claim & Start
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/30 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Confirm Submission</CardTitle>
                  <CardDescription className="text-sm">
                    Submit your campaign request for intake review
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {error && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}

                <div className="rounded-lg border bg-muted/30 p-4">
                  <h4 className="text-sm font-medium mb-2">
                    By confirming, you agree that:
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>Your campaign details are accurate and complete</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>The request will be reviewed by the marketing team</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>You may be asked to provide additional information</span>
                    </li>
                  </ul>
                </div>

                <Button
                  onClick={handleComplete}
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
                      <Check className="mr-2 h-4 w-4" />
                      Confirm & Submit
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function TaskPageSkeleton() {
  return (
    <div className="p-6 lg:p-8">
      <div className="animate-pulse space-y-8">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-4 w-72 bg-muted rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-28 bg-muted rounded" />
            <div className="h-9 w-32 bg-muted rounded" />
          </div>
        </div>
        <div className="h-px bg-muted" />
        <div className="max-w-lg mx-auto">
          <div className="h-80 bg-muted rounded-lg" />
        </div>
      </div>
    </div>
  )
}
