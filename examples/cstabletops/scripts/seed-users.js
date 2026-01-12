// Seed a few email/password users via Better Auth REST endpoints.
// Requires your local app/server running (e.g., pnpm dev).

const base = process.env.SITE_URL || 'http://localhost:3000'
const users = [
  { email: 'facilitator@example.com', password: 'kukulele' },
  { email: 'note@example.com', password: 'kukulele' },
  { email: 'player@example.com', password: 'kukulele' },
  { email: 'observer@example.com', password: 'kukulele' },
]

for (const u of users) {
  const res = await fetch(`${base}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(u),
  })
  const body = await res.text()
  console.log(u.email, res.status, body)
}
