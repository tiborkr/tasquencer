import { Builder } from '../../../tasquencer'

/**
 * Review invoice draft for accuracy
 */
export const reviewDraftWorkItem = Builder.workItem('reviewDraft')

export const reviewDraftTask = Builder.task(reviewDraftWorkItem)
