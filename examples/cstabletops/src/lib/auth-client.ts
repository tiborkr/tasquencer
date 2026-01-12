import { createAuthClient } from 'better-auth/react'
import { convexClient } from '@convex-dev/better-auth/client/plugins'

const baseURL =
  typeof window !== 'undefined'
    ? window.location.origin
    : process.env.SITE_URL ?? 'http://127.0.0.1:3210'

export const authClient = createAuthClient({
  baseURL,
  plugins: [convexClient()],
})
