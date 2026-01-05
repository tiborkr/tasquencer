import { defineSchema } from "convex/server";
import { schema as tasquencerTables } from "./tasquencer/schema";

export default defineSchema({
  ...tasquencerTables,
});
