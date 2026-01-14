import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { Suspense, useState, useMemo } from 'react'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
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
import { Label } from '@repo/ui/components/label'
import { Textarea } from '@repo/ui/components/textarea'
import {
  ArrowLeft,
  Check,
  Loader2,
  ListTodo,
  Play,
  X,
  AlertTriangle,
  RefreshCw,
  FileText,
  DollarSign,
  Palette,
  Scale,
  Settings,
  Megaphone,
  BarChart3,
  Archive,
  Send,
} from 'lucide-react'

export const Route = createFileRoute('/_app/simple/tasks/$workItemId')({
  component: GenericTaskPage,
})

/**
 * Task type categories for form rendering
 */
type TaskCategory =
  | 'confirmation' // Simple confirm action (submitRequest, launchCampaign, etc.)
  | 'approval' // Decision with approve/reject options
  | 'work' // Complete a deliverable
  | 'review' // Review with approve/revision options
  | 'owner_assignment' // Assign current user as owner (assignOwner)

/**
 * Task configuration for rendering
 */
interface TaskConfig {
  category: TaskCategory
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  phase: number
  confirmationLabel?: string
  approvalOptions?: { value: string; label: string; description: string }[]
  workLabel?: string
  completionPayload: (formData: Record<string, unknown>) => Record<string, unknown>
}

/**
 * Configuration for all 35 task types
 */
