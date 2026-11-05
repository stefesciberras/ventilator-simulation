/**
 * Opt-in, bounded, in-memory, browser-only rendering diagnostics for Anaesth v2.
 * No tokens, URLs, session IDs, names, payloads or patient identifiers are logged.
 * Logging is disabled by default and never transmits data to a server.
 */
export type V2WaveformDiagnostic = {
  timestamp: string
  elapsedMs: number
  event: string
  details: Record<string, string | number | boolean | null>
}
const CAPACITY = 300
const started = typeof performance !== 'undefined' ? performance.now() : 0
let enabled = false
let entries: V2WaveformDiagnostic[] = []
let lastSnapshotAt: number | null = null

export function waveformDiagnosticsEnabled(): boolean { return enabled }

export function setWaveformDiagnosticsEnabled(next: boolean): void {
  if (next && !enabled) {
    enabled = true
    lastSnapshotAt = null
    recordWaveformDiagnostic('capture-start', {})
  } else if (!next && enabled) {
    recordWaveformDiagnostic('capture-stop', {})
    enabled = false
  }
}

export function clearWaveformDiagnostics(): void {
  entries = []
  lastSnapshotAt = null
}

export function recordWaveformDiagnostic(
  event: string,
  details: V2WaveformDiagnostic['details'],
): void {
  if (!enabled) return
  entries.push({
    timestamp: new Date().toISOString(),
    elapsedMs: Math.round((performance.now() - started) * 10) / 10,
    event,
    details,
  })
  if (entries.length > CAPACITY) entries.splice(0, entries.length - CAPACITY)
}

export function recordV2SnapshotDiagnostic(details: {
  revision: number; epoch: number; simulatedTime: number | null
  heartRate: number | null; lowHeartRateLimit: number | null
  processingMs: number
}): void {
  if (!enabled) return
  const now = performance.now()
  const gapMs = lastSnapshotAt == null ? null : Math.round((now - lastSnapshotAt) * 10) / 10
  lastSnapshotAt = now
  recordWaveformDiagnostic('v2-snapshot', { ...details, gapMs })
}

export function getWaveformDiagnostics(): readonly V2WaveformDiagnostic[] {
  return entries
}

export function exportWaveformDiagnostics(buildMarker: string): string {
  return JSON.stringify({
    type: 'loppjuSIM-anaesth-v2-waveform-diagnostics',
    buildMarker,
    capturedAt: new Date().toISOString(),
    userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
    entries,
  }, null, 2)
}
