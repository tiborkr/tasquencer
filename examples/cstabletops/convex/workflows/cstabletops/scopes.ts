import { createScopeModule } from '@repo/tasquencer'

export const cstabletopsScopeModule = createScopeModule('cstabletops')
  .withScope('staff', {
    description: 'Base scope for tabletop exercise users',
    tags: ['cstabletops', 'staff'],
  })
  .withScope('facilitate', {
    description: 'Permission to facilitate exercises (present scenarios/injects, make choices)',
    tags: ['cstabletops', 'facilitate', 'write'],
  })
  .withScope('notetake', {
    description: 'Permission to record discussion notes',
    tags: ['cstabletops', 'notes', 'write'],
  })
  .withScope('respond', {
    description: 'Permission to record exercise responses',
    tags: ['cstabletops', 'respond', 'write'],
  })
