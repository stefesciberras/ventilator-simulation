import type { Sample } from './simulation/types'
import { APP_VERSION } from './appVersion'

export type DiagnosticWaveformSource = 'live' | 'frozen'

export interface ScenarioLogEntry {
  id: string
  at: string
  appVersion: string
  event: string
  details: Record<string, unknown>
}

const SCENARIO_LOG_STORAGE_KEY = 'eduvent.scenario-diagnostic-log'
const SCENARIO_LOG_LIMIT = 500

async function copyJsonPayload(payload: Record<string, unknown>, promptTitle: string): Promise<boolean> {
  const text = JSON.stringify(payload)
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

export function readScenarioLogs(): ScenarioLogEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SCENARIO_LOG_STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.slice(-SCENARIO_LOG_LIMIT) as ScenarioLogEntry[] : []
  } catch {
    return []
  }
}

export function appendScenarioLog(event: string, details: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return
  try {
    const entry: ScenarioLogEntry = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      at: new Date().toISOString(),
      appVersion: APP_VERSION,
      event,
      details,
    }
    const next = [...readScenarioLogs(), entry].slice(-SCENARIO_LOG_LIMIT)
    window.localStorage.setItem(SCENARIO_LOG_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Diagnostics must never affect the simulator or a teaching session.
  }
}

export async function copyScenarioLogs(context: Record<string, unknown> = {}): Promise<boolean> {
  return copyJsonPayload({
    schema: 'eduvent-scenario-log-v1',
    capturedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    context,
    entries: readScenarioLogs(),
  }, 'Copy scenario log JSON')
}

export async function copyDiagnosticSnapshot(
  diagnostic: Record<string, unknown>,
  samples: Sample[],
  source: DiagnosticWaveformSource,
  sampleIntervalSeconds: number,
): Promise<boolean> {
  const payload = {
    schema: 'eduvent-diagnostic-v1',
    capturedAt: new Date().toISOString(),
    ...diagnostic,
    appVersion: APP_VERSION,
    waveform: {
      source,
      sampleIntervalSeconds,
      sampleCount: samples.length,
      durationSeconds: samples.length > 1 ? samples[samples.length - 1].time - samples[0].time : 0,
      units: {
        time: 's',
        pressure: 'cmH2O',
        flow: 'L/min',
        volume: 'mL',
        musclePressure: 'cmH2O',
        co2: 'mmHg',
        spo2: '%',
        oesophagealPressure: 'cmH2O',
      },
      columns: [
        'time',
        'pressure',
        'flow',
        'volume',
        'musclePressure',
        'co2',
        'spo2',
        'oesophagealPressure',
        'phase',
        'mode',
        'breathTrigger',
        'expiratoryHold',
        'simvSyncWindow',
      ],
      samples: samples.map((sample) => [
        sample.time,
        sample.pressure,
        sample.flow,
        sample.volume,
        sample.musclePressure,
        sample.co2,
        sample.spo2,
        sample.oesophagealPressure,
        sample.phase,
        sample.mode,
        sample.breathTrigger ?? null,
        Boolean(sample.expiratoryHold),
        Boolean(sample.simvSyncWindow),
      ]),
    },
  }

  return copyJsonPayload(payload, 'Copy diagnostic JSON')
}
