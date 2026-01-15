import { Builder } from '../../../tasquencer'

export const getProposalSignedWorkItem = Builder.workItem('getProposalSigned')

export const getProposalSignedTask = Builder.task(getProposalSignedWorkItem)
