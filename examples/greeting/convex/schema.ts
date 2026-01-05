import { defineSchema, defineTable } from 'convex/server'
import { schema as tasquencerTables } from '@repo/tasquencer'

import greetingTables from './workflows/greeting/schema'

// The schema is entirely optional.
// You can delete this file (schema.ts) and the
// app will continue to work.
// The schema provides more precise TypeScript types.

const users = defineTable({})

export default defineSchema({
  users,
  ...tasquencerTables,
  ...greetingTables,
})
