import { Builder } from '../../../tasquencer'

export const createBookingsWorkItem = Builder.workItem('createBookings')

export const createBookingsTask = Builder.task(createBookingsWorkItem)
