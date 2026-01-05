import { createScopeModule } from '@repo/tasquencer'

export const greetingScopeModule = createScopeModule('greeting')
  .withScope('staff', {
    description: 'Base scope for Greeting workflow staff members',
    tags: ['greeting', 'staff'],
  })
  .withScope('write', {
    description: 'Permission to store greeting messages',
    tags: ['greeting', 'store', 'write'],
  })
