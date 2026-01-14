import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { Suspense, useState, useMemo } from 'react'
import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query'
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
import { Input } from '@repo/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select'
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
  Plus,
  Trash2,
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
  | 'research' // Research task with 3 required analysis fields
  | 'metrics' // Define KPIs with dynamic array
  | 'strategy' // Develop strategy with touchpoints
  | 'plan' // Create plan with milestones
  | 'budget' // Develop budget breakdown
  | 'brief' // Creative brief with deliverables
  | 'concepts' // Develop creative concepts with assets
  | 'revision' // Revise assets
  | 'legal_review' // Legal review with compliance notes
  | 'legal_revision' // Legal revision
  | 'final_approval' // Final approval (boolean)
  | 'end_campaign' // End campaign with deactivated components
  | 'compile_data' // Compile data with sources and metrics
  | 'analysis' // Conduct analysis with KPI results
  | 'presentation' // Present results with attendees
  | 'archive' // Archive materials

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
    completionPayload: (data) => ({ decision: data.decision, reviewNotes: data.notes || undefined }),
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
    category: 'research',
    title: 'Conduct Research',
    description: 'Analyze audience, competitors, and market trends',
    icon: FileText,
    phase: 2,
    completionPayload: (data) => ({
      audienceAnalysis: (data.audienceAnalysis as string) || '',
      competitiveInsights: (data.competitiveInsights as string) || '',
      historicalLearnings: (data.historicalLearnings as string) || '',
      marketTimingNotes: (data.marketTimingNotes as string) || undefined,
    }),
  },
  defineMetrics: {
    category: 'metrics',
    title: 'Define Success Metrics',
    description: 'Establish KPIs and success criteria for the campaign',
    icon: BarChart3,
    phase: 2,
    completionPayload: (data) => ({
      kpis: (data.kpis as Array<{ metric: string; targetValue: number; unit: string }>) || [],
    }),
  },
  developStrategy: {
    category: 'strategy',
    title: 'Develop Strategy',
    description: 'Create the campaign strategy document',
    icon: FileText,
    phase: 2,
    completionPayload: (data) => ({
      channelStrategy: (data.channelStrategy as string) || '',
      creativeApproach: (data.creativeApproach as string) || '',
      customerJourney: (data.customerJourney as string) || '',
      keyTouchpoints: (data.keyTouchpoints as string[]) || [],
    }),
  },
  createPlan: {
    category: 'plan',
    title: 'Create Campaign Plan',
    description: 'Document timeline, milestones, and execution plan',
    icon: FileText,
    phase: 2,
    completionPayload: (data) => ({
      timeline: (data.timeline as string) || '',
      milestones: (data.milestones as Array<{ name: string; targetDate: number }>) || [],
      tactics: (data.tactics as string) || '',
      segmentation: (data.segmentation as string) || '',
      resourceRequirements: (data.resourceRequirements as string) || '',
    }),
  },

  // Phase 3: Budget
  developBudget: {
    category: 'budget',
    title: 'Develop Budget',
    description: 'Create detailed budget breakdown for the campaign',
    icon: DollarSign,
    phase: 3,
    completionPayload: (data) => ({
      totalAmount: (data.totalAmount as number) || 0,
      mediaSpend: (data.mediaSpend as number) || 0,
      creativeProduction: (data.creativeProduction as number) || 0,
      technologyTools: (data.technologyTools as number) || 0,
      agencyFees: (data.agencyFees as number) || 0,
      eventCosts: (data.eventCosts as number) || 0,
      contingency: (data.contingency as number) || 0,
      justification: (data.justification as string) || '',
      roiProjection: (data.roiProjection as string) || undefined,
    }),
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
    category: 'brief',
    title: 'Create Creative Brief',
    description: 'Document creative requirements and guidelines',
    icon: Palette,
    phase: 4,
    completionPayload: (data) => ({
      objectives: (data.objectives as string) || '',
      targetAudience: (data.targetAudience as string) || '',
      keyMessages: (data.keyMessages as string[]) || [],
      toneAndStyle: (data.toneAndStyle as string) || '',
      deliverables: (data.deliverables as Array<{ type: string; description: string }>) || [],
      deadline: (data.deadline as number) || Date.now(),
      references: (data.references as string[]) || undefined,
    }),
  },
  developConcepts: {
    category: 'concepts',
    title: 'Develop Creative Concepts',
    description: 'Create and upload creative assets',
    icon: Palette,
    phase: 4,
    completionPayload: (data) => ({
      assets: (data.assets as Array<{ creativeId: string; storageId?: string; notes?: string }>) || [],
    }),
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
    category: 'revision',
    title: 'Revise Creative Assets',
    description: 'Address feedback and update creative assets',
    icon: Palette,
    phase: 4,
    completionPayload: (data) => ({
      revisedAssets: (data.revisedAssets as Array<{ creativeId: string; storageId?: string; revisionNotes: string }>) || [],
    }),
  },
  legalReview: {
    category: 'legal_review',
    title: 'Legal Review',
    description: 'Review creative assets for legal compliance',
    icon: Scale,
    phase: 4,
    approvalOptions: [
      { value: 'approved', label: 'Approve', description: 'Assets meet legal requirements' },
      { value: 'needs_changes', label: 'Request Changes', description: 'Legal issues need to be addressed' },
    ],
    completionPayload: (data) => ({
      decision: data.decision as string,
      complianceNotes: (data.complianceNotes as string) || '',
      requiredChanges: (data.requiredChanges as Array<{ creativeId: string; issue: string; requiredFix: string }>) || undefined,
    }),
  },
  legalRevise: {
    category: 'legal_revision',
    title: 'Address Legal Feedback',
    description: 'Make changes to address legal concerns',
    icon: Scale,
    phase: 4,
    completionPayload: (data) => ({
      revisedAssets: (data.revisedAssets as Array<{ creativeId: string; storageId?: string; addressedIssue: string }>) || [],
    }),
  },
  finalApproval: {
    category: 'final_approval',
    title: 'Final Creative Approval',
    description: 'Final sign-off on all creative assets',
    icon: Palette,
    phase: 4,
    approvalOptions: [
      { value: 'approved', label: 'Approve All', description: 'All assets are approved for use' },
      { value: 'rejected', label: 'Reject', description: 'Assets cannot be used' },
    ],
    completionPayload: (data) => ({
      approved: data.decision === 'approved',
      signoffNotes: (data.notes as string) || undefined,
    }),
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
    completionPayload: (data) => ({ result: data.decision, testResults: data.notes || undefined }),
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
    completionPayload: () => ({ readyForApproval: true }),
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
    completionPayload: (data) => ({ decision: data.decision, approverNotes: data.notes || undefined }),
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
    completionPayload: () => ({ launchedAt: Date.now() }),
  },
  monitorPerformance: {
    category: 'work',
    title: 'Monitor Performance',
    description: 'Track campaign metrics and identify issues',
    icon: BarChart3,
    phase: 7,
    workLabel: 'Performance Notes',
    completionPayload: () => ({ overallStatus: 'healthy' }),
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
    completionPayload: (data) => ({ decision: data.decision }),
  },

  // Phase 8: Closure
  endCampaign: {
    category: 'end_campaign',
    title: 'End Campaign',
    description: 'Deactivate all campaign components',
    icon: Archive,
    phase: 8,
    completionPayload: (data) => ({
      endedAt: (data.endedAt as number) || Date.now(),
      deactivatedComponents: (data.deactivatedComponents as Array<{ component: string; platform?: string; deactivatedAt: number }>) || [],
      remainingBudget: (data.remainingBudget as number) || undefined,
      endNotes: (data.endNotes as string) || undefined,
    }),
  },
  compileData: {
    category: 'compile_data',
    title: 'Compile Data',
    description: 'Aggregate results from all channels',
    icon: BarChart3,
    phase: 8,
    completionPayload: (data) => ({
      dataSources: (data.dataSources as Array<{ source: string; metricsCollected: string[]; dataRange: { start: number; end: number } }>) || [],
      aggregatedMetrics: (data.aggregatedMetrics as { totalImpressions?: number; totalClicks?: number; totalConversions?: number; totalSpend: number; totalRevenue?: number }) || { totalSpend: 0 },
      dataLocation: (data.dataLocation as string) || '',
    }),
  },
  conductAnalysis: {
    category: 'analysis',
    title: 'Conduct Analysis',
    description: 'Compare results to KPI targets',
    icon: BarChart3,
    phase: 8,
    completionPayload: (data) => ({
      kpiResults: (data.kpiResults as Array<{ kpiId: string; metric: string; target: number; actual: number; percentAchieved: number; analysis: string }>) || [],
      whatWorked: (data.whatWorked as string[]) || [],
      whatDidntWork: (data.whatDidntWork as string[]) || [],
      lessonsLearned: (data.lessonsLearned as string[]) || [],
      recommendationsForFuture: (data.recommendationsForFuture as string[]) || [],
      overallAssessment: (data.overallAssessment as string) || 'met_goals',
    }),
  },
  presentResults: {
    category: 'presentation',
    title: 'Present Results',
    description: 'Share findings with stakeholders',
    icon: FileText,
    phase: 8,
    completionPayload: (data) => ({
      presentationDate: (data.presentationDate as number) || Date.now(),
      attendees: (data.attendees as string[]) || [],
      presentationUrl: (data.presentationUrl as string) || undefined,
      feedbackReceived: (data.feedbackReceived as string) || '',
      followUpActions: (data.followUpActions as Array<{ action: string; owner: string; dueDate?: number }>) || undefined,
    }),
  },
  archiveMaterials: {
    category: 'archive',
    title: 'Archive Materials',
    description: 'Store assets and documentation',
    icon: Archive,
    phase: 8,
    completionPayload: (data) => ({
      archivedItems: (data.archivedItems as Array<{ itemType: string; location: string; description: string }>) || [],
      archiveLocation: (data.archiveLocation as string) || '',
      retentionPeriod: (data.retentionPeriod as string) || undefined,
      archivedAt: (data.archivedAt as number) || Date.now(),
    }),
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

/**
 * Parse Zod validation errors from error message and extract field-level errors
 */
function parseFieldErrors(errorMessage: string): Record<string, string> {
  const fieldErrors: Record<string, string> = {}

  // Try to extract ZodError JSON from the message
  const zodMatch = errorMessage.match(/ZodError:\s*(\[[\s\S]*\])/)
  if (!zodMatch) return fieldErrors

  try {
    const zodErrors = JSON.parse(zodMatch[1]) as Array<{
      path: (string | number)[]
      message: string
    }>

    for (const err of zodErrors) {
      // Convert path array to dot-notation string (e.g., ["deliverables", 1, "description"] -> "deliverables.1.description")
      const pathKey = err.path.join('.')
      fieldErrors[pathKey] = err.message
    }
  } catch {
    // If parsing fails, return empty errors
  }

  return fieldErrors
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
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

  // Fetch campaign creatives for concepts/revision task types
  const campaignId = workItemData?.campaign?._id
  const needsCreatives = config.category === 'concepts' || config.category === 'revision' || config.category === 'legal_revision'
  const { data: creatives } = useQuery({
    ...convexQuery(api.workflows.campaign_approval.api.getCampaignCreatives, {
      campaignId: campaignId as Id<'campaigns'>
    }),
    enabled: !!campaignId && needsCreatives,
  })

  // Fetch KPIs for analysis category
  const needsKPIs = config.category === 'analysis'
  const { data: kpis } = useQuery({
    ...convexQuery(api.workflows.campaign_approval.api.getCampaignKPIs, {
      campaignId: campaignId as Id<'campaigns'>
    }),
    enabled: !!campaignId && needsKPIs,
  })

  // Pre-populate ownerId for owner_assignment category
  // Pre-populate assets for concepts/revision categories
  // Pre-populate kpiResults for analysis category
  const effectiveFormData = useMemo(() => {
    let data = { ...formData }

    if (config.category === 'owner_assignment' && currentUser?.userId) {
      data = { ...data, ownerId: currentUser.userId }
    }

    // Pre-populate assets from database creatives (only if not already set by user)
    if (needsCreatives && creatives && creatives.length > 0) {
      if (config.category === 'concepts' && !formData.assets) {
        data = {
          ...data,
          assets: creatives.map(c => ({ creativeId: c._id, storageId: c.storageId, notes: c.description || '' }))
        }
      } else if (config.category === 'revision' && !formData.revisedAssets) {
        data = {
          ...data,
          revisedAssets: creatives.map(c => ({ creativeId: c._id, storageId: c.storageId, revisionNotes: '' }))
        }
      } else if (config.category === 'legal_revision' && !formData.revisedAssets) {
        data = {
          ...data,
          revisedAssets: creatives.map(c => ({ creativeId: c._id, storageId: c.storageId, addressedIssue: '' }))
        }
      }
    }

    // Pre-populate KPI results from database KPIs (only if not already set by user)
    if (needsKPIs && kpis && kpis.length > 0 && !formData.kpiResults) {
      data = {
        ...data,
        kpiResults: kpis.map(k => ({
          kpiId: k._id,
          metric: k.metric,
          target: k.targetValue,
          actual: 0,
          percentAchieved: 0,
          analysis: ''
        }))
      }
    }

    return data
  }, [config.category, currentUser?.userId, formData, needsCreatives, creatives, needsKPIs, kpis])

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
      const message = err.message || 'Failed to start work item'
      setError(message)
      setFieldErrors(parseFieldErrors(message))
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
      const message = err.message || 'Failed to complete work item'
      setError(message)
      setFieldErrors(parseFieldErrors(message))
    },
  })

  const handleStart = () => {
    setError(null)
    setFieldErrors({})
    startMutation.mutate({
      workItemId,
      args: { name: taskType },
    })
  }

  const handleComplete = () => {
    setError(null)
    setFieldErrors({})
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
    if (config.category === 'approval' || config.category === 'review' || config.category === 'final_approval') {
      return !!effectiveFormData.decision
    }
    if (config.category === 'research') {
      return !!(
        effectiveFormData.audienceAnalysis &&
        effectiveFormData.competitiveInsights &&
        effectiveFormData.historicalLearnings
      )
    }
    if (config.category === 'metrics') {
      const kpis = effectiveFormData.kpis as Array<{ metric: string; targetValue: number; unit: string }> | undefined
      return !!(kpis && kpis.length > 0 && kpis.every(k => k.metric && k.unit && k.targetValue >= 0))
    }
    if (config.category === 'strategy') {
      const touchpoints = effectiveFormData.keyTouchpoints as string[] | undefined
      return !!(
        effectiveFormData.channelStrategy &&
        effectiveFormData.creativeApproach &&
        effectiveFormData.customerJourney &&
        touchpoints && touchpoints.length > 0
      )
    }
    if (config.category === 'plan') {
      const milestones = effectiveFormData.milestones as Array<{ name: string; targetDate: number }> | undefined
      return !!(
        effectiveFormData.timeline &&
        effectiveFormData.tactics &&
        effectiveFormData.segmentation &&
        effectiveFormData.resourceRequirements &&
        milestones && milestones.length > 0
      )
    }
    if (config.category === 'budget') {
      return !!(
        effectiveFormData.totalAmount !== undefined &&
        effectiveFormData.justification
      )
    }
    if (config.category === 'brief') {
      const keyMessages = effectiveFormData.keyMessages as string[] | undefined
      const deliverables = effectiveFormData.deliverables as Array<{ type: string; description: string }> | undefined
      return !!(
        effectiveFormData.objectives &&
        effectiveFormData.targetAudience &&
        effectiveFormData.toneAndStyle &&
        effectiveFormData.deadline &&
        keyMessages && keyMessages.length > 0 &&
        deliverables && deliverables.length > 0
      )
    }
    if (config.category === 'concepts') {
      const assets = effectiveFormData.assets as Array<{ creativeId: string }> | undefined
      return !!(assets && assets.length > 0 && assets.every(a => a.creativeId))
    }
    if (config.category === 'revision') {
      const revisedAssets = effectiveFormData.revisedAssets as Array<{ creativeId: string; revisionNotes: string }> | undefined
      return !!(revisedAssets && revisedAssets.length > 0 && revisedAssets.every(a => a.creativeId && a.revisionNotes))
    }
    if (config.category === 'legal_review') {
      return !!(effectiveFormData.decision && effectiveFormData.complianceNotes)
    }
    if (config.category === 'legal_revision') {
      const revisedAssets = effectiveFormData.revisedAssets as Array<{ creativeId: string; addressedIssue: string }> | undefined
      return !!(revisedAssets && revisedAssets.length > 0 && revisedAssets.every(a => a.creativeId && a.addressedIssue))
    }
    if (config.category === 'end_campaign') {
      const deactivatedComponents = effectiveFormData.deactivatedComponents as Array<{ component: string }> | undefined
      return !!(deactivatedComponents && deactivatedComponents.length > 0)
    }
    if (config.category === 'compile_data') {
      const dataSources = effectiveFormData.dataSources as Array<{ source: string }> | undefined
      return !!(dataSources && dataSources.length > 0 && effectiveFormData.dataLocation)
    }
    if (config.category === 'analysis') {
      return !!(
        effectiveFormData.overallAssessment &&
        (effectiveFormData.whatWorked as string[] | undefined)?.length
      )
    }
    if (config.category === 'presentation') {
      const attendees = effectiveFormData.attendees as string[] | undefined
      return !!(effectiveFormData.feedbackReceived && attendees && attendees.length > 0)
    }
    if (config.category === 'archive') {
      const archivedItems = effectiveFormData.archivedItems as Array<{ itemType: string }> | undefined
      return !!(archivedItems && archivedItems.length > 0 && effectiveFormData.archiveLocation)
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
            fieldErrors={fieldErrors}
            isPending={isPending}
            formData={effectiveFormData}
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
  fieldErrors,
  isPending,
  formData,
  setFormData,
  isFormValid,
  onComplete,
}: {
  config: TaskConfig
  error: string | null
  fieldErrors: Record<string, string>
  isPending: boolean
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
  isFormValid: boolean
  onComplete: () => void
}) {
  const hasFieldErrors = Object.keys(fieldErrors).length > 0

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
          {error && !hasFieldErrors && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {hasFieldErrors && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm text-destructive font-medium">
                Please fix the validation errors below
              </p>
            </div>
          )}

          {/* Render form based on category */}
          {(config.category === 'confirmation' || config.category === 'owner_assignment') && (
            <ConfirmationForm config={config} />
          )}

          {(config.category === 'approval' || config.category === 'review' || config.category === 'final_approval') && config.approvalOptions && (
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

          {config.category === 'research' && (
            <ResearchForm
              formData={formData}
              setFormData={setFormData}
            />
          )}

          {config.category === 'metrics' && (
            <MetricsForm formData={formData} setFormData={setFormData} />
          )}

          {config.category === 'strategy' && (
            <StrategyForm formData={formData} setFormData={setFormData} />
          )}

          {config.category === 'plan' && (
            <PlanForm formData={formData} setFormData={setFormData} />
          )}

          {config.category === 'budget' && (
            <BudgetForm formData={formData} setFormData={setFormData} />
          )}

          {config.category === 'brief' && (
            <BriefForm formData={formData} setFormData={setFormData} fieldErrors={fieldErrors} />
          )}

          {config.category === 'concepts' && (
            <ConceptsForm formData={effectiveFormData} setFormData={setFormData} />
          )}

          {config.category === 'revision' && (
            <RevisionForm formData={effectiveFormData} setFormData={setFormData} />
          )}

          {config.category === 'legal_review' && (
            <LegalReviewForm config={config} formData={formData} setFormData={setFormData} />
          )}

          {config.category === 'legal_revision' && (
            <LegalRevisionForm formData={effectiveFormData} setFormData={setFormData} />
          )}

          {config.category === 'end_campaign' && (
            <EndCampaignForm formData={formData} setFormData={setFormData} />
          )}

          {config.category === 'compile_data' && (
            <CompileDataForm formData={formData} setFormData={setFormData} />
          )}

          {config.category === 'analysis' && (
            <AnalysisForm formData={effectiveFormData} setFormData={setFormData} />
          )}

          {config.category === 'presentation' && (
            <PresentationForm formData={formData} setFormData={setFormData} />
          )}

          {config.category === 'archive' && (
            <ArchiveForm formData={formData} setFormData={setFormData} />
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

function ResearchForm({
  formData,
  setFormData,
}: {
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4">
        <h4 className="text-sm font-medium mb-2">Research Requirements:</h4>
        <p className="text-sm text-muted-foreground">
          Complete all required analysis sections below to document your research findings.
        </p>
      </div>

      <div>
        <Label htmlFor="audienceAnalysis" className="text-sm font-medium">
          Audience Analysis <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="audienceAnalysis"
          placeholder="Describe target audience demographics, behaviors, and preferences..."
          value={(formData.audienceAnalysis as string) || ''}
          onChange={(e) => setFormData({ ...formData, audienceAnalysis: e.target.value })}
          className="mt-2"
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="competitiveInsights" className="text-sm font-medium">
          Competitive Insights <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="competitiveInsights"
          placeholder="Summarize competitor campaigns, positioning, and market gaps..."
          value={(formData.competitiveInsights as string) || ''}
          onChange={(e) => setFormData({ ...formData, competitiveInsights: e.target.value })}
          className="mt-2"
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="historicalLearnings" className="text-sm font-medium">
          Historical Learnings <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="historicalLearnings"
          placeholder="Document insights from past campaigns and what worked or didn't..."
          value={(formData.historicalLearnings as string) || ''}
          onChange={(e) => setFormData({ ...formData, historicalLearnings: e.target.value })}
          className="mt-2"
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="marketTimingNotes" className="text-sm font-medium">
          Market Timing Notes <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="marketTimingNotes"
          placeholder="Notes on seasonality, market conditions, or timing considerations..."
          value={(formData.marketTimingNotes as string) || ''}
          onChange={(e) => setFormData({ ...formData, marketTimingNotes: e.target.value })}
          className="mt-2"
          rows={2}
        />
      </div>
    </div>
  )
}

// ============= Phase 2 Forms =============

function MetricsForm({
  formData,
  setFormData,
}: {
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
}) {
  const kpis = (formData.kpis as Array<{ metric: string; targetValue: number; unit: string }>) || []

  const addKpi = () => {
    setFormData({ ...formData, kpis: [...kpis, { metric: '', targetValue: 0, unit: '' }] })
  }

  const removeKpi = (index: number) => {
    setFormData({ ...formData, kpis: kpis.filter((_, i) => i !== index) })
  }

  const updateKpi = (index: number, field: string, value: string | number) => {
    const updated = kpis.map((k, i) => (i === index ? { ...k, [field]: value } : k))
    setFormData({ ...formData, kpis: updated })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4">
        <h4 className="text-sm font-medium mb-2">Define KPIs</h4>
        <p className="text-sm text-muted-foreground">
          Add at least one KPI with metric name, target value, and unit of measurement.
        </p>
      </div>

      {kpis.map((kpi, index) => (
        <div key={index} className="rounded-lg border p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">KPI {index + 1}</span>
            {kpis.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => removeKpi(index)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Metric <span className="text-destructive">*</span></Label>
              <Input
                value={kpi.metric}
                onChange={(e) => updateKpi(index, 'metric', e.target.value)}
                placeholder="e.g., CTR"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Target <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                value={kpi.targetValue}
                onChange={(e) => updateKpi(index, 'targetValue', parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Unit <span className="text-destructive">*</span></Label>
              <Input
                value={kpi.unit}
                onChange={(e) => updateKpi(index, 'unit', e.target.value)}
                placeholder="e.g., %"
                className="mt-1"
              />
            </div>
          </div>
        </div>
      ))}

      <Button variant="outline" onClick={addKpi} className="w-full">
        <Plus className="mr-2 h-4 w-4" /> Add KPI
      </Button>
    </div>
  )
}

function StrategyForm({
  formData,
  setFormData,
}: {
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
}) {
  const touchpoints = (formData.keyTouchpoints as string[]) || []

  const addTouchpoint = () => {
    setFormData({ ...formData, keyTouchpoints: [...touchpoints, ''] })
  }

  const removeTouchpoint = (index: number) => {
    setFormData({ ...formData, keyTouchpoints: touchpoints.filter((_, i) => i !== index) })
  }

  const updateTouchpoint = (index: number, value: string) => {
    const updated = touchpoints.map((t, i) => (i === index ? value : t))
    setFormData({ ...formData, keyTouchpoints: updated })
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="channelStrategy" className="text-sm font-medium">
          Channel Strategy <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="channelStrategy"
          placeholder="Describe the channel strategy..."
          value={(formData.channelStrategy as string) || ''}
          onChange={(e) => setFormData({ ...formData, channelStrategy: e.target.value })}
          className="mt-2"
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="creativeApproach" className="text-sm font-medium">
          Creative Approach <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="creativeApproach"
          placeholder="Describe the creative approach..."
          value={(formData.creativeApproach as string) || ''}
          onChange={(e) => setFormData({ ...formData, creativeApproach: e.target.value })}
          className="mt-2"
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="customerJourney" className="text-sm font-medium">
          Customer Journey <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="customerJourney"
          placeholder="Describe the customer journey..."
          value={(formData.customerJourney as string) || ''}
          onChange={(e) => setFormData({ ...formData, customerJourney: e.target.value })}
          className="mt-2"
          rows={3}
        />
      </div>

      <div>
        <Label className="text-sm font-medium">
          Key Touchpoints <span className="text-destructive">*</span>
        </Label>
        <div className="mt-2 space-y-2">
          {touchpoints.map((tp, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={tp}
                onChange={(e) => updateTouchpoint(index, e.target.value)}
                placeholder={`Touchpoint ${index + 1}`}
              />
              {touchpoints.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeTouchpoint(index)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
          <Button variant="outline" onClick={addTouchpoint} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Touchpoint
          </Button>
        </div>
      </div>
    </div>
  )
}

function PlanForm({
  formData,
  setFormData,
}: {
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
}) {
  const milestones = (formData.milestones as Array<{ name: string; targetDate: number }>) || []

  const addMilestone = () => {
    setFormData({ ...formData, milestones: [...milestones, { name: '', targetDate: Date.now() }] })
  }

  const removeMilestone = (index: number) => {
    setFormData({ ...formData, milestones: milestones.filter((_, i) => i !== index) })
  }

  const updateMilestone = (index: number, field: string, value: string | number) => {
    const updated = milestones.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    setFormData({ ...formData, milestones: updated })
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="timeline" className="text-sm font-medium">
          Timeline <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="timeline"
          placeholder="Describe the overall timeline..."
          value={(formData.timeline as string) || ''}
          onChange={(e) => setFormData({ ...formData, timeline: e.target.value })}
          className="mt-2"
          rows={2}
        />
      </div>

      <div>
        <Label className="text-sm font-medium">
          Milestones <span className="text-destructive">*</span>
        </Label>
        <div className="mt-2 space-y-2">
          {milestones.map((m, index) => (
            <div key={index} className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={m.name}
                  onChange={(e) => updateMilestone(index, 'name', e.target.value)}
                  placeholder="Milestone name"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs">Target Date</Label>
                <Input
                  type="date"
                  value={new Date(m.targetDate).toISOString().split('T')[0]}
                  onChange={(e) => updateMilestone(index, 'targetDate', new Date(e.target.value).getTime())}
                />
              </div>
              {milestones.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeMilestone(index)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
          <Button variant="outline" onClick={addMilestone} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Milestone
          </Button>
        </div>
      </div>

      <div>
        <Label htmlFor="tactics" className="text-sm font-medium">
          Tactics <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="tactics"
          placeholder="Describe the tactics..."
          value={(formData.tactics as string) || ''}
          onChange={(e) => setFormData({ ...formData, tactics: e.target.value })}
          className="mt-2"
          rows={2}
        />
      </div>

      <div>
        <Label htmlFor="segmentation" className="text-sm font-medium">
          Segmentation <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="segmentation"
          placeholder="Describe the segmentation..."
          value={(formData.segmentation as string) || ''}
          onChange={(e) => setFormData({ ...formData, segmentation: e.target.value })}
          className="mt-2"
          rows={2}
        />
      </div>

      <div>
        <Label htmlFor="resourceRequirements" className="text-sm font-medium">
          Resource Requirements <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="resourceRequirements"
          placeholder="Describe the resource requirements..."
          value={(formData.resourceRequirements as string) || ''}
          onChange={(e) => setFormData({ ...formData, resourceRequirements: e.target.value })}
          className="mt-2"
          rows={2}
        />
      </div>
    </div>
  )
}

// ============= Phase 3 Forms =============

function BudgetForm({
  formData,
  setFormData,
}: {
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4">
        <h4 className="text-sm font-medium mb-2">Budget Breakdown</h4>
        <p className="text-sm text-muted-foreground">
          Enter the budget allocation for each category. All amounts should be non-negative.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="totalAmount" className="text-sm font-medium">
            Total Amount <span className="text-destructive">*</span>
          </Label>
          <Input
            id="totalAmount"
            type="number"
            value={(formData.totalAmount as number) ?? ''}
            onChange={(e) => setFormData({ ...formData, totalAmount: parseFloat(e.target.value) || 0 })}
            placeholder="0"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="mediaSpend" className="text-sm font-medium">Media Spend</Label>
          <Input
            id="mediaSpend"
            type="number"
            value={(formData.mediaSpend as number) ?? ''}
            onChange={(e) => setFormData({ ...formData, mediaSpend: parseFloat(e.target.value) || 0 })}
            placeholder="0"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="creativeProduction" className="text-sm font-medium">Creative Production</Label>
          <Input
            id="creativeProduction"
            type="number"
            value={(formData.creativeProduction as number) ?? ''}
            onChange={(e) => setFormData({ ...formData, creativeProduction: parseFloat(e.target.value) || 0 })}
            placeholder="0"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="technologyTools" className="text-sm font-medium">Technology Tools</Label>
          <Input
            id="technologyTools"
            type="number"
            value={(formData.technologyTools as number) ?? ''}
            onChange={(e) => setFormData({ ...formData, technologyTools: parseFloat(e.target.value) || 0 })}
            placeholder="0"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="agencyFees" className="text-sm font-medium">Agency Fees</Label>
          <Input
            id="agencyFees"
            type="number"
            value={(formData.agencyFees as number) ?? ''}
            onChange={(e) => setFormData({ ...formData, agencyFees: parseFloat(e.target.value) || 0 })}
            placeholder="0"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="eventCosts" className="text-sm font-medium">Event Costs</Label>
          <Input
            id="eventCosts"
            type="number"
            value={(formData.eventCosts as number) ?? ''}
            onChange={(e) => setFormData({ ...formData, eventCosts: parseFloat(e.target.value) || 0 })}
            placeholder="0"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="contingency" className="text-sm font-medium">Contingency</Label>
          <Input
            id="contingency"
            type="number"
            value={(formData.contingency as number) ?? ''}
            onChange={(e) => setFormData({ ...formData, contingency: parseFloat(e.target.value) || 0 })}
            placeholder="0"
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="justification" className="text-sm font-medium">
          Budget Justification <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="justification"
          placeholder="Explain the budget allocation..."
          value={(formData.justification as string) || ''}
          onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
          className="mt-2"
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="roiProjection" className="text-sm font-medium">
          ROI Projection <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="roiProjection"
          placeholder="Describe the expected ROI..."
          value={(formData.roiProjection as string) || ''}
          onChange={(e) => setFormData({ ...formData, roiProjection: e.target.value })}
          className="mt-2"
          rows={2}
        />
      </div>
    </div>
  )
}

// ============= Phase 4 Forms =============

/**
 * Inline field error display component
 */
function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-xs text-destructive">{message}</p>
  )
}

/**
 * Helper to get field error for a path
 */
function getFieldError(fieldErrors: Record<string, string>, ...pathParts: (string | number)[]): string | undefined {
  const key = pathParts.join('.')
  return fieldErrors[key]
}

function BriefForm({
  formData,
  setFormData,
  fieldErrors = {},
}: {
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
  fieldErrors?: Record<string, string>
}) {
  const keyMessages = (formData.keyMessages as string[]) || []
  const deliverables = (formData.deliverables as Array<{ type: string; description: string }>) || []
  const references = (formData.references as string[]) || []

  const deliverableTypes = ['ad', 'email', 'landing_page', 'social_post', 'video']

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="objectives" className="text-sm font-medium">
          Objectives <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="objectives"
          placeholder="Describe the creative objectives..."
          value={(formData.objectives as string) || ''}
          onChange={(e) => setFormData({ ...formData, objectives: e.target.value })}
          className={`mt-2 ${getFieldError(fieldErrors, 'objectives') ? 'border-destructive' : ''}`}
          rows={2}
        />
        <FieldError message={getFieldError(fieldErrors, 'objectives')} />
      </div>

      <div>
        <Label htmlFor="targetAudience" className="text-sm font-medium">
          Target Audience <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="targetAudience"
          placeholder="Describe the target audience..."
          value={(formData.targetAudience as string) || ''}
          onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
          className={`mt-2 ${getFieldError(fieldErrors, 'targetAudience') ? 'border-destructive' : ''}`}
          rows={2}
        />
        <FieldError message={getFieldError(fieldErrors, 'targetAudience')} />
      </div>

      <div>
        <Label className="text-sm font-medium">
          Key Messages <span className="text-destructive">*</span>
        </Label>
        <FieldError message={getFieldError(fieldErrors, 'keyMessages')} />
        <div className="mt-2 space-y-2">
          {keyMessages.map((msg, index) => (
            <div key={index}>
              <div className="flex gap-2">
                <Input
                  value={msg}
                  onChange={(e) => {
                    const updated = keyMessages.map((m, i) => (i === index ? e.target.value : m))
                    setFormData({ ...formData, keyMessages: updated })
                  }}
                  placeholder={`Key message ${index + 1}`}
                  className={getFieldError(fieldErrors, 'keyMessages', index) ? 'border-destructive' : ''}
                />
                {keyMessages.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => {
                    setFormData({ ...formData, keyMessages: keyMessages.filter((_, i) => i !== index) })
                  }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              <FieldError message={getFieldError(fieldErrors, 'keyMessages', index)} />
            </div>
          ))}
          <Button variant="outline" onClick={() => setFormData({ ...formData, keyMessages: [...keyMessages, ''] })} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Key Message
          </Button>
        </div>
      </div>

      <div>
        <Label htmlFor="toneAndStyle" className="text-sm font-medium">
          Tone and Style <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="toneAndStyle"
          placeholder="Describe the tone and style..."
          value={(formData.toneAndStyle as string) || ''}
          onChange={(e) => setFormData({ ...formData, toneAndStyle: e.target.value })}
          className={`mt-2 ${getFieldError(fieldErrors, 'toneAndStyle') ? 'border-destructive' : ''}`}
          rows={2}
        />
        <FieldError message={getFieldError(fieldErrors, 'toneAndStyle')} />
      </div>

      <div>
        <Label className="text-sm font-medium">
          Deliverables <span className="text-destructive">*</span>
        </Label>
        <FieldError message={getFieldError(fieldErrors, 'deliverables')} />
        <div className="mt-2 space-y-3">
          {deliverables.map((d, index) => (
            <div key={index} className="space-y-1">
              <div className="flex gap-2 items-end">
                <div className="w-1/3">
                  <Select
                    value={d.type}
                    onValueChange={(value) => {
                      const updated = deliverables.map((x, i) => (i === index ? { ...x, type: value } : x))
                      setFormData({ ...formData, deliverables: updated })
                    }}
                  >
                    <SelectTrigger className={getFieldError(fieldErrors, 'deliverables', index, 'type') ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Type *" />
                    </SelectTrigger>
                    <SelectContent>
                      {deliverableTypes.map((t) => (
                        <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Input
                    value={d.description}
                    onChange={(e) => {
                      const updated = deliverables.map((x, i) => (i === index ? { ...x, description: e.target.value } : x))
                      setFormData({ ...formData, deliverables: updated })
                    }}
                    placeholder="Description (required)"
                    className={getFieldError(fieldErrors, 'deliverables', index, 'description') ? 'border-destructive' : ''}
                  />
                </div>
                {deliverables.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => {
                    setFormData({ ...formData, deliverables: deliverables.filter((_, i) => i !== index) })
                  }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <div className="w-1/3">
                  <FieldError message={getFieldError(fieldErrors, 'deliverables', index, 'type')} />
                </div>
                <div className="flex-1">
                  <FieldError message={getFieldError(fieldErrors, 'deliverables', index, 'description')} />
                </div>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={() => setFormData({ ...formData, deliverables: [...deliverables, { type: '', description: '' }] })} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Deliverable
          </Button>
        </div>
      </div>

      <div>
        <Label htmlFor="deadline" className="text-sm font-medium">
          Deadline <span className="text-destructive">*</span>
        </Label>
        <Input
          id="deadline"
          type="date"
          value={formData.deadline ? new Date(formData.deadline as number).toISOString().split('T')[0] : ''}
          onChange={(e) => setFormData({ ...formData, deadline: new Date(e.target.value).getTime() })}
          className="mt-2"
        />
      </div>

      <div>
        <Label className="text-sm font-medium">
          References <span className="text-muted-foreground">(optional)</span>
        </Label>
        <div className="mt-2 space-y-2">
          {references.map((ref, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={ref}
                onChange={(e) => {
                  const updated = references.map((r, i) => (i === index ? e.target.value : r))
                  setFormData({ ...formData, references: updated })
                }}
                placeholder="Reference URL or description"
              />
              <Button variant="ghost" size="icon" onClick={() => {
                setFormData({ ...formData, references: references.filter((_, i) => i !== index) })
              }}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={() => setFormData({ ...formData, references: [...references, ''] })} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Reference
          </Button>
        </div>
      </div>
    </div>
  )
}

function ConceptsForm({
  formData,
  setFormData,
}: {
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
}) {
  const assets = (formData.assets as Array<{ creativeId: string; storageId?: string; notes?: string }>) || []

  const updateAsset = (index: number, field: string, value: string) => {
    const updated = assets.map((a, i) => (i === index ? { ...a, [field]: value } : a))
    setFormData({ ...formData, assets: updated })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4">
        <h4 className="text-sm font-medium mb-2">Creative Assets</h4>
        <p className="text-sm text-muted-foreground">
          Complete the creative assets defined in the brief. Add notes describing your work on each asset.
        </p>
      </div>

      {assets.length === 0 && (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Loading creative assets...
        </div>
      )}

      {assets.map((asset, index) => (
        <div key={asset.creativeId || index} className="rounded-lg border p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Asset {index + 1}</span>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Asset ID</Label>
            <Input
              value={asset.creativeId}
              disabled
              className="mt-1 bg-muted/50 font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea
              value={asset.notes || ''}
              onChange={(e) => updateAsset(index, 'notes', e.target.value)}
              placeholder="Describe the creative work completed for this asset..."
              className="mt-1"
              rows={2}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function RevisionForm({
  formData,
  setFormData,
}: {
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
}) {
  const revisedAssets = (formData.revisedAssets as Array<{ creativeId: string; storageId?: string; revisionNotes: string }>) || []

  const updateAsset = (index: number, field: string, value: string) => {
    const updated = revisedAssets.map((a, i) => (i === index ? { ...a, [field]: value } : a))
    setFormData({ ...formData, revisedAssets: updated })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4">
        <h4 className="text-sm font-medium mb-2">Revised Assets</h4>
        <p className="text-sm text-muted-foreground">
          Document the revisions made to each creative asset based on feedback.
        </p>
      </div>

      {revisedAssets.length === 0 && (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Loading creative assets...
        </div>
      )}

      {revisedAssets.map((asset, index) => (
        <div key={asset.creativeId || index} className="rounded-lg border p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Revised Asset {index + 1}</span>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Asset ID</Label>
            <Input
              value={asset.creativeId}
              disabled
              className="mt-1 bg-muted/50 font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Revision Notes <span className="text-destructive">*</span></Label>
            <Textarea
              value={asset.revisionNotes}
              onChange={(e) => updateAsset(index, 'revisionNotes', e.target.value)}
              placeholder="Describe the changes made to address feedback..."
              className="mt-1"
              rows={2}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function LegalReviewForm({
  config,
  formData,
  setFormData,
}: {
  config: TaskConfig
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
}) {
  const requiredChanges = (formData.requiredChanges as Array<{ creativeId: string; issue: string; requiredFix: string }>) || []

  const getOptionIcon = (value: string) => {
    if (value === 'approved') {
      return <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
    }
    return <RefreshCw className="h-4 w-4 text-amber-500 flex-shrink-0" />
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Decision <span className="text-destructive">*</span></Label>
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
        <Label htmlFor="complianceNotes" className="text-sm font-medium">
          Compliance Notes <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="complianceNotes"
          placeholder="Document compliance review findings..."
          value={(formData.complianceNotes as string) || ''}
          onChange={(e) => setFormData({ ...formData, complianceNotes: e.target.value })}
          className="mt-2"
          rows={3}
        />
      </div>

      {formData.decision === 'needs_changes' && (
        <div>
          <Label className="text-sm font-medium">
            Required Changes <span className="text-muted-foreground">(optional)</span>
          </Label>
          <div className="mt-2 space-y-2">
            {requiredChanges.map((change, index) => (
              <div key={index} className="rounded-lg border p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs font-medium">Change {index + 1}</span>
                  <Button variant="ghost" size="sm" onClick={() => {
                    setFormData({ ...formData, requiredChanges: requiredChanges.filter((_, i) => i !== index) })
                  }}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
                <Input
                  value={change.creativeId}
                  onChange={(e) => {
                    const updated = requiredChanges.map((c, i) => (i === index ? { ...c, creativeId: e.target.value } : c))
                    setFormData({ ...formData, requiredChanges: updated })
                  }}
                  placeholder="Asset ID"
                />
                <Input
                  value={change.issue}
                  onChange={(e) => {
                    const updated = requiredChanges.map((c, i) => (i === index ? { ...c, issue: e.target.value } : c))
                    setFormData({ ...formData, requiredChanges: updated })
                  }}
                  placeholder="Issue"
                />
                <Input
                  value={change.requiredFix}
                  onChange={(e) => {
                    const updated = requiredChanges.map((c, i) => (i === index ? { ...c, requiredFix: e.target.value } : c))
                    setFormData({ ...formData, requiredChanges: updated })
                  }}
                  placeholder="Required fix"
                />
              </div>
            ))}
            <Button variant="outline" onClick={() => setFormData({ ...formData, requiredChanges: [...requiredChanges, { creativeId: '', issue: '', requiredFix: '' }] })} className="w-full">
              <Plus className="mr-2 h-4 w-4" /> Add Required Change
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function LegalRevisionForm({
  formData,
  setFormData,
}: {
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
}) {
  const revisedAssets = (formData.revisedAssets as Array<{ creativeId: string; storageId?: string; addressedIssue: string }>) || []

  const updateAsset = (index: number, field: string, value: string) => {
    const updated = revisedAssets.map((a, i) => (i === index ? { ...a, [field]: value } : a))
    setFormData({ ...formData, revisedAssets: updated })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4">
        <h4 className="text-sm font-medium mb-2">Legal Revisions</h4>
        <p className="text-sm text-muted-foreground">
          Document the legal issues you&apos;ve addressed in each creative asset.
        </p>
      </div>

      {revisedAssets.length === 0 && (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Loading creative assets...
        </div>
      )}

      {revisedAssets.map((asset, index) => (
        <div key={asset.creativeId || index} className="rounded-lg border p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Asset {index + 1}</span>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Asset ID</Label>
            <Input
              value={asset.creativeId}
              disabled
              className="mt-1 bg-muted/50 font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Addressed Issue <span className="text-destructive">*</span></Label>
            <Textarea
              value={asset.addressedIssue}
              onChange={(e) => updateAsset(index, 'addressedIssue', e.target.value)}
              placeholder="Describe the legal issue that was addressed..."
              className="mt-1"
              rows={2}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ============= Phase 8 Forms =============

function EndCampaignForm({
  formData,
  setFormData,
}: {
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
}) {
  const deactivatedComponents = (formData.deactivatedComponents as Array<{ component: string; platform?: string; deactivatedAt: number }>) || []
  const componentTypes = ['ads', 'emails', 'landing_pages', 'social', 'offers']

  const addComponent = () => {
    setFormData({
      ...formData,
      deactivatedComponents: [...deactivatedComponents, { component: '', deactivatedAt: Date.now() }],
    })
  }

  const removeComponent = (index: number) => {
    setFormData({ ...formData, deactivatedComponents: deactivatedComponents.filter((_, i) => i !== index) })
  }

  const updateComponent = (index: number, field: string, value: string | number) => {
    const updated = deactivatedComponents.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    setFormData({ ...formData, deactivatedComponents: updated })
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="endedAt" className="text-sm font-medium">
          End Date <span className="text-destructive">*</span>
        </Label>
        <Input
          id="endedAt"
          type="date"
          value={formData.endedAt ? new Date(formData.endedAt as number).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
          onChange={(e) => setFormData({ ...formData, endedAt: new Date(e.target.value).getTime() })}
          className="mt-2"
        />
      </div>

      <div>
        <Label className="text-sm font-medium">
          Deactivated Components <span className="text-destructive">*</span>
        </Label>
        <div className="mt-2 space-y-2">
          {deactivatedComponents.map((comp, index) => (
            <div key={index} className="flex gap-2 items-end">
              <div className="w-1/3">
                <Select
                  value={comp.component}
                  onValueChange={(value) => updateComponent(index, 'component', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Component" />
                  </SelectTrigger>
                  <SelectContent>
                    {componentTypes.map((t) => (
                      <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Input
                  value={comp.platform || ''}
                  onChange={(e) => updateComponent(index, 'platform', e.target.value)}
                  placeholder="Platform (optional)"
                />
              </div>
              {deactivatedComponents.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeComponent(index)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
          <Button variant="outline" onClick={addComponent} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Component
          </Button>
        </div>
      </div>

      <div>
        <Label htmlFor="remainingBudget" className="text-sm font-medium">
          Remaining Budget <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="remainingBudget"
          type="number"
          value={(formData.remainingBudget as number) ?? ''}
          onChange={(e) => setFormData({ ...formData, remainingBudget: parseFloat(e.target.value) || undefined })}
          placeholder="0"
          className="mt-2"
        />
      </div>

      <div>
        <Label htmlFor="endNotes" className="text-sm font-medium">
          End Notes <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="endNotes"
          placeholder="Any notes about ending the campaign..."
          value={(formData.endNotes as string) || ''}
          onChange={(e) => setFormData({ ...formData, endNotes: e.target.value })}
          className="mt-2"
          rows={2}
        />
      </div>
    </div>
  )
}

function CompileDataForm({
  formData,
  setFormData,
}: {
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
}) {
  const dataSources = (formData.dataSources as Array<{ source: string; metricsCollected: string[]; dataRange: { start: number; end: number } }>) || []
  const aggregatedMetrics = (formData.aggregatedMetrics as { totalImpressions?: number; totalClicks?: number; totalConversions?: number; totalSpend: number; totalRevenue?: number }) || { totalSpend: 0 }

  const addDataSource = () => {
    setFormData({
      ...formData,
      dataSources: [...dataSources, { source: '', metricsCollected: [], dataRange: { start: Date.now(), end: Date.now() } }],
    })
  }

  const removeDataSource = (index: number) => {
    setFormData({ ...formData, dataSources: dataSources.filter((_, i) => i !== index) })
  }

  const updateDataSource = (index: number, field: string, value: unknown) => {
    const updated = dataSources.map((d, i) => (i === index ? { ...d, [field]: value } : d))
    setFormData({ ...formData, dataSources: updated })
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">
          Data Sources <span className="text-destructive">*</span>
        </Label>
        <div className="mt-2 space-y-3">
          {dataSources.map((ds, index) => (
            <div key={index} className="rounded-lg border p-3 space-y-2">
              <div className="flex justify-between">
                <span className="text-xs font-medium">Source {index + 1}</span>
                {dataSources.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removeDataSource(index)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                )}
              </div>
              <Input
                value={ds.source}
                onChange={(e) => updateDataSource(index, 'source', e.target.value)}
                placeholder="Source name (e.g., Google Analytics)"
              />
              <Input
                value={ds.metricsCollected.join(', ')}
                onChange={(e) => updateDataSource(index, 'metricsCollected', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="Metrics collected (comma-separated)"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Start Date</Label>
                  <Input
                    type="date"
                    value={new Date(ds.dataRange.start).toISOString().split('T')[0]}
                    onChange={(e) => updateDataSource(index, 'dataRange', { ...ds.dataRange, start: new Date(e.target.value).getTime() })}
                  />
                </div>
                <div>
                  <Label className="text-xs">End Date</Label>
                  <Input
                    type="date"
                    value={new Date(ds.dataRange.end).toISOString().split('T')[0]}
                    onChange={(e) => updateDataSource(index, 'dataRange', { ...ds.dataRange, end: new Date(e.target.value).getTime() })}
                  />
                </div>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={addDataSource} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Data Source
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium">Aggregated Metrics</Label>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Total Spend <span className="text-destructive">*</span></Label>
            <Input
              type="number"
              value={aggregatedMetrics.totalSpend ?? ''}
              onChange={(e) => setFormData({ ...formData, aggregatedMetrics: { ...aggregatedMetrics, totalSpend: parseFloat(e.target.value) || 0 } })}
              placeholder="0"
            />
          </div>
          <div>
            <Label className="text-xs">Total Revenue</Label>
            <Input
              type="number"
              value={aggregatedMetrics.totalRevenue ?? ''}
              onChange={(e) => setFormData({ ...formData, aggregatedMetrics: { ...aggregatedMetrics, totalRevenue: parseFloat(e.target.value) || undefined } })}
              placeholder="0"
            />
          </div>
          <div>
            <Label className="text-xs">Total Impressions</Label>
            <Input
              type="number"
              value={aggregatedMetrics.totalImpressions ?? ''}
              onChange={(e) => setFormData({ ...formData, aggregatedMetrics: { ...aggregatedMetrics, totalImpressions: parseFloat(e.target.value) || undefined } })}
              placeholder="0"
            />
          </div>
          <div>
            <Label className="text-xs">Total Clicks</Label>
            <Input
              type="number"
              value={aggregatedMetrics.totalClicks ?? ''}
              onChange={(e) => setFormData({ ...formData, aggregatedMetrics: { ...aggregatedMetrics, totalClicks: parseFloat(e.target.value) || undefined } })}
              placeholder="0"
            />
          </div>
          <div>
            <Label className="text-xs">Total Conversions</Label>
            <Input
              type="number"
              value={aggregatedMetrics.totalConversions ?? ''}
              onChange={(e) => setFormData({ ...formData, aggregatedMetrics: { ...aggregatedMetrics, totalConversions: parseFloat(e.target.value) || undefined } })}
              placeholder="0"
            />
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="dataLocation" className="text-sm font-medium">
          Data Location <span className="text-destructive">*</span>
        </Label>
        <Input
          id="dataLocation"
          value={(formData.dataLocation as string) || ''}
          onChange={(e) => setFormData({ ...formData, dataLocation: e.target.value })}
          placeholder="Where is the compiled data stored?"
          className="mt-2"
        />
      </div>
    </div>
  )
}

function AnalysisForm({
  formData,
  setFormData,
}: {
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
}) {
  const kpiResults = (formData.kpiResults as Array<{ kpiId: string; metric: string; target: number; actual: number; percentAchieved: number; analysis: string }>) || []
  const whatWorked = (formData.whatWorked as string[]) || []
  const whatDidntWork = (formData.whatDidntWork as string[]) || []
  const lessonsLearned = (formData.lessonsLearned as string[]) || []
  const recommendationsForFuture = (formData.recommendationsForFuture as string[]) || []

  const assessmentOptions = [
    { value: 'exceeded_goals', label: 'Exceeded Goals' },
    { value: 'met_goals', label: 'Met Goals' },
    { value: 'partially_met', label: 'Partially Met' },
    { value: 'did_not_meet', label: 'Did Not Meet' },
  ]

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">
          Overall Assessment <span className="text-destructive">*</span>
        </Label>
        <Select
          value={(formData.overallAssessment as string) || ''}
          onValueChange={(value) => setFormData({ ...formData, overallAssessment: value })}
        >
          <SelectTrigger className="mt-2">
            <SelectValue placeholder="Select assessment" />
          </SelectTrigger>
          <SelectContent>
            {assessmentOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm font-medium">
          What Worked <span className="text-destructive">*</span>
        </Label>
        <div className="mt-2 space-y-2">
          {whatWorked.map((item, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={item}
                onChange={(e) => {
                  const updated = whatWorked.map((w, i) => (i === index ? e.target.value : w))
                  setFormData({ ...formData, whatWorked: updated })
                }}
                placeholder="What worked well..."
              />
              {whatWorked.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => {
                  setFormData({ ...formData, whatWorked: whatWorked.filter((_, i) => i !== index) })
                }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
          <Button variant="outline" onClick={() => setFormData({ ...formData, whatWorked: [...whatWorked, ''] })} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Item
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium">What Didn&apos;t Work</Label>
        <div className="mt-2 space-y-2">
          {whatDidntWork.map((item, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={item}
                onChange={(e) => {
                  const updated = whatDidntWork.map((w, i) => (i === index ? e.target.value : w))
                  setFormData({ ...formData, whatDidntWork: updated })
                }}
                placeholder="What didn't work..."
              />
              <Button variant="ghost" size="icon" onClick={() => {
                setFormData({ ...formData, whatDidntWork: whatDidntWork.filter((_, i) => i !== index) })
              }}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={() => setFormData({ ...formData, whatDidntWork: [...whatDidntWork, ''] })} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Item
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium">Lessons Learned</Label>
        <div className="mt-2 space-y-2">
          {lessonsLearned.map((item, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={item}
                onChange={(e) => {
                  const updated = lessonsLearned.map((l, i) => (i === index ? e.target.value : l))
                  setFormData({ ...formData, lessonsLearned: updated })
                }}
                placeholder="Lesson learned..."
              />
              <Button variant="ghost" size="icon" onClick={() => {
                setFormData({ ...formData, lessonsLearned: lessonsLearned.filter((_, i) => i !== index) })
              }}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={() => setFormData({ ...formData, lessonsLearned: [...lessonsLearned, ''] })} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Lesson
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium">Recommendations for Future</Label>
        <div className="mt-2 space-y-2">
          {recommendationsForFuture.map((item, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={item}
                onChange={(e) => {
                  const updated = recommendationsForFuture.map((r, i) => (i === index ? e.target.value : r))
                  setFormData({ ...formData, recommendationsForFuture: updated })
                }}
                placeholder="Recommendation..."
              />
              <Button variant="ghost" size="icon" onClick={() => {
                setFormData({ ...formData, recommendationsForFuture: recommendationsForFuture.filter((_, i) => i !== index) })
              }}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={() => setFormData({ ...formData, recommendationsForFuture: [...recommendationsForFuture, ''] })} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Recommendation
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium">KPI Results</Label>
        <p className="text-xs text-muted-foreground mt-1">Fill in actual values and analysis for each KPI defined during planning</p>
        <div className="mt-2 space-y-3">
          {kpiResults.map((kpi, index) => (
            <div key={kpi.kpiId || index} className="rounded-lg border p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium">{kpi.metric || `KPI ${index + 1}`}</span>
                <span className="text-xs text-muted-foreground">Target: {kpi.target}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  value={kpi.actual}
                  onChange={(e) => {
                    const updated = kpiResults.map((k, i) => (i === index ? { ...k, actual: parseFloat(e.target.value) || 0 } : k))
                    setFormData({ ...formData, kpiResults: updated })
                  }}
                  placeholder="Actual value"
                />
                <Input
                  type="number"
                  value={kpi.percentAchieved}
                  onChange={(e) => {
                    const updated = kpiResults.map((k, i) => (i === index ? { ...k, percentAchieved: parseFloat(e.target.value) || 0 } : k))
                    setFormData({ ...formData, kpiResults: updated })
                  }}
                  placeholder="% Achieved"
                />
              </div>
              <Textarea
                value={kpi.analysis}
                onChange={(e) => {
                  const updated = kpiResults.map((k, i) => (i === index ? { ...k, analysis: e.target.value } : k))
                  setFormData({ ...formData, kpiResults: updated })
                }}
                placeholder="Analysis of this KPI's performance"
                rows={2}
              />
            </div>
          ))}
          {kpiResults.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No KPIs defined for this campaign</p>
          )}
        </div>
      </div>
    </div>
  )
}

function PresentationForm({
  formData,
  setFormData,
}: {
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
}) {
  const attendees = (formData.attendees as string[]) || []
  const followUpActions = (formData.followUpActions as Array<{ action: string; owner: string; dueDate?: number }>) || []

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="presentationDate" className="text-sm font-medium">
          Presentation Date <span className="text-destructive">*</span>
        </Label>
        <Input
          id="presentationDate"
          type="date"
          value={formData.presentationDate ? new Date(formData.presentationDate as number).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
          onChange={(e) => setFormData({ ...formData, presentationDate: new Date(e.target.value).getTime() })}
          className="mt-2"
        />
      </div>

      <div>
        <Label className="text-sm font-medium">
          Attendees <span className="text-destructive">*</span>
        </Label>
        <div className="mt-2 space-y-2">
          {attendees.map((attendee, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={attendee}
                onChange={(e) => {
                  const updated = attendees.map((a, i) => (i === index ? e.target.value : a))
                  setFormData({ ...formData, attendees: updated })
                }}
                placeholder="Attendee name"
              />
              {attendees.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => {
                  setFormData({ ...formData, attendees: attendees.filter((_, i) => i !== index) })
                }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
          <Button variant="outline" onClick={() => setFormData({ ...formData, attendees: [...attendees, ''] })} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Attendee
          </Button>
        </div>
      </div>

      <div>
        <Label htmlFor="presentationUrl" className="text-sm font-medium">
          Presentation URL <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="presentationUrl"
          value={(formData.presentationUrl as string) || ''}
          onChange={(e) => setFormData({ ...formData, presentationUrl: e.target.value })}
          placeholder="https://..."
          className="mt-2"
        />
      </div>

      <div>
        <Label htmlFor="feedbackReceived" className="text-sm font-medium">
          Feedback Received <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="feedbackReceived"
          placeholder="Document the feedback received during the presentation..."
          value={(formData.feedbackReceived as string) || ''}
          onChange={(e) => setFormData({ ...formData, feedbackReceived: e.target.value })}
          className="mt-2"
          rows={3}
        />
      </div>

      <div>
        <Label className="text-sm font-medium">
          Follow-up Actions <span className="text-muted-foreground">(optional)</span>
        </Label>
        <div className="mt-2 space-y-3">
          {followUpActions.map((action, index) => (
            <div key={index} className="rounded-lg border p-3 space-y-2">
              <div className="flex justify-between">
                <span className="text-xs font-medium">Action {index + 1}</span>
                <Button variant="ghost" size="sm" onClick={() => {
                  setFormData({ ...formData, followUpActions: followUpActions.filter((_, i) => i !== index) })
                }}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
              <Input
                value={action.action}
                onChange={(e) => {
                  const updated = followUpActions.map((a, i) => (i === index ? { ...a, action: e.target.value } : a))
                  setFormData({ ...formData, followUpActions: updated })
                }}
                placeholder="Action description"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={action.owner}
                  onChange={(e) => {
                    const updated = followUpActions.map((a, i) => (i === index ? { ...a, owner: e.target.value } : a))
                    setFormData({ ...formData, followUpActions: updated })
                  }}
                  placeholder="Owner"
                />
                <Input
                  type="date"
                  value={action.dueDate ? new Date(action.dueDate).toISOString().split('T')[0] : ''}
                  onChange={(e) => {
                    const updated = followUpActions.map((a, i) => (i === index ? { ...a, dueDate: e.target.value ? new Date(e.target.value).getTime() : undefined } : a))
                    setFormData({ ...formData, followUpActions: updated })
                  }}
                />
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={() => setFormData({ ...formData, followUpActions: [...followUpActions, { action: '', owner: '' }] })} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Follow-up Action
          </Button>
        </div>
      </div>
    </div>
  )
}

function ArchiveForm({
  formData,
  setFormData,
}: {
  formData: Record<string, unknown>
  setFormData: (data: Record<string, unknown>) => void
}) {
  const archivedItems = (formData.archivedItems as Array<{ itemType: string; location: string; description: string }>) || []
  const itemTypes = ['creative_assets', 'analytics_data', 'reports', 'documentation', 'contracts']

  const addItem = () => {
    setFormData({ ...formData, archivedItems: [...archivedItems, { itemType: '', location: '', description: '' }] })
  }

  const removeItem = (index: number) => {
    setFormData({ ...formData, archivedItems: archivedItems.filter((_, i) => i !== index) })
  }

  const updateItem = (index: number, field: string, value: string) => {
    const updated = archivedItems.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    setFormData({ ...formData, archivedItems: updated })
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">
          Archived Items <span className="text-destructive">*</span>
        </Label>
        <div className="mt-2 space-y-3">
          {archivedItems.map((item, index) => (
            <div key={index} className="rounded-lg border p-3 space-y-2">
              <div className="flex justify-between">
                <span className="text-xs font-medium">Item {index + 1}</span>
                {archivedItems.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removeItem(index)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                )}
              </div>
              <Select
                value={item.itemType}
                onValueChange={(value) => updateItem(index, 'itemType', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Item type" />
                </SelectTrigger>
                <SelectContent>
                  {itemTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={item.location}
                onChange={(e) => updateItem(index, 'location', e.target.value)}
                placeholder="Storage location"
              />
              <Input
                value={item.description}
                onChange={(e) => updateItem(index, 'description', e.target.value)}
                placeholder="Description"
              />
            </div>
          ))}
          <Button variant="outline" onClick={addItem} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Archived Item
          </Button>
        </div>
      </div>

      <div>
        <Label htmlFor="archiveLocation" className="text-sm font-medium">
          Archive Location <span className="text-destructive">*</span>
        </Label>
        <Input
          id="archiveLocation"
          value={(formData.archiveLocation as string) || ''}
          onChange={(e) => setFormData({ ...formData, archiveLocation: e.target.value })}
          placeholder="Main archive location"
          className="mt-2"
        />
      </div>

      <div>
        <Label htmlFor="retentionPeriod" className="text-sm font-medium">
          Retention Period <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="retentionPeriod"
          value={(formData.retentionPeriod as string) || ''}
          onChange={(e) => setFormData({ ...formData, retentionPeriod: e.target.value })}
          placeholder="e.g., 7 years"
          className="mt-2"
        />
      </div>

      <div>
        <Label htmlFor="archivedAt" className="text-sm font-medium">
          Archive Date <span className="text-destructive">*</span>
        </Label>
        <Input
          id="archivedAt"
          type="date"
          value={formData.archivedAt ? new Date(formData.archivedAt as number).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
          onChange={(e) => setFormData({ ...formData, archivedAt: new Date(e.target.value).getTime() })}
          className="mt-2"
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
