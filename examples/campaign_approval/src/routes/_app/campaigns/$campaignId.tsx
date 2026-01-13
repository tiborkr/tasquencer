import { createFileRoute, Link } from '@tanstack/react-router'
import { Suspense, useMemo } from 'react'
import { useSuspenseQuery, useMutation } from '@tanstack/react-query'
import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card'
import { Button } from '@repo/ui/components/button'
import { Badge } from '@repo/ui/components/badge'
import { Separator } from '@repo/ui/components/separator'
import {
  ArrowLeft,
  Target,
  Users,
  Calendar,
  DollarSign,
  MessageSquare,
  ListTodo,
  CheckCircle2,
  Circle,
  CircleDot,
  XCircle,
  Loader2,
  Ban,
} from 'lucide-react'
import { useState } from 'react'

export const Route = createFileRoute('/_app/campaigns/$campaignId')({
  component: CampaignDetail,
})

// Workflow phases with their task names for status tracking
const WORKFLOW_PHASES = [
  {
    name: 'Initiation',
    tasks: ['submitRequest', 'intakeReview', 'assignOwner'],
    description: 'Campaign request and intake review',
  },
  {
    name: 'Strategy',
    tasks: ['conductResearch', 'defineMetrics', 'developStrategy', 'createPlan'],
    description: 'Research, KPIs, and planning',
  },
  {
    name: 'Budget',
    tasks: ['developBudget', 'directorApproval', 'executiveApproval', 'secureResources'],
    description: 'Budget development and approval',
  },
  {
    name: 'Creative',
    tasks: ['createBrief', 'developConcepts', 'internalReview', 'reviseAssets', 'legalReview', 'legalRevise', 'finalApproval'],
    description: 'Creative development and review',
  },
  {
    name: 'Technical',
    tasks: ['buildInfra', 'configAnalytics', 'setupMedia', 'qaTest', 'fixIssues'],
    description: 'Technical setup and QA',
  },
  {
    name: 'Launch',
    tasks: ['preLaunchReview', 'addressConcerns', 'launchApproval', 'internalComms'],
    description: 'Pre-launch review and approval',
  },
  {
    name: 'Execution',
    tasks: ['launchCampaign', 'monitorPerformance', 'ongoingOptimization'],
    description: 'Campaign execution and optimization',
  },
  {
    name: 'Closure',
    tasks: ['endCampaign', 'compileData', 'conductAnalysis', 'presentResults', 'archiveMaterials'],
    description: 'Analysis and archival',
  },
]

function CampaignDetail() {
  const { campaignId } = Route.useParams()

  return (
    <Suspense fallback={<CampaignDetailSkeleton />}>
      <CampaignDetailInner campaignId={campaignId as Id<'campaigns'>} />
    </Suspense>
  )
}