const TASK_CONFIGS: Record<string, TaskConfig> = {
  // Phase 1: Initiation
  submitRequest: {
    category: 'confirmation',
    title: 'Submit Campaign Request',
    description: 'Submit your campaign request for intake review',
    icon: Send,
    phase: 1,
    confirmationLabel: 'I confirm that the campaign details are accurate and ready for review',
    completionPayload: () => ({ confirmed: true }),
  },
  intakeReview: {
    category: 'approval',
    title: 'Intake Review',
    description: 'Review and make a decision on this campaign request',
    icon: FileText,
    phase: 1,
    approvalOptions: [
      { value: 'approved', label: 'Approve', description: 'Campaign is ready to proceed to strategy phase' },
      { value: 'rejected', label: 'Reject', description: 'Campaign does not meet requirements' },
      { value: 'needs_changes', label: 'Request Changes', description: 'Requester needs to update campaign details' },
    ],
    completionPayload: (data) => ({ decision: data.decision, feedback: data.notes || undefined }),
  },
  assignOwner: {
    category: 'owner_assignment',
    title: 'Assign Campaign Owner',
    description: 'Assign a campaign manager to own this campaign',
    icon: FileText,
    phase: 1,
    confirmationLabel: 'I am taking ownership of this campaign',
    // ownerId is populated from formData.ownerId (set from current user)
    completionPayload: (data) => ({ ownerId: data.ownerId as string }),
  },

  // Phase 2: Strategy
  conductResearch: {
    category: 'work',
    title: 'Conduct Research',
    description: 'Analyze audience, competitors, and market trends',
    icon: FileText,
    phase: 2,
    workLabel: 'Research Findings',
    completionPayload: (data) => ({ findings: data.notes || '' }),
  },
  defineMetrics: {
    category: 'confirmation',
    title: 'Define Success Metrics',
    description: 'Establish KPIs and success criteria for the campaign',
    icon: BarChart3,
    phase: 2,
    confirmationLabel: 'KPIs have been defined for this campaign',
    completionPayload: () => ({ confirmed: true }),
  },
  developStrategy: {
    category: 'work',
    title: 'Develop Strategy',
    description: 'Create the campaign strategy document',
    icon: FileText,
    phase: 2,
    workLabel: 'Strategy Document',
    completionPayload: (data) => ({ strategyDocument: data.notes || '' }),
  },
  createPlan: {
    category: 'work',
    title: 'Create Campaign Plan',
    description: 'Document timeline, milestones, and execution plan',
    icon: FileText,
    phase: 2,
    workLabel: 'Plan Document',
    completionPayload: (data) => ({ planDocument: data.notes || '' }),
  },

  // Phase 3: Budget
  developBudget: {
    category: 'confirmation',
    title: 'Develop Budget',
    description: 'Create detailed budget breakdown for the campaign',
    icon: DollarSign,
    phase: 3,
    confirmationLabel: 'Budget breakdown has been completed',
    completionPayload: () => ({ confirmed: true }),
  },
  directorApproval: {
    category: 'approval',
    title: 'Director Budget Approval',
    description: 'Review and approve budget (< $50,000)',
    icon: DollarSign,
    phase: 3,
    approvalOptions: [
      { value: 'approved', label: 'Approve Budget', description: 'Budget is approved as submitted' },
      { value: 'rejected', label: 'Reject Budget', description: 'Budget cannot be approved' },
      { value: 'revision_requested', label: 'Request Revision', description: 'Budget needs modifications' },
    ],
    completionPayload: (data) => ({ decision: data.decision, approvalNotes: data.notes || undefined }),
  },
  executiveApproval: {
    category: 'approval',
    title: 'Executive Budget Approval',
    description: 'Review and approve budget (>= $50,000)',
    icon: DollarSign,
    phase: 3,
    approvalOptions: [
      { value: 'approved', label: 'Approve Budget', description: 'Budget is approved as submitted' },
      { value: 'rejected', label: 'Reject Budget', description: 'Budget cannot be approved' },
      { value: 'revision_requested', label: 'Request Revision', description: 'Budget needs modifications' },
    ],
    completionPayload: (data) => ({ decision: data.decision, approvalNotes: data.notes || undefined }),
  },
  secureResources: {
    category: 'confirmation',
    title: 'Secure Resources',
    description: 'Confirm all resources are allocated and available',
    icon: DollarSign,
    phase: 3,
    confirmationLabel: 'All resources have been secured for this campaign',
    completionPayload: () => ({ resourcesConfirmed: true }),
  },

  // Phase 4: Creative
  createBrief: {
    category: 'work',
    title: 'Create Creative Brief',
    description: 'Document creative requirements and guidelines',
    icon: Palette,
    phase: 4,
    workLabel: 'Brief Document',
    completionPayload: (data) => ({ briefDocument: data.notes || '' }),
  },
  developConcepts: {
    category: 'confirmation',
    title: 'Develop Creative Concepts',
    description: 'Create and upload creative assets',
    icon: Palette,
    phase: 4,
    confirmationLabel: 'Creative concepts have been developed and uploaded',
    completionPayload: () => ({ confirmed: true }),
  },
  internalReview: {
    category: 'review',
    title: 'Internal Creative Review',
    description: 'Review creative assets for brand alignment',
    icon: Palette,
    phase: 4,
    approvalOptions: [
      { value: 'approved', label: 'Approve', description: 'Creative assets meet standards' },
      { value: 'needs_revision', label: 'Request Revisions', description: 'Assets need modifications' },
    ],
    completionPayload: (data) => ({ decision: data.decision, reviewNotes: data.notes || undefined }),
  },
  reviseAssets: {
    category: 'work',
    title: 'Revise Creative Assets',
    description: 'Address feedback and update creative assets',
    icon: Palette,
    phase: 4,
    workLabel: 'Revision Notes',
    completionPayload: (data) => ({ revisionNotes: data.notes || '' }),
  },
  legalReview: {
    category: 'review',
    title: 'Legal Review',
    description: 'Review creative assets for legal compliance',
    icon: Scale,
    phase: 4,
    approvalOptions: [
      { value: 'approved', label: 'Approve', description: 'Assets meet legal requirements' },
      { value: 'needs_changes', label: 'Request Changes', description: 'Legal issues need to be addressed' },
    ],
    completionPayload: (data) => ({ decision: data.decision, legalNotes: data.notes || undefined }),
  },
  legalRevise: {
    category: 'work',
    title: 'Address Legal Feedback',
    description: 'Make changes to address legal concerns',
    icon: Scale,
    phase: 4,
    workLabel: 'Revision Notes',
    completionPayload: (data) => ({ revisionNotes: data.notes || '' }),
  },
  finalApproval: {
    category: 'approval',
    title: 'Final Creative Approval',
    description: 'Final sign-off on all creative assets',
    icon: Palette,
    phase: 4,
    approvalOptions: [
      { value: 'approved', label: 'Approve All', description: 'All assets are approved for use' },
      { value: 'rejected', label: 'Reject', description: 'Assets cannot be used' },
    ],
    completionPayload: (data) => ({ decision: data.decision, approvalNotes: data.notes || undefined }),
  },

  // Phase 5: Technical
  buildInfra: {
    category: 'confirmation',
    title: 'Build Infrastructure',
    description: 'Set up landing pages, email templates, and audience segments',
    icon: Settings,
    phase: 5,
    confirmationLabel: 'Infrastructure setup is complete',
    completionPayload: () => ({ infraReady: true }),
  },
  configAnalytics: {
    category: 'confirmation',
    title: 'Configure Analytics',
    description: 'Set up UTM tracking, pixels, and dashboards',
    icon: BarChart3,
    phase: 5,
    confirmationLabel: 'Analytics configuration is complete',
    completionPayload: () => ({ analyticsConfigured: true }),
  },
  setupMedia: {
    category: 'confirmation',
    title: 'Setup Media Campaigns',
    description: 'Configure ad platform campaigns and targeting',
    icon: Megaphone,
    phase: 5,
    confirmationLabel: 'Media campaigns are configured and ready',
    completionPayload: () => ({ mediaReady: true }),
  },
  qaTest: {
    category: 'approval',
    title: 'QA Testing',
    description: 'End-to-end testing of all campaign components',
    icon: Settings,
    phase: 5,
    approvalOptions: [
      { value: 'passed', label: 'All Tests Passed', description: 'Campaign is ready for launch' },
      { value: 'failed', label: 'Tests Failed', description: 'Issues found that need fixing' },
    ],
    completionPayload: (data) => ({ decision: data.decision, testResults: data.notes || undefined }),
  },
  fixIssues: {
    category: 'confirmation',
    title: 'Fix QA Issues',
    description: 'Address issues found during testing',
    icon: Settings,
    phase: 5,
    confirmationLabel: 'All issues have been resolved',
    completionPayload: () => ({ issuesFixed: true }),
  },

  // Phase 6: Launch
  preLaunchReview: {
    category: 'confirmation',
    title: 'Pre-Launch Review',
    description: 'Complete launch readiness checklist',
    icon: Megaphone,
    phase: 6,
    confirmationLabel: 'All pre-launch checks are complete',
    completionPayload: () => ({ checklistComplete: true }),
  },
  addressConcerns: {
    category: 'confirmation',
    title: 'Address Concerns',
    description: 'Resolve open issues before launch',
    icon: AlertTriangle,
    phase: 6,
    confirmationLabel: 'All concerns have been addressed',
    completionPayload: () => ({ concernsAddressed: true }),
  },
  launchApproval: {
    category: 'approval',
    title: 'Launch Approval',
    description: 'Final authorization to launch the campaign',
    icon: Megaphone,
    phase: 6,
    approvalOptions: [
      { value: 'approved', label: 'Approve Launch', description: 'Campaign is approved to go live' },
      { value: 'concerns', label: 'Has Concerns', description: 'Issues need to be addressed first' },
      { value: 'rejected', label: 'Reject Launch', description: 'Campaign cannot proceed' },
    ],
    completionPayload: (data) => ({ decision: data.decision, approvalNotes: data.notes || undefined }),
  },
  internalComms: {
    category: 'confirmation',
    title: 'Internal Communications',
    description: 'Notify stakeholders about the upcoming launch',
    icon: Send,
    phase: 6,
    confirmationLabel: 'All internal stakeholders have been notified',
    completionPayload: () => ({ communicationsSent: true }),
  },

  // Phase 7: Execution
  launchCampaign: {
    category: 'confirmation',
    title: 'Launch Campaign',
    description: 'Activate all campaign elements',
    icon: Megaphone,
    phase: 7,
    confirmationLabel: 'Campaign has been launched',
    completionPayload: () => ({ launchConfirmed: true }),
  },
  monitorPerformance: {
    category: 'work',
    title: 'Monitor Performance',
    description: 'Track campaign metrics and identify issues',
    icon: BarChart3,
    phase: 7,
    workLabel: 'Performance Notes',
    completionPayload: (data) => ({ performanceNotes: data.notes || '' }),
  },
  ongoingOptimization: {
    category: 'approval',
    title: 'Ongoing Optimization',
    description: 'Make optimizations and decide whether to continue or end',
    icon: RefreshCw,
    phase: 7,
    approvalOptions: [
      { value: 'continue', label: 'Continue Campaign', description: 'Keep running and monitoring' },
      { value: 'end', label: 'End Campaign', description: 'Move to closure phase' },
    ],
    completionPayload: (data) => ({ decision: data.decision, optimizationNotes: data.notes || undefined }),
  },

  // Phase 8: Closure
  endCampaign: {
    category: 'confirmation',
    title: 'End Campaign',
    description: 'Deactivate all campaign components',
    icon: Archive,
    phase: 8,
    confirmationLabel: 'Campaign has been deactivated',
    completionPayload: () => ({ endConfirmed: true }),
  },
  compileData: {
    category: 'confirmation',
    title: 'Compile Data',
    description: 'Aggregate results from all channels',
    icon: BarChart3,
    phase: 8,
    confirmationLabel: 'All campaign data has been compiled',
    completionPayload: () => ({ dataCompiled: true }),
  },
  conductAnalysis: {
    category: 'work',
    title: 'Conduct Analysis',
    description: 'Compare results to KPI targets',
    icon: BarChart3,
    phase: 8,
    workLabel: 'Analysis Document',
    completionPayload: (data) => ({ analysisDocument: data.notes || '' }),
  },
  presentResults: {
    category: 'confirmation',
    title: 'Present Results',
    description: 'Share findings with stakeholders',
    icon: FileText,
    phase: 8,
    confirmationLabel: 'Results have been presented to stakeholders',
    completionPayload: () => ({ presentationComplete: true }),
  },
  archiveMaterials: {
    category: 'confirmation',
    title: 'Archive Materials',
    description: 'Store assets and documentation',
    icon: Archive,
    phase: 8,
    confirmationLabel: 'All materials have been archived',
    completionPayload: () => ({ archiveComplete: true }),
  },
}

