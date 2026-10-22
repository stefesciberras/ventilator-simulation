import type { Sample } from './simulation/types'
import { APP_VERSION } from './appVersion'
import {
  appendStructuredScenarioLog,
  readScenarioLogs,
  type ScenarioLogEntry,
} from './scenario-logger'
import {
  copySimulationDiagnostic,
  copySimulationJson,
  type SimulationDiagnosticWaveformSource,
} from './core/SimulationDiagnostics'

export type DiagnosticWaveformSource = SimulationDiagnosticWaveformSource
export type { ScenarioLogEntry } from './scenario-logger'

/** Backwards-compatible diagnostic helper. New scenario runtime code should use appendStructuredScenarioLog directly. */
export function appendScenarioLog(event: string, details: Record<string, unknown> = {}) {
  appendStructuredScenarioLog(event, { category: 'diagnostic', actor: 'simulator', details })
}

export { readScenarioLogs }

export async function copyScenarioLogs(context: Record<string, unknown> = {}): Promise<boolean> {
  const entries: ScenarioLogEntry[] = readScenarioLogs()
  return copySimulationJson({
    schema: 'eduvent-scenario-log-v2',
    loggerVersion: 2,
    capturedAt: new Date().toISOString(),
    product: { id: 'eduvent', label: 'EDUVENT', appVersion: APP_VERSION },
    context,
    entries,
  }, 'Copy scenario log JSON')
}

export async function copyScenarioSnapshot(snapshot: Record<string, unknown>): Promise<boolean> {
  const entries: ScenarioLogEntry[] = readScenarioLogs()
  return copySimulationJson({
    schema: 'eduvent-scenario-diagnostic-v1',
    capturedAt: new Date().toISOString(),
    product: { id: 'eduvent', label: 'EDUVENT', appVersion: APP_VERSION },
    purpose: 'Paste this JSON into the EDUVENT development thread for scenario debugging.',
    snapshot,
    recentScenarioEvents: entries.slice(-100),
  }, 'Copy scenario diagnostic JSON')
}

export async function copyDiagnosticSnapshot(
  diagnostic: Record<string, unknown>,
  samples: Sample[],
  source: DiagnosticWaveformSource,
  sampleIntervalSeconds: number,
): Promise<boolean> {
  return copySimulationDiagnostic<Sample>({
    schema: 'eduvent-diagnostic-v1',
    productId: 'eduvent',
    productLabel: 'EDUVENT',
    appVersion: APP_VERSION,
    kind: 'simulation-snapshot',
    payload: diagnostic,
    waveform: {
      source,
      sampleIntervalSeconds,
      samples,
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
      sampleTimeSeconds: (sample) => sample.time,
      serializeSample: (sample) => [
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
      ],
    },
  })
}
