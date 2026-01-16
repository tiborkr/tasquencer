import * as React from 'react'
import { Search, Shield, DollarSign, Clock, Receipt, FileText, FolderKanban } from 'lucide-react'

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
              title: 'Delivery',
              icon: FolderKanban,
              isActive: () => true,
              items: [
                {
                  title: 'Projects',
                  renderLink: () => <Link to="/projects">Projects</Link>,
                },
                {
                  title: 'Resources',
                  renderLink: () => <Link to="/resources">Resources</Link>,
                },
              ],
            },
            {
              title: 'Time',
              icon: Clock,
              isActive: () => true,
              items: [
                {
                  title: 'Timesheet',
                  renderLink: () => <Link to="/timesheet">Timesheet</Link>,
                },
              ],
            },
            {
              title: 'Expenses',
              icon: Receipt,
              isActive: () => true,
              items: [
                {
                  title: 'My Expenses',
                  renderLink: () => <Link to="/expenses">My Expenses</Link>,
                },
              ],
            },
            {
              title: 'Finance',
              icon: FileText,
              isActive: () => true,
              items: [
                {
                  title: 'Invoices',
                  renderLink: () => <Link to="/invoices">Invoices</Link>,
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