function CampaignDetailInner({ campaignId }: { campaignId: Id<'campaigns'> }) {
  const [cancelError, setCancelError] = useState<string | null>(null)

  const q = convexQuery(api.workflows.campaign_approval.api.getCampaignWithDetails, {
    campaignId,
  })
  const { data } = useSuspenseQuery(q)

  const cancelMutation = useMutation({
    mutationFn: useConvexMutation(
      api.workflows.campaign_approval.api.cancelCampaignWorkflow,
    ),
    onError: (err) => {
      setCancelError(err.message || 'Failed to cancel campaign')
    },
  })

  if (!data || !data.campaign) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-medium">Campaign not found</h2>
          <p className="text-sm text-muted-foreground mt-1">
            The campaign you're looking for doesn't exist or has been removed.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/campaigns">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Campaigns
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const { campaign, budget, kpis, workflowTaskStates } = data

  const handleCancel = () => {
    setCancelError(null)
    cancelMutation.mutate({
      workflowId: campaign.workflowId,
      reason: 'Cancelled by user',
    })
  }

  const canCancel = campaign.status !== 'cancelled' && campaign.status !== 'completed'

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
              <Link to="/simple">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
              <p className="text-sm text-muted-foreground">{campaign.objective}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CampaignStatusBadge status={campaign.status} />
          {canCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
              className="text-destructive hover:text-destructive"
            >
              {cancelMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <Ban className="mr-2 h-4 w-4" />
                  Cancel
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {cancelError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{cancelError}</p>
        </div>
      )}

      <Separator />

      {/* Workflow Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Workflow Progress</CardTitle>
          <CardDescription>
            8-phase campaign approval workflow
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkflowTimeline taskStates={workflowTaskStates} />
        </CardContent>
      </Card>

      {/* Campaign Details Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Target Audience */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Target Audience</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{campaign.targetAudience}</p>
          </CardContent>
        </Card>

        {/* Channels */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Channels</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {campaign.channels.map((channel) => (
                <Badge key={channel} variant="secondary" className="text-xs">
                  {channel}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Budget */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Estimated Budget</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              ${campaign.estimatedBudget.toLocaleString()}
            </p>
            {budget && (
              <p className="text-xs text-muted-foreground mt-1">
                Approved: ${budget.totalAmount.toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Timeline</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Start:</span>{' '}
                {new Date(campaign.proposedStartDate).toLocaleDateString()}
              </p>
              <p>
                <span className="text-muted-foreground">End:</span>{' '}
                {new Date(campaign.proposedEndDate).toLocaleDateString()}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Key Messages */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Key Messages</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {campaign.keyMessages.map((message, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-muted-foreground">{i + 1}.</span>
                  <span>{message}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* KPIs Section */}
      {kpis && kpis.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Key Performance Indicators</CardTitle>
            <CardDescription>
              Campaign success metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {kpis.map((kpi) => (
                <div key={kpi._id} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{kpi.metric}</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-xl font-semibold">
                      {kpi.actualValue ?? '—'}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      / {kpi.targetValue} {kpi.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/simple/queue">
            <ListTodo className="mr-2 h-4 w-4" />
            View Work Queue
          </Link>
        </Button>
      </div>
    </div>
  )
}

function CampaignStatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    draft: 'border-gray-500/30 text-gray-600 dark:text-gray-400 bg-gray-500/5',
    intake_review: 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5',
    strategy: 'border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5',
    budget_approval: 'border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5',
    creative: 'border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/5',
    technical: 'border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5',
    launch: 'border-orange-500/30 text-orange-600 dark:text-orange-400 bg-orange-500/5',
    active: 'border-green-500/30 text-green-600 dark:text-green-400 bg-green-500/5',
    completed: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5',
    cancelled: 'border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5',
  }

  return (
    <Badge variant="outline" className={variants[status] || variants.draft}>
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}

function WorkflowTimeline({ taskStates }: { taskStates: Record<string, string> }) {
  // Determine phase status based on task states
  const phaseStatuses = useMemo(() => {
    return WORKFLOW_PHASES.map((phase) => {
      const taskStatusList = phase.tasks.map((task) => taskStates[task] || 'none')

      // If any task is enabled or started, the phase is current
      if (taskStatusList.some((s) => s === 'enabled' || s === 'started')) {
        return 'current'
      }

      // If all tasks are completed, the phase is complete
      if (taskStatusList.every((s) => s === 'completed')) {
        return 'completed'
      }

      // If some tasks are completed, the phase is in progress
      if (taskStatusList.some((s) => s === 'completed')) {
        return 'partial'
      }

      // Otherwise pending
      return 'pending'
    })
  }, [taskStates])

  return (
    <div className="relative">
      {/* Horizontal timeline for larger screens */}
      <div className="hidden md:flex items-center justify-between">
        {WORKFLOW_PHASES.map((phase, index) => {
          const status = phaseStatuses[index]
          return (
            <div key={phase.name} className="flex flex-col items-center flex-1">
              <div className="relative flex items-center w-full">
                {index > 0 && (
                  <div
                    className={`absolute left-0 right-1/2 h-0.5 ${
                      status === 'completed' || status === 'current' || status === 'partial'
                        ? 'bg-primary'
                        : 'bg-muted'
                    }`}
                  />
                )}
                {index < WORKFLOW_PHASES.length - 1 && (
                  <div
                    className={`absolute left-1/2 right-0 h-0.5 ${
                      status === 'completed' ? 'bg-primary' : 'bg-muted'
                    }`}
                  />
                )}
                <div className="relative flex justify-center w-full">
                  <PhaseIcon status={status} />
                </div>
              </div>
              <div className="mt-2 text-center">
                <p className="text-xs font-medium">{phase.name}</p>
                <p className="text-[10px] text-muted-foreground">{phase.description}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Vertical timeline for mobile */}
      <div className="md:hidden space-y-4">
        {WORKFLOW_PHASES.map((phase, index) => {
          const status = phaseStatuses[index]
          return (
            <div key={phase.name} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <PhaseIcon status={status} />
                {index < WORKFLOW_PHASES.length - 1 && (
                  <div
                    className={`w-0.5 h-8 mt-1 ${
                      status === 'completed' ? 'bg-primary' : 'bg-muted'
                    }`}
                  />
                )}
              </div>
              <div className="pb-4">
                <p className="text-sm font-medium">{phase.name}</p>
                <p className="text-xs text-muted-foreground">{phase.description}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PhaseIcon({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <CheckCircle2 className="h-4 w-4" />
      </div>
    )
  }
  if (status === 'current') {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary ring-2 ring-primary">
        <CircleDot className="h-4 w-4" />
      </div>
    )
  }
  if (status === 'partial') {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary">
        <CircleDot className="h-4 w-4" />
      </div>
    )
  }
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Circle className="h-4 w-4" />
    </div>
  )
}

function CampaignDetailSkeleton() {
  return (
    <div className="p-6">
      <div className="animate-pulse space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-8 w-64 bg-muted rounded" />
            <div className="h-4 w-96 bg-muted rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-6 w-20 bg-muted rounded" />
            <div className="h-9 w-24 bg-muted rounded" />
          </div>
        </div>
        <div className="h-px bg-muted" />
        <div className="h-32 bg-muted rounded-lg" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-24 bg-muted rounded-lg" />
          <div className="h-24 bg-muted rounded-lg" />
          <div className="h-24 bg-muted rounded-lg" />
        </div>
      </div>
    </div>
  )
}
