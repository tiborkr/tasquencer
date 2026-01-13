import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { schema as tasquencerTables } from '@repo/tasquencer'

import cstabletopsTables from './workflows/cstabletops/schema'

// The schema is entirely optional.
// You can delete this file (schema.ts) and the
// app will continue to work.
// The schema provides more precise TypeScript types.

const users = defineTable({
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
})

export default defineSchema({
  users,
  ...tasquencerTables,
  ...cstabletopsTables,
})
