import { createFileRoute, Link } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
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
  Image,
  FileImage,
  Video,
  Mail,
  Globe,
  MessageCircle,
  Calendar,
  User,
  Hash,
} from 'lucide-react'
import { Suspense } from 'react'
import { Route as ParentRoute } from './$campaignId'

export const Route = createFileRoute('/_app/campaigns/$campaignId/creatives')({
  component: CampaignCreativesPage,
})

// Asset type configuration
const ASSET_TYPE_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  ad: { label: 'Ad', icon: FileImage, color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  email: { label: 'Email', icon: Mail, color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
  landing_page: { label: 'Landing Page', icon: Globe, color: 'bg-green-500/10 text-green-600 border-green-500/20' },
  social_post: { label: 'Social Post', icon: MessageCircle, color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  video: { label: 'Video', icon: Video, color: 'bg-red-500/10 text-red-600 border-red-500/20' },
}

function CampaignCreativesPage() {
  const { campaignId } = Route.useParams()
  const { campaignData } = ParentRoute.useLoaderData()
  const { campaign } = campaignData

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
              <h1 className="text-2xl font-semibold tracking-tight">Creative Assets</h1>
              <p className="text-sm text-muted-foreground">{campaign.name}</p>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      <Suspense fallback={<CreativesGridSkeleton />}>
        <CreativesGrid campaignId={campaignId as Id<'campaigns'>} />
      </Suspense>
    </div>
  )
}

function CreativesGrid({ campaignId }: { campaignId: Id<'campaigns'> }) {
  const q = convexQuery(api.workflows.campaign_approval.api.getCampaignCreatives, {
    campaignId,
  })
  const { data: creatives } = useSuspenseQuery(q)

  if (!creatives || creatives.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <Image className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium">No Creative Assets Yet</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Creative assets will be added during the Creative Development phase.
              <br />
              This includes ads, emails, landing pages, social posts, and videos.
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
    )
  }

  // Group creatives by asset type
  const groupedCreatives = creatives.reduce((acc, creative) => {
    const type = creative.assetType
    if (!acc[type]) {
      acc[type] = []
    }
    acc[type].push(creative)
    return acc
  }, {} as Record<string, typeof creatives>)

  // Count by type for summary
  const typeCounts = Object.entries(groupedCreatives).map(([type, items]) => ({
    type,
    count: items.length,
    config: ASSET_TYPE_CONFIG[type] || ASSET_TYPE_CONFIG.ad,
  }))

  return (
    <>
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        {typeCounts.map(({ type, count, config }) => {
          const Icon = config.icon
          return (
            <Card key={type}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${config.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground">{config.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Asset Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Assets</CardTitle>
          <CardDescription>
            {creatives.length} creative asset{creatives.length !== 1 ? 's' : ''} in this campaign
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {creatives.map((creative) => {
              const config = ASSET_TYPE_CONFIG[creative.assetType] || ASSET_TYPE_CONFIG.ad
              const Icon = config.icon

              return (
                <div
                  key={creative._id}
                  className="rounded-lg border bg-card overflow-hidden hover:border-primary/50 transition-colors"
                >
                  {/* Preview Area */}
                  <div className="aspect-video bg-muted flex items-center justify-center relative">
                    {creative.storageId ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-muted">
                        <Icon className="h-8 w-8 text-muted-foreground" />
                        <span className="sr-only">Asset preview</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Icon className="h-8 w-8" />
                        <span className="text-xs">No file uploaded</span>
                      </div>
                    )}
                    <Badge
                      variant="outline"
                      className={`absolute top-2 right-2 ${config.color}`}
                    >
                      {config.label}
                    </Badge>
                  </div>

                  {/* Info */}
                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium text-sm truncate">{creative.name}</h3>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        v{creative.version}
                      </Badge>
                    </div>

                    {creative.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {creative.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(creative.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        <span>v{creative.version}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Grouped by Type */}
      {Object.entries(groupedCreatives).map(([type, items]) => {
        const config = ASSET_TYPE_CONFIG[type] || ASSET_TYPE_CONFIG.ad
        const Icon = config.icon

        return (
          <Card key={type}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded ${config.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">{config.label} Assets</CardTitle>
              </div>
              <CardDescription>
                {items.length} {config.label.toLowerCase()}{items.length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {items.map((creative) => (
                  <div key={creative._id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="font-medium text-sm">{creative.name}</p>
                        {creative.description && (
                          <p className="text-xs text-muted-foreground">
                            {creative.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          Version {creative.version}
                        </Badge>
                        {creative.storageId ? (
                          <Badge variant="outline" className="text-xs text-green-600">
                            Uploaded
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-amber-600">
                            Pending
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>Created {new Date(creative.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>User ID: {creative.createdBy.slice(0, 8)}...</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </>
  )
}

function CreativesGridSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4">
              <div className="animate-pulse flex items-center gap-3">
                <div className="h-10 w-10 bg-muted rounded-lg" />
                <div className="space-y-2">
                  <div className="h-6 w-8 bg-muted rounded" />
                  <div className="h-3 w-16 bg-muted rounded" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <div className="animate-pulse space-y-2">
            <div className="h-5 w-24 bg-muted rounded" />
            <div className="h-4 w-48 bg-muted rounded" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg border overflow-hidden">
                <div className="aspect-video bg-muted" />
                <div className="p-3 space-y-2">
                  <div className="h-4 w-3/4 bg-muted rounded" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
