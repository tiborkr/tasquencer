import { Outlet, createFileRoute } from '@tanstack/react-router'
import { api } from '@/convex/_generated/api'

export const Route = createFileRoute('/_app/campaigns')({
  component: CampaignsLayout,
  loader: async ({ context }) => {
    const workflowStructure = await context.convexClient.query(
      api.workflows.metadata.getWorkflowStructure,
      { workflow: { name: 'campaign_approval', version: 'v1' } },
    )
    return {
      headerRight: { type: 'workflowStructure', data: workflowStructure },
    }
  },
})

function CampaignsLayout() {
  return (
    <div className="overflow-y-auto">
      <Outlet />
    </div>
  )
}
