import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  Outlet,
  useRouteContext,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { QueryClient } from '@tanstack/react-query'
import * as React from 'react'
import appCss from '@repo/ui/globals.css?url'
import { ConvexQueryClient } from '@convex-dev/react-query'
import { ConvexReactClient } from 'convex/react'
import { getRequest } from '@tanstack/react-start/server'
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'
import { authClient } from '@/lib/auth-client'
import {
  fetchAuth,
  fetchSession,
} from '@convex-dev/better-auth/react-start'
import { Toaster } from '@repo/ui/components/sonner'
import { getThemeServerFn } from '@/lib/theme'
import { ThemeProvider, useTheme } from '@/components/theme-provider'

// Server side session request
const fetchAuthInfo = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    process.env.SITE_URL ??= 'http://localhost:3000'
    process.env.VITE_CONVEX_SITE_URL ??= process.env.CONVEX_SITE_URL
    process.env.CONVEX_SITE_URL ??= process.env.VITE_CONVEX_SITE_URL

    const { session } = await fetchSession(getRequest())
    const auth = await fetchAuth(getRequest()).catch(() => undefined)
    const token = auth?.token
    return {
      userId: session?.user.id,
      token,
    }
  } catch {
    return { userId: undefined, token: undefined }
  }
})
export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
  convexClient: ConvexReactClient
  convexQueryClient: ConvexQueryClient
}>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Tasquencer Example / Cybersecurity Tabletop',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32x32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/favicon-16x16.png',
      },
      { rel: 'manifest', href: '/site.webmanifest', color: '#fffff' },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  notFoundComponent: () => <div>Route not found</div>,
  component: RootComponent,
  beforeLoad: async (ctx) => {
    // all queries, mutations and action made with TanStack Query will be
    // authenticated by an identity token.
    const auth = await fetchAuthInfo()
    const { userId, token } = auth

    // During SSR only (the only time serverHttpClient exists),
    // set the auth token for Convex to make HTTP queries with.
    if (token) {
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(token)
    }

    return {
      auth: {
        isAuthenticated: !!token,
        userId,
        token,
      },
    }
  },
  loader: async () => ({
    theme: await getThemeServerFn(),
  }),
})

function RootComponent() {
  const data = Route.useLoaderData()
  const context = useRouteContext({ from: Route.id })
  return (
    <ConvexBetterAuthProvider
      authClient={authClient}
      client={context.convexClient}
    >
      <ThemeProvider theme={data.theme}>
        <RootDocument>
          <Outlet />
        </RootDocument>
      </ThemeProvider>
    </ConvexBetterAuthProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <html className={theme} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster />
        <Scripts />
      </body>
    </html>
  )
}
