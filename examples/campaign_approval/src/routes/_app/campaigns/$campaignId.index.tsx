import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useMutation, useSuspenseQuery, useQuery } from '@tanstack/react-query'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { api } from '@/convex/_generated/api'
import type { Doc, Id } from '@/convex/_generated/dataModel'
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
  Loader2,
  Ban,
  Wallet,
  Image,
  ChevronRight,
  Clock,
  Play,
  History,
  Search,
  Compass,
  FileText,
  Milestone,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react'
import { Route as ParentRoute } from './$campaignId'

export const Route = createFileRoute('/_app/campaigns/$campaignId/')({
  component: CampaignDetailIndex,
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

function CampaignDetailIndex() {
  const { campaignId } = Route.useParams()
  const { campaignData } = ParentRoute.useLoaderData()
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [showResearch, setShowResearch] = useState(false)
  const [showStrategy, setShowStrategy] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)
  const [showActivity, setShowActivity] = useState(false)

  // Fetch active work items for this campaign
  const { data: activeWorkItems } = useSuspenseQuery(
    convexQuery(api.workflows.campaign_approval.api.getCampaignWorkQueue, {
      campaignId: campaignId as Id<'campaigns'>,
    }),
  )

  // Fetch research data (lazy - only when expanded)
  const { data: research, isLoading: loadingResearch } = useQuery({
    ...convexQuery(api.workflows.campaign_approval.api.getCampaignResearch, {
      campaignId: campaignId as Id<'campaigns'>,
    }),
    enabled: showResearch,
  })

  // Fetch strategy data (lazy - only when expanded)
  const { data: strategy, isLoading: loadingStrategy } = useQuery({
    ...convexQuery(api.workflows.campaign_approval.api.getCampaignStrategy, {
      campaignId: campaignId as Id<'campaigns'>,
    }),
    enabled: showStrategy,
  })

  // Fetch timeline milestones (lazy - only when expanded)
  const { data: timeline, isLoading: loadingTimeline } = useQuery({
    ...convexQuery(api.workflows.campaign_approval.api.getCampaignTimeline, {
      campaignId: campaignId as Id<'campaigns'>,
    }),
    enabled: showTimeline,
  })

  // Fetch activity/approvals (lazy - only when expanded)
  const { data: activity, isLoading: loadingActivity } = useQuery({
    ...convexQuery(api.workflows.campaign_approval.api.getCampaignActivity, {
      campaignId: campaignId as Id<'campaigns'>,
    }),
    enabled: showActivity,
  })

  const cancelMutation = useMutation({
    mutationFn: useConvexMutation(
      api.workflows.campaign_approval.api.cancelCampaignWorkflow,
    ),
    onError: (err) => {
      setCancelError(err.message || 'Failed to cancel campaign')
    },
  })

  const { campaign, budget, kpis, workflowTaskStates } = campaignData

  // Derive completed tasks from workflow task states
  const completedTasks = useMemo(() => {
    const completed: { name: string; phase: string }[] = []
    for (const phase of WORKFLOW_PHASES) {
      for (const taskName of phase.tasks) {
        if (workflowTaskStates[taskName] === 'completed') {
          completed.push({ name: taskName, phase: phase.name })
        }
      }
    }
    return completed
  }, [workflowTaskStates])

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

      {/* Quick Navigation */}
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link
            to="/campaigns/$campaignId/budget"
            params={{ campaignId }}
          >
            <Wallet className="mr-2 h-4 w-4" />
            Budget Details
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link
            to="/campaigns/$campaignId/creatives"
            params={{ campaignId }}
          >
            <Image className="mr-2 h-4 w-4" />
            Creative Assets
          </Link>
        </Button>
      </div>

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
              {campaign.channels.map((channel: string) => (
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
              {campaign.keyMessages.map((message: string, i: number) => (
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
              {kpis.map((kpi: Doc<'campaignKPIs'>) => (
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

      {/* Expandable Phase Data Sections */}
      <div className="space-y-3">
        {/* Research Section (Phase 2) */}
        <Card>
          <button
            type="button"
            className="w-full"
            onClick={() => setShowResearch(!showResearch)}
          >
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-blue-500" />
                  <CardTitle className="text-base">Research Findings</CardTitle>
                </div>
                {showResearch ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <CardDescription className="text-left">
                Market research, audience analysis, and competitive insights
              </CardDescription>
            </CardHeader>
          </button>
          {showResearch && (
            <CardContent className="pt-0">
              {loadingResearch ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading research data...
                </div>
              ) : research ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Audience Analysis</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {research.audienceAnalysis || 'Not yet completed'}
                    </p>
                  </div>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-1">Competitive Landscape</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {research.competitiveLandscape || 'Not yet completed'}
                    </p>
                  </div>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-1">Historical Insights</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {research.historicalInsights || 'Not yet completed'}
                    </p>
                  </div>
                  {research.recommendations && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="text-sm font-medium mb-1">Recommendations</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {research.recommendations}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  No research data available yet. Research will be added during the Strategy phase.
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Strategy Section (Phase 2) */}
        <Card>
          <button
            type="button"
            className="w-full"
            onClick={() => setShowStrategy(!showStrategy)}
          >
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Compass className="h-4 w-4 text-purple-500" />
                  <CardTitle className="text-base">Campaign Strategy</CardTitle>
                </div>
                {showStrategy ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <CardDescription className="text-left">
                Channel strategy, creative approach, and customer journey
              </CardDescription>
            </CardHeader>
          </button>
          {showStrategy && (
            <CardContent className="pt-0">
              {loadingStrategy ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading strategy data...
                </div>
              ) : strategy ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Channel Strategy</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {strategy.channelStrategy || 'Not yet defined'}
                    </p>
                  </div>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-1">Creative Approach</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {strategy.creativeApproach || 'Not yet defined'}
                    </p>
                  </div>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-1">Customer Journey</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {strategy.customerJourney || 'Not yet defined'}
                    </p>
                  </div>
                  {strategy.tactics && strategy.tactics.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="text-sm font-medium mb-2">Key Tactics</h4>
                        <div className="space-y-2">
                          {strategy.tactics.map((tactic: { name: string; description?: string; channel?: string }, i: number) => (
                            <div key={i} className="rounded-lg border p-2 bg-muted/30">
                              <p className="text-sm font-medium">{tactic.name}</p>
                              {tactic.description && (
                                <p className="text-xs text-muted-foreground">{tactic.description}</p>
                              )}
                              {tactic.channel && (
                                <Badge variant="outline" className="mt-1 text-[10px]">
                                  {tactic.channel}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  No strategy data available yet. Strategy will be developed during the Strategy phase.
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Timeline/Milestones Section */}
        <Card>
          <button
            type="button"
            className="w-full"
            onClick={() => setShowTimeline(!showTimeline)}
          >
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Milestone className="h-4 w-4 text-emerald-500" />
                  <CardTitle className="text-base">Milestones</CardTitle>
                </div>
                {showTimeline ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <CardDescription className="text-left">
                Campaign milestones and target dates
              </CardDescription>
            </CardHeader>
          </button>
          {showTimeline && (
            <CardContent className="pt-0">
              {loadingTimeline ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading timeline data...
                </div>
              ) : timeline && timeline.milestones && timeline.milestones.length > 0 ? (
                <div className="space-y-2">
                  {timeline.milestones.map((milestone: { _id: string; name: string; targetDate: number; actualDate?: number | null; status: string; notes?: string | null }) => (
                    <div
                      key={milestone._id}
                      className="flex items-start justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-start gap-3">
                        <MilestoneStatusIcon status={milestone.status} />
                        <div>
                          <p className="text-sm font-medium">{milestone.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Target: {new Date(milestone.targetDate).toLocaleDateString()}</span>
                            {milestone.actualDate && (
                              <span className="text-emerald-600">
                                • Completed: {new Date(milestone.actualDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {milestone.notes && (
                            <p className="text-xs text-muted-foreground mt-1">{milestone.notes}</p>
                          )}
                        </div>
                      </div>
                      <MilestoneStatusBadge status={milestone.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  No milestones defined yet. Milestones will be created during the Planning phase.
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Activity/Approvals Section */}
        <Card>
          <button
            type="button"
            className="w-full"
            onClick={() => setShowActivity(!showActivity)}
          >
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-500" />
                  <CardTitle className="text-base">Approval History</CardTitle>
                </div>
                {showActivity ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <CardDescription className="text-left">
                Audit trail of approval decisions
              </CardDescription>
            </CardHeader>
          </button>
          {showActivity && (
            <CardContent className="pt-0">
              {loadingActivity ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading activity data...
                </div>
              ) : activity && activity.activities && activity.activities.length > 0 ? (
                <div className="space-y-2">
                  {activity.activities.map((item: { _id: string; approvalType: string; decision: string; timestamp: number; comments?: string | null }) => (
                    <div
                      key={item._id}
                      className="flex items-start justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-start gap-3">
                        <ApprovalDecisionIcon decision={item.decision} />
                        <div>
                          <p className="text-sm font-medium capitalize">
                            {item.approvalType.replace(/_/g, ' ')} Review
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(item.timestamp).toLocaleString()}
                          </p>
                          {item.comments && (
                            <p className="text-xs text-muted-foreground mt-1 italic">
                              "{item.comments}"
                            </p>
                          )}
                        </div>
                      </div>
                      <ApprovalDecisionBadge decision={item.decision} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  No approval decisions recorded yet.
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      {/* Active Tasks Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 text-blue-500" />
            <CardTitle className="text-base">Active Tasks</CardTitle>
          </div>
          <CardDescription>
            {activeWorkItems.length === 0
              ? 'No tasks currently waiting'
              : `${activeWorkItems.length} task${activeWorkItems.length === 1 ? '' : 's'} waiting for action`}
          </CardDescription>
        </CardHeader>
        {activeWorkItems.length > 0 && (
          <CardContent className="pt-0">
            <div className="space-y-2">
              {activeWorkItems.map((item) => (
                <div
                  key={item._id}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {item.status === 'claimed' ? (
                      <Clock className="h-4 w-4 text-blue-500" />
                    ) : (
                      <Circle className="h-4 w-4 text-amber-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{item.taskName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.phase && (
                          <Badge variant="outline" className="mr-2 text-[10px]">
                            {item.phase}
                          </Badge>
                        )}
                        {item.status === 'claimed' ? 'In progress' : 'Waiting to be claimed'}
                      </p>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/simple/tasks/$workItemId"
                      params={{ workItemId: item.workItemId }}
                    >
                      {item.status === 'claimed' ? 'Continue' : 'Start'}
                      <ChevronRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Completed Tasks Section */}
      {completedTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-base">Completed Tasks</CardTitle>
            </div>
            <CardDescription>
              {completedTasks.length} task{completedTasks.length === 1 ? '' : 's'} completed
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {completedTasks.map((task) => (
                <div
                  key={task.name}
                  className="flex items-center gap-2 rounded-lg border p-2 bg-muted/30"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {formatTaskName(task.name)}
                    </p>
                    <p className="text-xs text-muted-foreground">{task.phase}</p>
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

// Helper function to format task name for display
function formatTaskName(taskName: string): string {
  // Convert camelCase to Title Case with spaces
  return taskName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim()
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

// Milestone status helper components
function MilestoneStatusIcon({ status }: { status: string }) {
  if (status === 'completed') {
    return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
  }
  if (status === 'in_progress') {
    return <CircleDot className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
  }
  if (status === 'delayed') {
    return <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
  }
  return <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
}

function MilestoneStatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: 'border-gray-500/30 text-gray-600 dark:text-gray-400 bg-gray-500/5',
    in_progress: 'border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5',
    completed: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5',
    delayed: 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5',
  }

  return (
    <Badge variant="outline" className={`text-[10px] ${variants[status] || variants.pending}`}>
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}

// Approval decision helper components
function ApprovalDecisionIcon({ decision }: { decision: string }) {
  if (decision === 'approved') {
    return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
  }
  if (decision === 'rejected') {
    return <Ban className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
  }
  if (decision === 'changes_requested') {
    return <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
  }
  return <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
}

function ApprovalDecisionBadge({ decision }: { decision: string }) {
  const variants: Record<string, string> = {
    approved: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5',
    rejected: 'border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5',
    changes_requested: 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5',
  }

  return (
    <Badge variant="outline" className={`text-[10px] ${variants[decision] || ''}`}>
      {decision.replace(/_/g, ' ')}
    </Badge>
  )
}
