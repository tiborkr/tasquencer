import { reactStartHandler } from '@convex-dev/better-auth/react-start'
import { createFileRoute } from '@tanstack/react-router'

function normalizeAuthEnv() {
  process.env.SITE_URL ??= 'http://localhost:3000'
  process.env.VITE_CONVEX_SITE_URL ??= process.env.CONVEX_SITE_URL
  process.env.CONVEX_SITE_URL ??= process.env.VITE_CONVEX_SITE_URL
}

async function safeReactStartHandler(request: Request) {
  try {
    return await reactStartHandler(request)
  } catch (error) {
    console.error('Better Auth handler failed', {
      error,
      SITE_URL: process.env.SITE_URL,
      CONVEX_SITE_URL: process.env.CONVEX_SITE_URL,
      VITE_CONVEX_SITE_URL: process.env.VITE_CONVEX_SITE_URL,
    })

    return new Response(
      JSON.stringify({
        error: 'BETTER_AUTH_HANDLER_FAILED',
        message: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    )
  }
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => {
        normalizeAuthEnv()
        return safeReactStartHandler(request)
      },
      POST: ({ request }) => {
        normalizeAuthEnv()
        return safeReactStartHandler(request)
      },
  }}
})
