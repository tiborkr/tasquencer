import { createFileRoute, Link } from '@tanstack/react-router'
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
  DollarSign,
  Wallet,
  TrendingUp,
  FileText,
  PieChart,
  AlertCircle,
} from 'lucide-react'
import { Route as ParentRoute } from './$campaignId'

export const Route = createFileRoute('/_app/campaigns/$campaignId/budget')({
  component: CampaignBudgetPage,
})

// Budget category configuration with icons and colors
const BUDGET_CATEGORIES = [
  { key: 'mediaSpend', label: 'Media Spend', color: 'bg-blue-500', icon: TrendingUp },
  { key: 'creativeProduction', label: 'Creative Production', color: 'bg-purple-500', icon: PieChart },
  { key: 'technologyTools', label: 'Technology & Tools', color: 'bg-indigo-500', icon: Wallet },
  { key: 'agencyFees', label: 'Agency Fees', color: 'bg-amber-500', icon: FileText },
  { key: 'eventCosts', label: 'Event Costs', color: 'bg-green-500', icon: DollarSign },
  { key: 'contingency', label: 'Contingency', color: 'bg-gray-500', icon: AlertCircle },
] as const

function CampaignBudgetPage() {
  const { campaignId } = Route.useParams()
  const { campaignData } = ParentRoute.useLoaderData()
  const { campaign, budget } = campaignData

  const budgetStatusVariants: Record<string, string> = {
    draft: 'border-gray-500/30 text-gray-600 dark:text-gray-400 bg-gray-500/5',
    pending_approval: 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5',
    approved: 'border-green-500/30 text-green-600 dark:text-green-400 bg-green-500/5',
    rejected: 'border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5',
    revision_requested: 'border-orange-500/30 text-orange-600 dark:text-orange-400 bg-orange-500/5',
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
              <Link
                to="/campaigns/$campaignId"
                params={{ campaignId }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Budget Breakdown</h1>
              <p className="text-sm text-muted-foreground">{campaign.name}</p>
            </div>
          </div>
        </div>
        {budget && (
          <Badge
            variant="outline"
            className={budgetStatusVariants[budget.status] || budgetStatusVariants.draft}
          >
            {budget.status.replace(/_/g, ' ')}
          </Badge>
        )}
      </div>

      <Separator />

      {!budget ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-medium">No Budget Yet</h2>
              <p className="text-sm text-muted-foreground mt-1">
                A budget hasn't been created for this campaign yet.
                <br />
                The budget will be developed during the Budget phase of the workflow.
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link
                  to="/campaigns/$campaignId"
                  params={{ campaignId }}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Campaign
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Budget Summary */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  ${budget.totalAmount.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Estimated: ${campaign.estimatedBudget.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">ROI Projection</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  {budget.roiProjection || 'Not specified'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Approval Level</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">
                  {budget.totalAmount >= 50000 ? 'Executive Approval' : 'Director Approval'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {budget.totalAmount >= 50000
                    ? 'Budget >= $50,000 requires executive sign-off'
                    : 'Budget < $50,000 requires director sign-off'
                  }
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Budget Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Budget Allocation</CardTitle>
              <CardDescription>
                Breakdown of budget across categories
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {BUDGET_CATEGORIES.map((category) => {
                const amount = budget[category.key as keyof typeof budget] as number
                const percentage = budget.totalAmount > 0
                  ? (amount / budget.totalAmount) * 100
                  : 0
                const Icon = category.icon

                return (
                  <div key={category.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-3 w-3 rounded-full ${category.color}`} />
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{category.label}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold">
                          ${amount.toLocaleString()}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    {/* Simple progress bar */}
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${category.color} transition-all`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Justification */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Budget Justification</CardTitle>
              <CardDescription>
                Rationale for the proposed budget allocation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">
                {budget.justification || 'No justification provided.'}
              </p>
            </CardContent>
          </Card>

          {/* Visual Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visual Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-8 w-full rounded-lg overflow-hidden">
                {BUDGET_CATEGORIES.map((category) => {
                  const amount = budget[category.key as keyof typeof budget] as number
                  const percentage = budget.totalAmount > 0
                    ? (amount / budget.totalAmount) * 100
                    : 0

                  if (percentage === 0) return null

                  return (
                    <div
                      key={category.key}
                      className={`${category.color} transition-all`}
                      style={{ width: `${percentage}%` }}
                      title={`${category.label}: $${amount.toLocaleString()} (${percentage.toFixed(1)}%)`}
                    />
                  )
                })}
              </div>
              <div className="flex flex-wrap gap-4 mt-4">
                {BUDGET_CATEGORIES.map((category) => {
                  const amount = budget[category.key as keyof typeof budget] as number
                  if (amount === 0) return null

                  return (
                    <div key={category.key} className="flex items-center gap-2 text-xs">
                      <div className={`h-2 w-2 rounded-full ${category.color}`} />
                      <span className="text-muted-foreground">{category.label}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
