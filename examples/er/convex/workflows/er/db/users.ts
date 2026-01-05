import type { DatabaseReader } from '../../../_generated/server'
import type { Doc, Id } from '../../../_generated/dataModel'

export async function listErUsers(
  db: DatabaseReader,
): Promise<Array<Doc<'erUsers'>>> {
  return await db.query('erUsers').collect()
}

export async function getErUser(
  db: DatabaseReader,
  userId: Id<'erUsers'>,
): Promise<Doc<'erUsers'> | null> {
  return await db.get(userId)
}
