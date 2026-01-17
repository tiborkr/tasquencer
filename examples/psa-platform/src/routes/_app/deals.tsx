import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/deals')({
  component: DealsLayout,
  loader: () => ({ crumb: 'Deals' }),
})

function DealsLayout() {
  return <Outlet />
}
