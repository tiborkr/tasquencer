export class CancellationRegionBuilder<
  TTaskNames extends string,
  TConditionNames extends string,
> {
  static make<
    TTaskNames extends string,
    TConditionNames extends string,
  >(accumulator: { tasks: Set<string>; conditions: Set<string> }) {
    return new CancellationRegionBuilder<TTaskNames, TConditionNames>(
      accumulator,
    )
  }

  private constructor(
    private readonly accumulator: {
      tasks: Set<string>
      conditions: Set<string>
    },
  ) {}

  task(taskName: TTaskNames) {
    this.accumulator.tasks.add(taskName)
    return this
  }
  condition(conditionName: TConditionNames) {
    this.accumulator.conditions.add(conditionName)
    return this
  }
}
