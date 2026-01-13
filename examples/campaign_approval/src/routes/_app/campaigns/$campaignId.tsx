import { createFileRoute, Outlet } from '@tanstack/react-router'
import { convexQuery } from '@convex-dev/react-query'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { SpinningLoader } from '@/components/spinning-loader'

export const Route = createFileRoute('/_app/campaigns/$campaignId')({
  component: RouteComponent,
  pendingComponent: Loading,
  loader: async ({ context, params }) => {
    // Load and cache campaign data for all child routes
    const data = await context.queryClient.ensureQueryData(
      convexQuery(api.workflows.campaign_approval.api.getCampaignWithDetails, {
        campaignId: params.campaignId as Id<'campaigns'>,
      }),
    )

    if (!data || !data.campaign) {
      throw new Error(`Campaign not found: ${params.campaignId}`)
    }

    return {
      campaignData: data,
      crumb: data.campaign.name,
    }
  },
})

function Loading() {
  return (
    <div className="p-6 flex items-center justify-center min-h-[200px]">
      <SpinningLoader />
    </div>
  )
}

function RouteComponent() {
  // Layout route loads data via loader, children access it via parent's useLoaderData()
  return <Outlet />
}
