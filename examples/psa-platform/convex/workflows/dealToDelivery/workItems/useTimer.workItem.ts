import { Builder } from '../../../tasquencer'

export const useTimerWorkItem = Builder.workItem('useTimer')

export const useTimerTask = Builder.task(useTimerWorkItem)
