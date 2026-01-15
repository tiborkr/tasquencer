import { Builder } from '../../../tasquencer'

/**
 * Create draft from logged time + expenses not yet invoiced
 */
export const invoiceTimeAndMaterialsWorkItem = Builder.workItem('invoiceTimeAndMaterials')

export const invoiceTimeAndMaterialsTask = Builder.task(invoiceTimeAndMaterialsWorkItem)
