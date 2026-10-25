import type { SimulationProductId } from './SimulationProductAdapter'

export type SimulationDiagnosticWaveformSource = 'live' | 'frozen'
export type SimulationDiagnosticProvider = () => Record<string, unknown>

const diagnosticProviders = new Map<string, SimulationDiagnosticProvider>()
let activeDiagnosticCapture: Array<Record<string, unknown>> | null = null

export function registerSimulationDiagnosticProvider(id: string, provider: SimulationDiagnosticProvider): () => void {
  diagnosticProviders.set(id, provider)
  return () => {
    if (diagnosticProviders.get(id) === provider) diagnosticProviders.delete(id)
  }
}

function runtimeDiagnostics(): Record<string, unknown> | undefined {
  if (diagnosticProviders.size === 0) return undefined
  const entries: Array<[string, Record<string, unknown>]> = []
  for (const [id, provider] of diagnosticProviders) {
    try {
      entries.push([id, provider()])
    } catch (error) {
      entries.push([id, { error: error instanceof Error ? error.message : String(error) }])
    }
  }
  return Object.fromEntries(entries)
}

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
  const providers = runtimeDiagnostics()
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
    ...(providers ? { runtimeDiagnostics: providers } : {}),
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

export async function captureSimulationDiagnostics(
  run: () => void | Promise<void>,
): Promise<Array<Record<string, unknown>>> {
  if (activeDiagnosticCapture) throw new Error('A diagnostic capture is already in progress.')
  const captured: Array<Record<string, unknown>> = []
  activeDiagnosticCapture = captured
  try {
    await run()
    return [...captured]
  } finally {
    activeDiagnosticCapture = null
  }
}

export async function copySimulationDiagnostic<TSample = never>(
  options: SimulationDiagnosticOptions<TSample>,
  promptTitle = 'Copy diagnostic JSON',
): Promise<boolean> {
  const diagnostic = createSimulationDiagnostic(options)
  if (activeDiagnosticCapture) {
    activeDiagnosticCapture.push(diagnostic)
    return true
  }
  return copySimulationJson(diagnostic, promptTitle, true)
}
