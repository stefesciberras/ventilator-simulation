import type { SimulationProductId } from './SimulationProductAdapter'

export type SimulationDiagnosticWaveformSource = 'live' | 'frozen'

export interface SimulationDiagnosticProductContext {
  productId: SimulationProductId
  productLabel: string
  appVersion: string
}

export interface SimulationDiagnosticWaveform<TSample> {
  source: SimulationDiagnosticWaveformSource
  sampleIntervalSeconds: number
  samples: readonly TSample[]
  columns: readonly string[]
  units: Readonly<Record<string, string>>
  serializeSample: (sample: TSample) => readonly unknown[]
  sampleTimeSeconds?: (sample: TSample) => number
}

export interface SimulationDiagnosticOptions<TSample = never> extends SimulationDiagnosticProductContext {
  schema?: string
  kind: string
  purpose?: string
  payload: Record<string, unknown>
  waveform?: SimulationDiagnosticWaveform<TSample>
}

export async function copySimulationJson(
  payload: Record<string, unknown>,
  promptTitle = 'Copy diagnostic JSON',
  pretty = true,
): Promise<boolean> {
  const text = JSON.stringify(payload, null, pretty ? 2 : undefined)
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      const copied = document.execCommand('copy')
      textarea.remove()
      if (!copied) throw new Error('Clipboard copy failed')
    }
    return true
  } catch {
    window.prompt(promptTitle, text)
    return false
  }
}

export function createSimulationDiagnostic<TSample = never>(
  options: SimulationDiagnosticOptions<TSample>,
): Record<string, unknown> {
  const diagnostic: Record<string, unknown> = {
    schema: options.schema ?? 'edusim-diagnostic-v1',
    capturedAt: new Date().toISOString(),
    product: {
      id: options.productId,
      label: options.productLabel,
      appVersion: options.appVersion,
    },
    kind: options.kind,
    ...(options.purpose ? { purpose: options.purpose } : {}),
    ...options.payload,
  }

  if (options.waveform) {
    const waveform = options.waveform
    const first = waveform.samples[0]
    const last = waveform.samples[waveform.samples.length - 1]
    const sampleTime = waveform.sampleTimeSeconds
    const durationSeconds = first != null && last != null && sampleTime
      ? Math.max(0, sampleTime(last) - sampleTime(first))
      : Math.max(0, (waveform.samples.length - 1) * waveform.sampleIntervalSeconds)
    diagnostic.waveform = {
      source: waveform.source,
      sampleIntervalSeconds: waveform.sampleIntervalSeconds,
      sampleCount: waveform.samples.length,
      durationSeconds,
      units: waveform.units,
      columns: waveform.columns,
      samples: waveform.samples.map(waveform.serializeSample),
    }
  }

  return diagnostic
}

export async function copySimulationDiagnostic<TSample = never>(
  options: SimulationDiagnosticOptions<TSample>,
  promptTitle = 'Copy diagnostic JSON',
): Promise<boolean> {
  return copySimulationJson(createSimulationDiagnostic(options), promptTitle, true)
}
