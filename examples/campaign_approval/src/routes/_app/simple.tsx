import { Outlet, createFileRoute } from '@tanstack/react-router'
import { api } from '@/convex/_generated/api'

export const Route = createFileRoute('/_app/simple')({
  component: SimpleLayout,
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

function SimpleLayout() {
  return (
    <div className="space-y-4 p-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Simple UcampaignUapproval Workflow</h1>
      </div>
      <Outlet />
    </div>
  )
}
