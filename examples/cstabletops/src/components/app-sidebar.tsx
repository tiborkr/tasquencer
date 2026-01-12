import * as React from 'react'
import { Search, Shield, ClipboardCheck } from 'lucide-react'

import { NavMain } from '@/components/nav-main'
import { NavUser } from '@/components/nav-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
} from '@repo/ui/components/sidebar'
import { Link, useLocation } from '@tanstack/react-router'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation()
  const pathname = location.pathname

  // Helper to check if a path is active (exact match or parent path for nested routes)
  const isPathActive = (path: string) => {
    if (path === '/simple') {
      // Sessions page - exact match only (don't highlight for sub-routes)
      return pathname === '/simple' || pathname === '/simple/'
    }
    // For other paths, check if current location starts with the path
    return pathname === path || pathname.startsWith(path + '/')
  }

  // Helper to check if any item in a group is active
  const isGroupActive = (paths: string[]) => {
    return paths.some((p) => isPathActive(p))
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarContent>
        <NavMain
          items={[
            {
              title: 'Cybersecurity Tabletop',
              icon: ClipboardCheck,
              isActive: () =>
                isGroupActive([
                  '/simple',
                  '/simple/new',
                  '/simple/join',
                  '/simple/queue',
                ]),
              items: [
                {
                  title: 'Sessions',
                  url: '/simple',
                  isActive: isPathActive('/simple'),
                  renderLink: () => (
                    <Link
                      to="/simple"
                      data-active={isPathActive('/simple') || undefined}
                    >
                      Sessions
                    </Link>
                  ),
                },
                {
                  title: 'New Session',
                  url: '/simple/new',
                  isActive: isPathActive('/simple/new'),
                  renderLink: () => (
                    <Link
                      to="/simple/new"
                      data-active={isPathActive('/simple/new') || undefined}
                    >
                      New Session
                    </Link>
                  ),
                },
                {
                  title: 'Join Session',
                  url: '/simple/join',
                  isActive: isPathActive('/simple/join'),
                  renderLink: () => (
                    <Link
                      to="/simple/join"
                      data-active={isPathActive('/simple/join') || undefined}
                    >
                      Join Session
                    </Link>
                  ),
                },
                {
                  title: 'Work Queue',
                  url: '/simple/queue',
                  isActive: isPathActive('/simple/queue'),
                  renderLink: () => (
                    <Link
                      to="/simple/queue"
                      data-active={isPathActive('/simple/queue') || undefined}
                    >
                      Work Queue
                    </Link>
                  ),
                },
              ],
            },
            {
              title: 'Audit',
              icon: Search,
              isActive: () => isGroupActive(['/audit']),
              items: [
                {
                  title: 'Traces',
                  url: '/audit',
                  isActive: isPathActive('/audit'),
                  renderLink: () => (
                    <Link
                      to="/audit"
                      data-active={isPathActive('/audit') || undefined}
                    >
                      Traces
                    </Link>
                  ),
                },
              ],
            },
            {
              title: 'Admin',
              icon: Shield,
              isActive: () =>
                isGroupActive(['/admin/users', '/admin/groups', '/admin/roles']),
              items: [
                {
                  title: 'Users',
                  url: '/admin/users',
                  isActive: isPathActive('/admin/users'),
                  renderLink: () => (
                    <Link
                      to="/admin/users"
                      data-active={isPathActive('/admin/users') || undefined}
                    >
                      Users
                    </Link>
                  ),
                },
                {
                  title: 'Groups',
                  url: '/admin/groups',
                  isActive: isPathActive('/admin/groups'),
                  renderLink: () => (
                    <Link
                      to="/admin/groups"
                      data-active={isPathActive('/admin/groups') || undefined}
                    >
                      Groups
                    </Link>
                  ),
                },
                {
                  title: 'Roles',
                  url: '/admin/roles',
                  isActive: isPathActive('/admin/roles'),
                  renderLink: () => (
                    <Link
                      to="/admin/roles"
                      data-active={isPathActive('/admin/roles') || undefined}
                    >
                      Roles
                    </Link>
                  ),
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
