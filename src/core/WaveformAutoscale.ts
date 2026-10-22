export interface WaveformScale {
  min: number
  max: number
}

export interface WaveformAutoscaleOptions {
  fallbackMin: number
  fallbackMax: number
  paddingFraction?: number
  minimumSpan?: number
  roundTo?: number
  includeZero?: boolean
  symmetricAroundZero?: boolean
  hardMin?: number
  hardMax?: number
}

function roundDown(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return value
  return Math.floor(value / step) * step
}

function roundUp(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return value
  return Math.ceil(value / step) * step
}

function fallbackScale(options: WaveformAutoscaleOptions): WaveformScale {
  return { min: options.fallbackMin, max: options.fallbackMax }
}

function applyHardBounds(scale: WaveformScale, options: WaveformAutoscaleOptions): WaveformScale {
  let { min, max } = scale
  if (Number.isFinite(options.hardMin)) min = Math.max(min, Number(options.hardMin))
  if (Number.isFinite(options.hardMax)) max = Math.min(max, Number(options.hardMax))
  return { min, max }
}

export function autoscaleWaveformValues(values: readonly number[], options: WaveformAutoscaleOptions): WaveformScale {
  let observedMin = Number.POSITIVE_INFINITY
  let observedMax = Number.NEGATIVE_INFINITY

  for (const value of values) {
    if (!Number.isFinite(value)) continue
    observedMin = Math.min(observedMin, value)
    observedMax = Math.max(observedMax, value)
  }

  if (!Number.isFinite(observedMin) || !Number.isFinite(observedMax)) return fallbackScale(options)

  const minimumSpan = Math.max(0, options.minimumSpan ?? 0)
  const paddingFraction = Math.max(0, options.paddingFraction ?? 0.06)
  const observedSpan = Math.max(0, observedMax - observedMin)
  const referenceSpan = Math.max(observedSpan, minimumSpan, 1e-6)
  const padding = referenceSpan * paddingFraction

  let min = observedMin - padding
  let max = observedMax + padding

  if (options.includeZero) {
    min = Math.min(0, min)
    max = Math.max(0, max)
  }

  if (options.symmetricAroundZero) {
    const magnitude = Math.max(Math.abs(min), Math.abs(max), minimumSpan / 2)
    min = -magnitude
    max = magnitude
  }

  const roundTo = options.roundTo ?? 0
  if (roundTo > 0) {
    min = roundDown(min, roundTo)
    max = roundUp(max, roundTo)
  }

  ;({ min, max } = applyHardBounds({ min, max }, options))

  if (max - min < minimumSpan) {
    if (options.symmetricAroundZero) {
      const half = minimumSpan / 2
      min = -half
      max = half
    } else if (Number.isFinite(options.hardMin) && min <= Number(options.hardMin)) {
      min = Number(options.hardMin)
      max = min + minimumSpan
    } else if (Number.isFinite(options.hardMax) && max >= Number(options.hardMax)) {
      max = Number(options.hardMax)
      min = max - minimumSpan
    } else if (options.includeZero && min >= 0) {
      min = 0
      max = minimumSpan
    } else {
      const centre = (min + max) / 2
      min = centre - minimumSpan / 2
      max = centre + minimumSpan / 2
    }

    if (roundTo > 0) {
      min = roundDown(min, roundTo)
      max = roundUp(max, roundTo)
    }
    ;({ min, max } = applyHardBounds({ min, max }, options))
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return fallbackScale(options)
  return { min, max }
}

export function autoscaleWaveformSamples<T>(samples: readonly T[], selectValue: (sample: T) => number, options: WaveformAutoscaleOptions): WaveformScale {
  return autoscaleWaveformValues(samples.map(selectValue), options)
}
