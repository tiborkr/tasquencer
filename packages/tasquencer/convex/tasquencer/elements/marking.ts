import { BaseTask } from './baseTask'
import { Condition } from './condition'

export class Marking {
  private readonly locations: (BaseTask | Condition)[] = []
  constructor(tasks: BaseTask[], conditions: Condition[]) {
    this.locations = [...tasks, ...conditions]
  }
  getLocations() {
    return this.locations
  }
}
