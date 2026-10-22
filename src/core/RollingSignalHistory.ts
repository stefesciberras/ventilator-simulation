export interface TimedSignalSample {
  time: number
}

/**
 * Product-neutral rolling history for continuously sampled simulation signals.
 *
 * The history only appends new samples and trims samples that have fallen out of
 * the configured time window. Existing samples are never regenerated when a
 * product's current parameters change, which lets displays preserve the visual
 * past while new settings affect only future signal data.
 */
export class RollingSignalHistory<TSample extends TimedSignalSample> {
  private samples: TSample[] = []

  constructor(private readonly windowSeconds: number) {}

  append(sample: TSample): void {
    const previous = this.samples[this.samples.length - 1]
    if (previous && sample.time <= previous.time) return
    this.samples.push(sample)
    this.trim(sample.time)
  }

  appendMany(samples: readonly TSample[]): void {
    for (const sample of samples) this.append(sample)
  }

  trim(endTime: number): void {
    const minimumTime = endTime - this.windowSeconds
    let firstVisible = 0
    while (firstVisible < this.samples.length - 1 && this.samples[firstVisible].time < minimumTime) {
      firstVisible += 1
    }
    if (firstVisible > 0) this.samples.splice(0, firstVisible)
  }

  snapshot(): TSample[] {
    return this.samples.slice()
  }

  latest(): TSample | null {
    return this.samples[this.samples.length - 1] ?? null
  }

  reset(samples: readonly TSample[] = []): void {
    this.samples = samples.slice()
    const latest = this.latest()
    if (latest) this.trim(latest.time)
  }

  get size(): number {
    return this.samples.length
  }
}
