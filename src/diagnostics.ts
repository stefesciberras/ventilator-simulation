import type { Sample } from './simulation/types'

export const APP_VERSION = '0.71'
export type DiagnosticWaveformSource = 'live' | 'frozen'

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
    window.prompt('Copy diagnostic JSON', text)
    return false
  }
}