const PHASE_NAMES: Record<number, string> = {
  1: 'Initiation',
  2: 'Strategy',
  3: 'Budget',
  4: 'Creative',
  5: 'Technical',
  6: 'Launch',
  7: 'Execution',
  8: 'Closure',
}

function GenericTaskPage() {
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
  const [formData, setFormData] = useState<Record<string, unknown>>({})

  // Fetch current user for owner assignment tasks
  const { data: currentUser } = useSuspenseQuery(
    convexQuery(api.auth.getCurrentUser, {}),
  )

  // Fetch work item details
  const { data: workItemData } = useSuspenseQuery(
    convexQuery(api.workflows.campaign_approval.api.getWorkItem, { workItemId })
  )

  const taskType = workItemData?.metadata?.taskType || 'submitRequest'
  const config = TASK_CONFIGS[taskType] || TASK_CONFIGS.submitRequest

  // Pre-populate ownerId for owner_assignment category
  const effectiveFormData = useMemo(() => {
    if (config.category === 'owner_assignment' && currentUser?.userId) {
      return { ...formData, ownerId: currentUser.userId }
    }
    return formData
  }, [config.category, currentUser?.userId, formData])

  const Icon = config.icon

  // Determine if work item is already started (state is 'started')
  const alreadyStarted = workItemData?.workItem?.state === 'started'
  const effectiveIsStarted = isStarted || alreadyStarted

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
      navigate({ to: '/simple/queue' })
    },
    onError: (err) => {
      setError(err.message || 'Failed to complete work item')
    },
  })

  const handleStart = () => {
    setError(null)
    startMutation.mutate({
      workItemId,
      args: { name: taskType },
    })
  }

  const handleComplete = () => {
    setError(null)
    const payload = config.completionPayload(effectiveFormData)
    completeMutation.mutate({
      workItemId,
      args: {
        name: taskType,
        payload,
      },
    })
  }

  const isPending = startMutation.isPending || completeMutation.isPending

  // Check if form is valid for completion
  const isFormValid = useMemo(() => {
    if (config.category === 'confirmation') return true
    if (config.category === 'owner_assignment') return !!effectiveFormData.ownerId
    if (config.category === 'approval' || config.category === 'review') {
      return !!effectiveFormData.decision
    }
    return true // work category doesn't require validation
  }, [config.category, effectiveFormData])

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  Phase {config.phase}: {PHASE_NAMES[config.phase]}
                </span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {config.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {effectiveIsStarted
                  ? config.description
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

      {/* Campaign Context */}
      {workItemData?.campaign && (
        <div className="max-w-lg mx-auto">
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary flex-shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{workItemData.campaign.name}</p>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {workItemData.campaign.objective}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      Budget: ${(workItemData.campaign.estimatedBudget || 0).toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground capitalize">
                      Status: {workItemData.campaign.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Task Card */}
      <div className="max-w-lg mx-auto">
        {!effectiveIsStarted ? (
          <ClaimCard
            config={config}
            error={error}
            isPending={isPending}
            onStart={handleStart}
          />
        ) : (
          <TaskFormCard
            config={config}
            error={error}
            isPending={isPending}
            formData={formData}
            setFormData={setFormData}
            isFormValid={isFormValid}
            onComplete={handleComplete}
          />
        )}
      </div>
    </div>
  )
}

function ClaimCard({
  config,
  error,
  isPending,
  onStart,
}: {
  config: TaskConfig
  error: string | null
  isPending: boolean
  onStart: () => void
}) {
  return (
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
                <span>{config.description}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium flex-shrink-0">
                  3
                </span>
                <span>The workflow advances to the next step</span>
              </li>
            </ul>
          </div>

          <Button
            onClick={onStart}
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
  )
}

function TaskFormCard({
  config,
  error,
  isPending,
  formData,
  setFormData,
  isFormValid,
  onComplete,
}: {
  config: TaskConfig
  error: string | null
  isPending: boolean
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
  isFormValid: boolean
  onComplete: () => void
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/30 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
            <config.icon className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">{config.title}</CardTitle>
            <CardDescription className="text-sm">
              {config.description}
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

          {/* Render form based on category */}
          {(config.category === 'confirmation' || config.category === 'owner_assignment') && (
            <ConfirmationForm config={config} />
          )}

          {(config.category === 'approval' || config.category === 'review') && config.approvalOptions && (
            <ApprovalForm
              config={config}
              formData={formData}
              setFormData={setFormData}
            />
          )}

          {config.category === 'work' && (
            <WorkForm
              config={config}
              formData={formData}
              setFormData={setFormData}
            />
          )}

          <Button
            onClick={onComplete}
            disabled={isPending || !isFormValid}
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
                <Check className="mr-2 h-4 w-4" />
                Complete Task
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ConfirmationForm({ config }: { config: TaskConfig }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <h4 className="text-sm font-medium mb-2">By completing this task:</h4>
      <ul className="text-sm text-muted-foreground space-y-2">
        <li className="flex items-start gap-2">
          <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
          <span>{config.confirmationLabel}</span>
        </li>
      </ul>
    </div>
  )
}

function ApprovalForm({
  config,
  formData,
  setFormData,
}: {
  config: TaskConfig
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
}) {
  const getOptionIcon = (value: string) => {
    if (value === 'approved' || value === 'passed' || value === 'continue') {
      return <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
    }
    if (value === 'rejected' || value === 'failed' || value === 'end') {
      return <X className="h-4 w-4 text-red-500 flex-shrink-0" />
    }
    return <RefreshCw className="h-4 w-4 text-amber-500 flex-shrink-0" />
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Decision</Label>
        <div className="mt-2 space-y-2">
          {config.approvalOptions?.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`w-full flex items-start text-left space-x-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                formData.decision === option.value
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/50'
              }`}
              onClick={() => setFormData({ ...formData, decision: option.value })}
            >
              <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 flex-shrink-0 mt-0.5 ${
                formData.decision === option.value
                  ? 'border-primary bg-primary'
                  : 'border-muted-foreground/30'
              }`}>
                {formData.decision === option.value && (
                  <div className="h-2 w-2 rounded-full bg-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{option.label}</p>
                <p className="text-sm text-muted-foreground">{option.description}</p>
              </div>
              {getOptionIcon(option.value)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="notes" className="text-sm font-medium">
          Notes (optional)
        </Label>
        <Textarea
          id="notes"
          placeholder="Add any relevant notes or feedback..."
          value={(formData.notes as string) || ''}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          className="mt-2"
          rows={3}
        />
      </div>
    </div>
  )
}

function WorkForm({
  config,
  formData,
  setFormData,
}: {
  config: TaskConfig
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4">
        <h4 className="text-sm font-medium mb-2">Task Instructions:</h4>
        <p className="text-sm text-muted-foreground">{config.description}</p>
      </div>

      <div>
        <Label htmlFor="notes" className="text-sm font-medium">
          {config.workLabel || 'Notes'}
        </Label>
        <Textarea
          id="notes"
          placeholder="Document your work here..."
          value={(formData.notes as string) || ''}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          className="mt-2"
          rows={5}
        />
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
