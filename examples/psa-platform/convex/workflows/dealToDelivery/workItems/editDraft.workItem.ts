import { Builder } from '../../../tasquencer'

/**
 * Edit invoice draft to correct errors
 */
export const editDraftWorkItem = Builder.workItem('editDraft')

export const editDraftTask = Builder.task(editDraftWorkItem)
