import { Builder } from '../../../tasquencer'

export const createProposalWorkItem = Builder.workItem('createProposal')

export const createProposalTask = Builder.task(createProposalWorkItem)
