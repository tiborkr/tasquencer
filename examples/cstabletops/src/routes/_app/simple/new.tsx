import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { Suspense, useEffect, useState } from 'react'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { api } from '@/convex/_generated/api'
import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import { Label } from '@repo/ui/components/label'
import { Badge } from '@repo/ui/components/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card'
import { cn } from '@repo/ui/lib/utils'
import {
  PlusCircle,
  ArrowLeft,
  ListTodo,
  Loader2,
  Clock,
  Shield,
  Target,
  FileText,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react'

export const Route = createFileRoute('/_app/simple/new')({
  component: () => (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <NewSession />
    </Suspense>
  ),
})

type ExerciseKey =
  | 'quick_fix'
  | 'malware_infection'
  | 'unplanned_attack'
  | 'cloud_compromise'
  | 'financial_break_in'
  | 'flood_zone'

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

function getDifficultyColor(difficulty: string): string {
  switch (difficulty) {
    case 'beginner':
      return 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
    case 'intermediate':
      return 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5'
    case 'advanced':
      return 'border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5'
    default:
      return ''
  }
}

function NewSession() {
  const navigate = useNavigate()

  const capabilitiesQuery = convexQuery(api.workflows.cstabletops.api.getUserCapabilities, {})
  const { data: capabilities } = useSuspenseQuery(capabilitiesQuery)
  const canCreateSessions = capabilities?.canCreateSessions ?? false

  const exercisesQuery = convexQuery(api.workflows.cstabletops.api.getExercises, {})
  const { data: exercises } = useSuspenseQuery(exercisesQuery)

  const defaultExerciseKey = (exercises[0]?.key ?? 'quick_fix') as ExerciseKey
  const [exerciseKey, setExerciseKey] = useState<ExerciseKey>(defaultExerciseKey)
  const [title, setTitle] = useState('New tabletop session')
  const [error, setError] = useState<string | null>(null)

  const selectedExercise = exercises.find((e) => e.key === exerciseKey) ?? exercises[0] ?? null

  useEffect(() => {
    if (!selectedExercise) return
    setTitle(selectedExercise.title)
  }, [selectedExercise])

  const initializeMutation = useMutation({
    mutationFn: useConvexMutation(api.workflows.cstabletops.api.initializeRootWorkflow),
    onSuccess: () => {
      navigate({ to: '/simple/queue' })
    },
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Please enter a session title')
      return
    }

    initializeMutation.mutate({
      payload: {
        title: trimmedTitle,
        exerciseKey,
      },
    })
  }

  if (!canCreateSessions) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <h1 className="text-lg font-semibold">Access Denied</h1>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/simple">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Sessions
            </Link>
          </Button>
        </div>

        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Facilitator Access Required</CardTitle>
            <CardDescription>
              Only facilitators can create new tabletop exercise sessions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              If you need to participate in a session, ask a facilitator to share a join code with you.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/simple/join">
                Join Existing Session
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PlusCircle className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">New Session</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/simple">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Sessions
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/simple/queue">
              <ListTodo className="mr-2 h-4 w-4" />
              Work Queue
            </Link>
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Choose an exercise</CardTitle>
            <CardDescription>
              Select a scenario to run with your team. Each exercise tests different
              incident response capabilities.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {exercises.map((ex) => (
                <button
                  key={ex.key}
                  type="button"
                  onClick={() => setExerciseKey(ex.key as ExerciseKey)}
                  className={cn(
                    'text-left p-4 rounded-lg border-2 transition-all',
                    'hover:border-primary/50 hover:bg-accent/50',
                    exerciseKey === ex.key
                      ? 'border-primary bg-accent'
                      : 'border-border bg-card',
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold">{ex.title}</h3>
                    {exerciseKey === ex.key && (
                      <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{ex.summary}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant="outline"
                      className={getDifficultyColor(ex.metadata.difficulty)}
                    >
                      {ex.metadata.difficulty}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(ex.metadata.durationMinutes)}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <FileText className="h-3 w-3" />
                      {ex.cardCount} cards
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {selectedExercise && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Exercise details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Target className="h-4 w-4" />
                    Threat Actor
                  </div>
                  <p className="text-sm">{selectedExercise.metadata.threatActor}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Shield className="h-4 w-4" />
                    Impacted Assets
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedExercise.metadata.impactedAssets.map((asset) => (
                      <Badge key={asset} variant="secondary" className="text-xs">
                        {asset}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-muted-foreground">
                  CIS Controls Tested
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedExercise.metadata.cisControls.map((control) => (
                    <Badge key={control} variant="outline" className="text-xs">
                      {control}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Session details</CardTitle>
            <CardDescription>
              Give your session a name to help identify it later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="title">Session title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value)
                    if (error) setError(null)
                  }}
                  placeholder="e.g., Q1 Security Training"
                />
              </div>

              <Button
                type="submit"
                disabled={initializeMutation.isPending}
                className="w-full"
                size="lg"
              >
                {initializeMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Create Session
                  </>
                )}
              </Button>

              {(error || initializeMutation.isError) && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                  <p className="text-sm text-destructive">
                    {error || 'Failed to create session. Please try again.'}
                  </p>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
