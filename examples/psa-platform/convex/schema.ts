import { defineSchema } from 'convex/server'
import { schema as tasquencerTables } from '@repo/tasquencer'

import dealToDeliveryTables from './workflows/dealToDelivery/schema'

export default defineSchema({
  // Tasquencer framework tables
  ...tasquencerTables,

  // Deal to Delivery workflow domain tables (includes users, organizations, etc.)
  ...dealToDeliveryTables,
})
