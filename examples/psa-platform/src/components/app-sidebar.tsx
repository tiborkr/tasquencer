import * as React from 'react'
import { Search, Shield, DollarSign } from 'lucide-react'

import { NavMain } from '@/components/nav-main'
import { NavUser } from '@/components/nav-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
} from '@repo/ui/components/sidebar'
import { Link } from '@tanstack/react-router'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarContent>
        <NavMain
          items={[
            {
              title: 'Sales',
              icon: DollarSign,
              isActive: () => true,
              items: [
                {
                  title: 'Deals Pipeline',
                  renderLink: () => <Link to="/deals">Deals Pipeline</Link>,
                },
              ],
            },
            {
              title: 'Audit',
              icon: Search,
              isActive: () => true,
              items: [
                {
                  title: 'Traces',
                  renderLink: () => <Link to="/audit">Traces</Link>,
                },
              ],
            },
            {
              title: 'Admin',
              icon: Shield,
              isActive: () => true,
              items: [
                {
                  title: 'Users',
                  renderLink: () => <Link to="/admin/users">Users</Link>,
                },
                {
                  title: 'Groups',
                  renderLink: () => <Link to="/admin/groups">Groups</Link>,
                },
                {
                  title: 'Roles',
                  renderLink: () => <Link to="/admin/roles">Roles</Link>,
                },
              ],
            },
          ]}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
