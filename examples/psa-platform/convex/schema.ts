import { defineSchema, defineTable } from 'convex/server'
import { schema as tasquencerTables } from '@repo/tasquencer'

import dealToDeliveryTables from "./workflows/dealToDelivery/schema";

// Import workflow tables here after scaffolding:
// import workflowTables from './workflows/<name>/schema'

const users = defineTable({})

export default defineSchema({
  users,

  // Spread workflow tables here:
  // ...workflowTables,
  ...tasquencerTables,

  ...dealToDeliveryTables
})
