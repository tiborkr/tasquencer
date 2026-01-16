import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/deals')({
  component: RouteComponent,
  loader: () => ({
    crumb: 'Deals',
  }),
})

function RouteComponent() {
  return <Outlet />
}
