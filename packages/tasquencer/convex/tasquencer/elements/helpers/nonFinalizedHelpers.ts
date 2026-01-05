export async function loadEntitiesByStates<T, S extends string>(
  states: readonly S[],
  loader: (state: S) => Promise<T[]>,
) {
  const results = await Promise.all(states.map(loader))
  return results.flat()
}

export async function cancelEntities<T>(
  entities: readonly T[],
  cancel: (entity: T) => Promise<void>,
) {
  if (entities.length === 0) {
    return
  }

  await Promise.all(entities.map((entity) => cancel(entity)))
}
