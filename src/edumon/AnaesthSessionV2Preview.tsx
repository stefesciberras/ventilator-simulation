import { encodeV2WebSocketSecret } from '../session-v2/websocketAuth.mjs'
import { useEffect, useRef, useState } from 'react'
import type { MonitorPatientState } from './types'
import { EDUMON_APP_VERSION } from './appVersion'
import { setWaveformDiagnosticsEnabled, waveformDiagnosticsEnabled, recordV2SnapshotDiagnostic, recordWaveformDiagnostic, getWaveformDiagnostics, clearWaveformDiagnostics, exportWaveformDiagnostics, type V2WaveformDiagnostic } from './v2WaveformDiagnostics'

// A PR number is not a build identifier: a deployment may contain later
// commits and a squash-merge creates a new SHA. Show the exact built source
// revision and build time. PR #476 introduced this provenance display.
const V2_BUILD_SHA = import.meta.env.VITE_BUILD_SHA || 'unknown'
const V2_BUILD_TIME = import.meta.env.VITE_BUILD_TIME || 'unknown'
const BUILD_MARKER = `EDUMON ${EDUMON_APP_VERSION} · build ${V2_BUILD_SHA.slice(0, 12)} · ${V2_BUILD_TIME} · marker PR #476`

export type SessionV2AlarmRuntime = {
  limits: Record<string, number>;
  display: Record<string, boolean>;
  evaluations: Array<{ key: string; label: string; active: boolean; eligible: boolean;
    priority: 'warning' | 'critical'; immediateCritical: boolean }>;
  nibpReading: { systolic: number; diastolic: number; mean: number; measuredAtSimulationTime: number } | null;
  silenced: boolean;
  silencedUntilSimulationTime: number;
  role: 'instructor' | 'candidate' | null;
}
export type SessionV2VentilatorChange =
  | { type: 'mode'; mode: string }
  | { type: 'setting'; path: string; value: number }
export type SessionV2RespiratoryRuntime = { estimatedEtCo2MmHg: number | null; respiratoryRate: number | null;
  spo2Percent: number | null;
  tidalVolumeMl: number | null; simulationTime: number | null;
  expiratoryResistanceCmH2OLs: number | null; peakAirwayPressureCmH2O: number | null;
  clockRunning: boolean; clockSpeed: number }
export type SessionV2MonitorRuntime = { bisValue: number | null; simulationTime: number | null;
  measuredHeartRate: number | null;
  tofReading: { count: number; ratio: number; measuredAtSimulationTime: number } | null }
type SessionV2ActionLibrary = { version: number; source: string;
  actions: Array<{ id: string; name: string; kind: string; candidateAccess: string; mode: string }> }
type SessionV2Snapshot = {
  session: { epoch: number; revision: number; status: string; mode: string }
  runtimes: Array<{ id: string; state: { monitorProjection?: Partial<MonitorPatientState>; gasRuntime?: { etSevoPercent: number }; respiratoryRuntime?: { estimatedEtCo2MmHg: number; respiratoryRate: number; tidalVolumeMl: number; spo2Percent: number; expiratoryResistanceCmH2OLs: number; peakAirwayPressureCmH2O: number }; bronchospasmRuntime?: { targetSeverityPercent: number; effectiveSeverityPercent: number }; alarmRuntime?: Omit<SessionV2AlarmRuntime, 'display' | 'role'>; display?: Record<string, boolean>; monitorRuntime?: { bisValue: number; tofReading: { count: number; ratio: number; measuredAtSimulationTime: number } | null }; effectIndicators?: { neuromuscularBlockPercent: number }; actionRuntime?: { simulationTime: number; activeEffects: Array<{ actionId: string; startedAtSimulationTime: number; effect: { target: string; onsetSeconds: number } }> }; patient?: Partial<MonitorPatientState> & {
    anaestheticGases?: { fiSevoPercent?: number }
  } } }>
}
type ClockControl = { running: boolean; speed: number }
type Status = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'disconnecting' | 'error'

/**
 * Manual, isolated LAN preview only. Normal v1 paths do not instantiate this.
 * This panel may update the monitor's patient input from canonical v2 state;
 * it does not claim to synchronize the full physiology, waveform phase or UI.
 */
export function AnaesthSessionV2Preview({
  onPatientSnapshot,
  heartRateTransitionSeconds,
  onHeartRateTransitionSecondsChange,
  onVolatileSnapshot,
  onMonitorSnapshot,
  onRespiratorySnapshot,
  tofRequestRef,
  ventilatorRequestRef,
  onAlarmSnapshot,
  alarmRequestRef,
}: {
  onPatientSnapshot: (patient: Partial<MonitorPatientState>) => void
  heartRateTransitionSeconds: number
  onHeartRateTransitionSecondsChange: (seconds: number) => void
  onVolatileSnapshot: (etSevoPercent: number | null) => void
  onMonitorSnapshot: (state: SessionV2MonitorRuntime) => void
  onRespiratorySnapshot: (state: SessionV2RespiratoryRuntime) => void
  tofRequestRef: { current: (() => void) | null }
  ventilatorRequestRef: { current: ((change: SessionV2VentilatorChange) => void) | null }
  onAlarmSnapshot: (state: SessionV2AlarmRuntime | null) => void
  alarmRequestRef: { current: ((type: string, payload: object) => void) | null }
}) {
  const [endpoint, setEndpoint] = useState(() => `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/session-v2/ws`)
  const [sessionId, setSessionId] = useState('ana-preview')
  const [secret, setSecret] = useState('')
  const [status, setStatus] = useState<Status>('disconnected')
  const [previewExpanded, setPreviewExpanded] = useState(false)
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(false)
  const [liveDiagnosticsPreview, setLiveDiagnosticsPreview] = useState(true)
  const [diagnosticsEntries, setDiagnosticsEntries] = useState<readonly V2WaveformDiagnostic[]>([])
  const [diagnosticsMessage, setDiagnosticsMessage] = useState('')
  const [message, setMessage] = useState('Experimental Cloudflare v2 preview; v1 remains in use for regular sessions.')
  const [snapshot, setSnapshot] = useState<SessionV2Snapshot | null>(null)
  const [actionLibrary, setActionLibrary] = useState<SessionV2ActionLibrary | null>(null)
  const [selectedAction, setSelectedAction] = useState('propofol')
  const [verifiedRole, setVerifiedRole] = useState<'instructor' | 'candidate' | null>(null)
  const [resetPending, setResetPending] = useState(false)
  const [clock, setClock] = useState<ClockControl>({ running: false, speed: 1 })
  const [newHeartRate, setNewHeartRate] = useState(90)
  const [newFiSevo, setNewFiSevo] = useState(0)
  const [bronchospasmSeverity, setBronchospasmSeverity] = useState(0)
  const lastBronchospasmTargetRef = useRef<number | null>(null)
  const lastBronchospasmSentRef = useRef<number | null>(null)
  const lastAuthoritativeFiSevoRef = useRef<number | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const closedRef = useRef(true)
  const attemptRef = useRef(0)
  const sequenceRef = useRef(0)
  const snapshotRef = useRef<SessionV2Snapshot | null>(null)
  const verifiedRoleRef = useRef<'instructor' | 'candidate' | null>(null)
  const patientCallbackRef = useRef(onPatientSnapshot)
  const volatileCallbackRef = useRef(onVolatileSnapshot)
  const monitorCallbackRef = useRef(onMonitorSnapshot)
  const respiratoryCallbackRef = useRef(onRespiratorySnapshot)
  const alarmCallbackRef = useRef(onAlarmSnapshot)
  patientCallbackRef.current = onPatientSnapshot
  volatileCallbackRef.current = onVolatileSnapshot
  monitorCallbackRef.current = onMonitorSnapshot
  respiratoryCallbackRef.current = onRespiratorySnapshot
  alarmCallbackRef.current = onAlarmSnapshot

  useEffect(() => () => {
    closedRef.current = true
    socketRef.current?.close()
    setWaveformDiagnosticsEnabled(false)
  }, [])

  useEffect(() => {
    if (!diagnosticsEnabled) return
    let observer: PerformanceObserver | null = null
    let longFrameObserver: PerformanceObserver | null = null
    try {
      if (typeof PerformanceObserver !== 'undefined' &&
          PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            recordWaveformDiagnostic('browser-long-task', {
              startAtMs: Math.round(entry.startTime * 10) / 10,
              durationMs: Math.round(entry.duration * 10) / 10,
              attributionCount: Array.isArray((entry as PerformanceEntry & { attribution?: unknown[] }).attribution)
                ? (entry as PerformanceEntry & { attribution: unknown[] }).attribution.length : 0,
            })
          }
        })
        observer.observe({ entryTypes: ['longtask'] })
      }
    } catch { /* Optional browser API; RAF diagnostics remain available. */ }
    try {
      if (typeof PerformanceObserver !== 'undefined' &&
          PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')) {
        longFrameObserver = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            const frame = entry as PerformanceEntry & {
              blockingDuration?: number
              renderStart?: number
              styleAndLayoutStart?: number
              scripts?: Array<PerformanceEntry & {
                invoker?: string
                invokerType?: string
                sourceFunctionName?: string
                sourceURL?: string
                forcedStyleAndLayoutDuration?: number
                pauseDuration?: number
              }>
            }
            const scripts = (frame.scripts ?? []).slice(0, 8).map(script => {
              // Keep the bundle filename for source mapping, but omit origin,
              // query string and fragment from this manually exported log.
              let sourceFile = ''
              if (script.sourceURL) {
                try {
                  sourceFile = new URL(script.sourceURL, window.location.href)
                    .pathname.split('/').filter(Boolean).pop() ?? ''
                } catch { /* Missing/invalid source URL is represented as empty. */ }
              }
              return {
                durationMs: Math.round(script.duration * 10) / 10,
                invoker: (script.invoker ?? '').slice(0, 100),
                invokerType: (script.invokerType ?? '').slice(0, 40),
                functionName: (script.sourceFunctionName ?? '').slice(0, 100),
                sourceFile,
                forcedLayoutMs: Math.round((script.forcedStyleAndLayoutDuration ?? 0) * 10) / 10,
                pauseMs: Math.round((script.pauseDuration ?? 0) * 10) / 10,
              }
            })
            recordWaveformDiagnostic('browser-long-animation-frame', {
              startAtMs: Math.round(entry.startTime * 10) / 10,
              durationMs: Math.round(entry.duration * 10) / 10,
              blockingDurationMs: Math.round((frame.blockingDuration ?? 0) * 10) / 10,
              renderDurationMs: frame.renderStart
                ? Math.round((entry.startTime + entry.duration - frame.renderStart) * 10) / 10 : 0,
              styleAndLayoutMs: frame.styleAndLayoutStart
                ? Math.round((entry.startTime + entry.duration - frame.styleAndLayoutStart) * 10) / 10 : 0,
              scriptCount: frame.scripts?.length ?? 0,
              scripts: JSON.stringify(scripts),
            })
          }
        })
        longFrameObserver.observe({ type: 'long-animation-frame' })
      }
    } catch { /* Chrome's LoAF attribution is optional; long-task logging remains. */ }
    return () => { observer?.disconnect(); longFrameObserver?.disconnect() }
  }, [diagnosticsEnabled])

  // The periodic UI refresh itself schedules React work during a capture.
  // Keep recording independent so it can be disabled as an A/B isolation
  // experiment without losing events from the in-memory diagnostic buffer.
  useEffect(() => {
    if (!diagnosticsEnabled || !liveDiagnosticsPreview) return
    const refresh = () => setDiagnosticsEntries([...getWaveformDiagnostics()].slice(-20).reverse())
    refresh()
    const interval = window.setInterval(refresh, 800)
    return () => window.clearInterval(interval)
  }, [diagnosticsEnabled, liveDiagnosticsPreview])

  const refreshDiagnosticsPreview = () =>
    setDiagnosticsEntries([...getWaveformDiagnostics()].slice(-20).reverse())

  // Periodic baseline evidence is needed even while the canonical clock is
  // paused: no snapshots or slow frames is itself meaningful.
  useEffect(() => {
    if (!diagnosticsEnabled) return
    const heartbeat = () => recordWaveformDiagnostic('diagnostic-heartbeat', {
      clockRunning: clock.running,
      clockSpeed: clock.speed,
      connection: status,
      captureActive: true,
    })
    heartbeat()
    const timer = window.setInterval(heartbeat, 1000)
    return () => window.clearInterval(timer)
  }, [diagnosticsEnabled, clock.running, clock.speed, status])

  const toggleDiagnostics = () => {
    const next = !diagnosticsEnabled
    setWaveformDiagnosticsEnabled(next)
    setDiagnosticsEnabled(next)
    setDiagnosticsMessage(next ? 'Capturing locally; reproduce the pause, then copy the log.' : 'Capture stopped.')
    setDiagnosticsEntries([...getWaveformDiagnostics()].slice(-20).reverse())
  }
  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(exportWaveformDiagnostics(BUILD_MARKER))
      setDiagnosticsMessage(`Copied ${getWaveformDiagnostics().length} diagnostic events. No session credentials included.`)
    } catch {
      setDiagnosticsMessage('Clipboard unavailable. Use the Export diagnostics button instead.')
    }
  }
  const exportDiagnostics = () => {
    const blob = new Blob([exportWaveformDiagnostics(BUILD_MARKER)], { type: 'application/json' })
    const uri = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = uri
    anchor.download = 'loppjusim-v2-waveform-diagnostics.json'
    anchor.click()
    URL.revokeObjectURL(uri)
  }

  const receiveSnapshot = (next: SessionV2Snapshot, authorityClock: ClockControl = { running: false, speed: 1 }) => {
    if (!next?.session || !Array.isArray(next.runtimes)) return
    const measuring = waveformDiagnosticsEnabled()
    const snapshotStarted = measuring ? performance.now() : 0
    const previous = snapshotRef.current
    if (previous && next.session.epoch < previous.session.epoch) return
    if (previous && next.session.epoch === previous.session.epoch &&
        next.session.revision < previous.session.revision) return
    snapshotRef.current = next
    setSnapshot(next)
    const runtime = next.runtimes.find(item => item.id === 'main')?.state
    const patient = runtime?.monitorProjection ?? runtime?.patient
    // A form value is only a draft. Seed it from the first authoritative
    // snapshot and again when canonical FiSevo changes (including reset), but
    // never overwrite an unsent edit on each automatic clock tick.
    const actualFiSevo = runtime?.patient?.anaestheticGases?.fiSevoPercent
    if (typeof actualFiSevo === 'number' && Number.isFinite(actualFiSevo) &&
      lastAuthoritativeFiSevoRef.current !== actualFiSevo) {
      lastAuthoritativeFiSevoRef.current = actualFiSevo
      setNewFiSevo(actualFiSevo)
    }
    if (patient) patientCallbackRef.current(patient)
    // The full monitor's gas footer must consume the same canonical value
    // as this preview. Do not let its separate v1 animation clock run here.
    const etSevo = runtime?.gasRuntime?.etSevoPercent
    volatileCallbackRef.current(typeof etSevo === 'number' && Number.isFinite(etSevo) ? etSevo : null)
    const actualBronchospasmTarget = runtime?.bronchospasmRuntime?.targetSeverityPercent
    if (typeof actualBronchospasmTarget === 'number' &&
        lastBronchospasmTargetRef.current !== actualBronchospasmTarget) {
      lastBronchospasmTargetRef.current = actualBronchospasmTarget
      setBronchospasmSeverity(actualBronchospasmTarget)
    }
    respiratoryCallbackRef.current({
      expiratoryResistanceCmH2OLs: runtime?.respiratoryRuntime?.expiratoryResistanceCmH2OLs ?? null,
      peakAirwayPressureCmH2O: runtime?.respiratoryRuntime?.peakAirwayPressureCmH2O ?? null,
      estimatedEtCo2MmHg: runtime?.respiratoryRuntime?.estimatedEtCo2MmHg ?? null,
      spo2Percent: runtime?.respiratoryRuntime?.spo2Percent ?? null,
      respiratoryRate: runtime?.respiratoryRuntime?.respiratoryRate ?? null,
      tidalVolumeMl: runtime?.respiratoryRuntime?.tidalVolumeMl ?? null,
      simulationTime: runtime?.actionRuntime?.simulationTime ?? null,
      clockRunning: authorityClock.running,
      clockSpeed: authorityClock.speed,
    })
    if (runtime?.alarmRuntime?.limits) alarmCallbackRef.current({
      limits: runtime.alarmRuntime.limits,
      display: runtime.display ?? {},
      evaluations: runtime.alarmRuntime.evaluations ?? [],
      nibpReading: runtime.alarmRuntime.nibpReading ?? null,
      silenced: runtime.alarmRuntime.silenced ?? false,
      silencedUntilSimulationTime: runtime.alarmRuntime.silencedUntilSimulationTime ?? 0,
      role: verifiedRoleRef.current,
    })
    monitorCallbackRef.current({
      // The alarm evaluator uses the same server-projected HR. Do not publish
      // the browser's trailing five-beat average as the v2 numeric monitor HR.
      measuredHeartRate: typeof patient?.heartRate === 'number' && Number.isFinite(patient.heartRate)
        ? patient.heartRate : null,
      bisValue: typeof runtime?.monitorRuntime?.bisValue === 'number' ? runtime.monitorRuntime.bisValue : null,
      simulationTime: runtime?.actionRuntime?.simulationTime ?? null,
      tofReading: runtime?.monitorRuntime?.tofReading ?? null,
    })
    if (measuring) {
      recordV2SnapshotDiagnostic({
        revision: next.session.revision,
        epoch: next.session.epoch,
        simulatedTime: runtime?.actionRuntime?.simulationTime ?? null,
        heartRate: typeof patient?.heartRate === 'number' ? patient.heartRate : null,
        lowHeartRateLimit: runtime?.alarmRuntime?.limits?.heartRateLow ?? null,
        processingMs: Math.round((performance.now() - snapshotStarted) * 10) / 10,
      })
    }
  }
  const connect = (targetSessionId = sessionId) => {
    closedRef.current = false
    attemptRef.current += 1
    const currentAttempt = attemptRef.current
    snapshotRef.current = null
    verifiedRoleRef.current = null
    alarmCallbackRef.current(null)
    lastAuthoritativeFiSevoRef.current = null
    lastBronchospasmTargetRef.current = null
    lastBronchospasmSentRef.current = null
    volatileCallbackRef.current(null)
    monitorCallbackRef.current({ measuredHeartRate: null, bisValue: null, simulationTime: null, tofReading: null })
    respiratoryCallbackRef.current({ estimatedEtCo2MmHg: null, spo2Percent: null, respiratoryRate: null, tidalVolumeMl: null, simulationTime: null, clockRunning: false, clockSpeed: 1, expiratoryResistanceCmH2OLs: null, peakAirwayPressureCmH2O: null })
    setSnapshot(null)
    setActionLibrary(null)
    setVerifiedRole(null)
    setResetPending(false)
    setClock({ running: false, speed: 1 })
    setStatus('connecting')
    setMessage('Connecting to experimental Cloudflare session authority...')
    const url = endpoint.trim()
    if (!/^wss?:\/\//.test(url) || !/^[a-zA-Z0-9_-]{3,80}$/.test(targetSessionId)) {
      setStatus('error')
      setMessage('Invalid Cloudflare WebSocket endpoint or session ID')
      return
    }
    let protocol: string
    try {
      protocol = encodeV2WebSocketSecret(secret)
    } catch {
      closedRef.current = true
      setStatus('error')
      setMessage('Invalid test secret. Enter a non-empty UTF-8 secret of at most 256 bytes.')
      return
    }
    let tries = 0
    const open = () => {
      if (closedRef.current || currentAttempt !== attemptRef.current) return
      let socket: WebSocket
      try {
        socket = new WebSocket(`${url}?sessionId=${encodeURIComponent(targetSessionId)}`, ['loppjusim-v2', protocol])
      } catch {
        closedRef.current = true
        setStatus('error')
        setMessage('Unable to create the WebSocket. Check the endpoint and browser security settings.')
        return
      }
      socketRef.current = socket
      let welcomed = false
      const handshakeTimeout = window.setTimeout(() => {
        if (!welcomed && socket.readyState !== WebSocket.CLOSED) socket.close()
      }, 10000)
      socket.onopen = () => {
        if (socket.protocol !== 'loppjusim-v2') {
          setMessage('Cloudflare did not negotiate the required Session v2 protocol.')
          socket.close(1002, 'Invalid negotiated protocol')
          return
        }
        setMessage('WebSocket open; awaiting canonical session snapshot...')
      }
      socket.onmessage = event => {
        let packet: any
        try { packet = JSON.parse(String(event.data)) } catch { return }
        if (packet.protocol !== 2) return
        if (packet.type === 'welcome') {
          welcomed = true
          window.clearTimeout(handshakeTimeout)
          tries = 0
          verifiedRoleRef.current = packet.role === 'instructor' || packet.role === 'candidate'
            ? packet.role : null
          setVerifiedRole(verifiedRoleRef.current)
          setStatus('connected')
          setPreviewExpanded(false)
          setMessage('Live Cloudflare preview; changes are persisted before acknowledgement.')
          if (packet.actionLibrary) setActionLibrary(packet.actionLibrary as SessionV2ActionLibrary)
          if (packet.clock) setClock(packet.clock as ClockControl)
          receiveSnapshot(packet.snapshot, packet.clock as ClockControl | undefined)
        } else if (packet.type === 'snapshot') {
          if (packet.actionLibrary) setActionLibrary(packet.actionLibrary as SessionV2ActionLibrary)
          if (packet.clock) setClock(packet.clock as ClockControl)
          receiveSnapshot(packet.snapshot, packet.clock as ClockControl | undefined)
        } else if (packet.type === 'clock-receipt') {
          if (packet.clock) setClock(packet.clock as ClockControl)
          setMessage(packet.accepted ? 'Authoritative simulation clock updated.' : 'Clock update failed.')
        } else if (packet.type === 'receipt') {
          if (typeof packet.requestId === 'string' && packet.requestId.startsWith('reset-')) {
            setResetPending(false)
            setMessage(packet.receipt?.accepted
              ? 'Patient reset committed: default values, no active drugs, and simulation time 0. Both screens updated.'
              : `Reset rejected: ${packet.receipt?.reason ?? 'unknown'}`)
          }
          if (!packet.receipt?.accepted && !String(packet.requestId ?? '').startsWith('reset-')) setMessage(`Command rejected: ${packet.receipt?.reason ?? 'unknown'}`)
        } else if (packet.type === 'error') {
          setMessage(`Cloud authority: ${packet.reason}`)
          if (['unauthenticated', 'not-session-member', 'invalid-session'].includes(packet.reason)) {
            closedRef.current = true
            setStatus('error')
            socket.close()
          }
        }
      }
      socket.onerror = () => { /* browser does not expose HTTP failure code here */ }
      socket.onclose = (event) => {
        window.clearTimeout(handshakeTimeout)
        if (closedRef.current || currentAttempt !== attemptRef.current) return
        if (tries >= 3) {
          closedRef.current = true
          setStatus('error')
          setMessage('Cloudflare WebSocket failed; checking server readiness...')
          // This endpoint exposes only a configuration readiness code.
          // Never send the secret, offered protocols, or URL query here.
          const checkUrl = new URL('/api/session-v2/status', window.location.origin)
          void fetch(checkUrl, { cache: 'no-store' })
            .then(async response => {
              if (!response.ok) throw Error('diagnostic-unavailable')
              const info = await response.json() as { ready?: boolean; reason?: string }
              if (currentAttempt !== attemptRef.current) return
              setMessage(info.ready
                ? `Server configuration ready, but WebSocket handshake failed (close ${event.code}). Check Network → WS response status and Cloudflare Worker logs.`
                : `Session v2 server unavailable: ${info.reason ?? 'unknown'}. Check Cloudflare Worker settings.`)
            })
            .catch(() => {
              if (currentAttempt === attemptRef.current) {
                setMessage(`WebSocket handshake failed (close ${event.code}); the server readiness endpoint is unavailable. Check Network → WS and Cloudflare deployment.`)
              }
            })
          return
        }
        setStatus('reconnecting')
        setMessage(`Connection closed (code ${event.code}); retrying experimental Cloudflare session...`)
        const delay = Math.min(5000, 500 * (2 ** tries++))
        window.setTimeout(open, delay)
      }
    }
    socketRef.current?.close()
    open()
  }
  const disconnect = () => {
    setStatus('disconnecting')
    closedRef.current = true
    attemptRef.current += 1
    socketRef.current?.close()
    socketRef.current = null
    snapshotRef.current = null
    lastAuthoritativeFiSevoRef.current = null
    lastBronchospasmTargetRef.current = null
    volatileCallbackRef.current(null)
    monitorCallbackRef.current({ measuredHeartRate: null, bisValue: null, simulationTime: null, tofReading: null })
    tofRequestRef.current = null
    ventilatorRequestRef.current = null
    alarmRequestRef.current = null
    alarmCallbackRef.current(null)
    verifiedRoleRef.current = null
    setStatus('disconnected')
    setSnapshot(null)
    setActionLibrary(null)
    setVerifiedRole(null)
    setResetPending(false)
    setClock({ running: false, speed: 1 })
  }
  const command = (type: string, payload: object, requestPrefix = 'cmd') => {
    const socket = socketRef.current
    const epoch = snapshotRef.current?.session.epoch
    if (socket?.readyState !== WebSocket.OPEN || !epoch) return false
    socket.send(JSON.stringify({ protocol: 2, type: 'command',
      requestId: `${requestPrefix}-${++sequenceRef.current}`,
      command: { id: crypto.randomUUID(), epoch, runtimeId: 'main', type, payload },
    }))
    return true
  }
  tofRequestRef.current = status === 'connected' ? () => { command('monitor.tof.measure', {}) } : null
  alarmRequestRef.current = status === 'connected'
    ? (type: string, payload: object) => { command(type, payload) } : null
  ventilatorRequestRef.current = status === 'connected'
    ? (change: SessionV2VentilatorChange) => {
      if (change.type === 'mode') command('device.ventilator.mode.set', { mode: change.mode })
      else command('device.parameter.set', { path: change.path, value: change.value })
    } : null
  useEffect(() => {
    // Debounce command submission, not slider movement. Server owns severity.
    if (status !== 'connected' || verifiedRole !== 'instructor' ||
        bronchospasmSeverity === lastBronchospasmTargetRef.current ||
        bronchospasmSeverity === lastBronchospasmSentRef.current) return
    const handle = window.setTimeout(() => {
      if (socketRef.current?.readyState !== WebSocket.OPEN ||
          snapshotRef.current?.session.epoch == null) return
      socketRef.current.send(JSON.stringify({
        protocol: 2, type: 'command',
        requestId: `event-${++sequenceRef.current}`,
        command: { id: crypto.randomUUID(),
          epoch: snapshotRef.current.session.epoch, runtimeId: 'main',
          type: 'event.bronchospasm.set',
          payload: { severityPercent: bronchospasmSeverity },
        },
      }))
      lastBronchospasmSentRef.current = bronchospasmSeverity
    }, 150)
    return () => window.clearTimeout(handle)
  }, [bronchospasmSeverity, status, verifiedRole])
  const controlClock = (running: boolean, speed = clock.speed) => {
    const socket = socketRef.current
    if (verifiedRole !== 'instructor' || socket?.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ protocol: 2, type: 'clock.control',
      requestId: `clock-${++sequenceRef.current}`, running, speed }))
  }
  const resetPatient = () => {
    if (verifiedRole !== 'instructor' || resetPending) return
    if (!window.confirm('Reset this session to defaults? This removes ALL active drugs and events, restores baseline patient settings, and rewinds simulation time to zero for everyone connected.')) return
    setResetPending(true)
    if (!command('reset', {}, 'reset')) setResetPending(false)
  }
  const newSession = () => {
    if (verifiedRole !== 'instructor') return
    if (!window.confirm('Create and join a NEW v2 session with default patient values and the latest available action library? The current session remains saved. Candidates must reconnect using the new session ID.')) return
    const nextId = `ana-${crypto.randomUUID()}`
    // Opening the new room is initiated by the authenticated instructor.
    // Close the old socket and cancel its retry attempts before switching.
    disconnect()
    setSessionId(nextId)
    connect(nextId)
    setMessage(`Creating session ${nextId}. Share this ID with the candidate after connection.`)
  }
  const runtime = snapshot?.runtimes.find(item => item.id === 'main')?.state
  const patient = runtime?.monitorProjection ?? runtime?.patient
  const actionRuntime = runtime?.actionRuntime
  const relaxantEffect = actionRuntime?.activeEffects.find(item => item.actionId === 'relaxant' && item.effect.target === 'neuromuscular.block')
  const relaxantElapsedSeconds = relaxantEffect ? Math.max(0, (actionRuntime?.simulationTime ?? 0) - relaxantEffect.startedAtSimulationTime) : null
  return (
    <section style={{ border: '1px solid #8696a8', borderRadius: 8, padding: 12, margin: '8px 16px', maxWidth: 680 }}
      aria-label="Experimental Session Engine v2 preview">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <strong>Session Engine v2 — experimental Cloudflare preview</strong>
        <span aria-label="v2 preview build identifier" style={{ fontSize: 11, opacity: 0.8 }}>{BUILD_MARKER}</span>
        <span style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
          role="status" aria-live="polite" aria-label={`Session connection: ${status}`}>
          <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', display: 'inline-block',
            backgroundColor: status === 'connected' ? '#2eae6e' : status === 'connecting' || status === 'reconnecting' || status === 'disconnecting' ? '#e9a23b' : '#d45b5b' }} />
          {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting…' : status === 'reconnecting' ? 'Reconnecting…' :
            status === 'disconnecting' ? 'Disconnecting…' : status === 'error' ? 'Connection failed' : 'Disconnected'}
          {status === 'connected' ? ` · ${verifiedRole ?? 'participant'} · ${clock.running ? 'Running' : 'Paused'}` : ''}
        </span>
        <button type="button" aria-expanded={previewExpanded} aria-controls="anaesth-session-v2-controls"
          onClick={() => setPreviewExpanded(current => !current)}>
          {previewExpanded ? 'Collapse preview ▲' : 'Expand preview ▼'}
        </button>
      </div>
      <div id="anaesth-session-v2-controls" hidden={!previewExpanded}>
      <section aria-label="v2 waveform diagnostics" style={{ border: '1px solid #768395', borderRadius: 6, padding: 8, marginTop: 8 }}>
        <strong>Waveform diagnostics (local, opt-in)</strong>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          <label><input type="checkbox" checked={diagnosticsEnabled} onChange={toggleDiagnostics} /> Enable frame/snapshot logging</label>
          <label><input type="checkbox" checked={liveDiagnosticsPreview}
            onChange={event => setLiveDiagnosticsPreview(event.target.checked)} /> Live log preview (disable for isolation)</label>
          {!liveDiagnosticsPreview && <button type="button" onClick={refreshDiagnosticsPreview}>Refresh log view</button>}
          <button type="button" onClick={copyDiagnostics}>Copy diagnostics</button>
          <button type="button" onClick={exportDiagnostics}>Export diagnostics</button>
          <button type="button" onClick={() => {
            clearWaveformDiagnostics()
            setDiagnosticsEntries([])
            setDiagnosticsMessage('Diagnostic history cleared.')
          }}>Clear logs</button>
        </div>
        <p style={{ fontSize: 11, margin: '6px 0' }}>
          Capture frame gaps over 40 ms, costly redraws over 8 ms, and snapshot timing. Up to 300 entries in memory; nothing sent to Cloudflare. Disabling the live preview stops only its 800 ms React UI refresh; recording and export continue.
          PR number identifies the diagnostic feature, not necessarily the latest deployment commit.
        </p>
        <div role="status" style={{ fontSize: 11 }}>{diagnosticsMessage} · {diagnosticsEnabled ? 'Capture active' : 'Capture off'} · {diagnosticsEntries.length} latest shown</div>
        {diagnosticsEntries.length > 0 && <pre style={{ maxHeight: 170, overflow: 'auto', fontSize: 10, whiteSpace: 'pre-wrap' }}>{
          diagnosticsEntries.map(entry => `${entry.timestamp} ${entry.event} ${JSON.stringify(entry.details)}`).join('\n')
        }</pre>}
      </section>
      <p style={{ fontSize: 12, margin: '6px 0' }}>Uses checkpointed Anaesth ActionEffects and simplified end-tidal sevo uptake; effective anaesthetic depth combines volatile and IV hypnotic effects. The model is educational, not a complete clinical physiology engine. Drug onset follows the authoritative clock when resumed (Relaxant default onset: 120 simulated seconds). Pause/resume and speed are instructor-only. Do not use for clinical care or assessed simulation.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <label>Cloudflare WebSocket <input aria-label="v2 WebSocket endpoint" value={endpoint}
          onChange={event => setEndpoint(event.target.value)} disabled={status === 'connected'} /></label>
        <label>Session <input aria-label="v2 session ID" value={sessionId}
          onChange={event => setSessionId(event.target.value)} disabled={status === 'connected'} /></label>
        <label>Experimental access secret <input type="password" autoComplete="off" aria-label="v2 test access secret"
          value={secret} onChange={event => setSecret(event.target.value)} disabled={status === 'connected'} /></label>
        {status === 'connected' || status === 'connecting' || status === 'reconnecting'
          ? <button type="button" onClick={disconnect}>Disconnect</button>
          : <button type="button" onClick={() => connect()} disabled={!secret}>Connect</button>}
      </div>
      <p role="status" style={{ fontSize: 12 }}>{status}: {message}</p>
      {snapshot && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <span>Epoch {snapshot.session.epoch} · Rev {snapshot.session.revision}</span>
        <span>Role: {verifiedRole ?? 'unknown'}</span>
        <span>HR (modelled) {typeof patient?.heartRate === 'number' ? Math.round(patient.heartRate) : '—'} bpm</span>
        <span>HR target {runtime?.patient?.heartRate ?? '—'} bpm</span>
        <span>HR low alarm threshold {runtime?.alarmRuntime?.limits?.heartRateLow ?? '—'} bpm</span>
        <span>FiSevo {patient?.anaestheticGases?.fiSevoPercent ?? '—'}%</span>
        <span>EtSevo (v2) {runtime?.gasRuntime?.etSevoPercent?.toFixed(2) ?? 'Not recorded in this older session'}{runtime?.gasRuntime ? '%' : ''}</span>
        <span>EtSevo MAC {typeof runtime?.gasRuntime?.etSevoPercent === 'number' ? (runtime.gasRuntime.etSevoPercent / 2).toFixed(2) : '—'} (approx.)</span>
        <span>Simulated time {actionRuntime?.simulationTime ?? 0}s</span>
        <span>Clock: {clock.running ? 'Running' : 'Paused'} · {clock.speed}×</span>
        <span>Depth {patient?.anaestheticPhysiology?.depthOfAnaesthesia ?? '—'}</span>
        <span>SpO₂ (v2 model) {runtime?.respiratoryRuntime?.spo2Percent?.toFixed(1) ?? '—'}%</span>
        <span>EtCO₂ (v2 model) {runtime?.respiratoryRuntime?.estimatedEtCo2MmHg?.toFixed(1) ?? '—'} mmHg</span>
        <span>Effective RR (v2) {runtime?.respiratoryRuntime?.respiratoryRate?.toFixed(1) ?? '—'}/min</span>
        <span>Ppeak (v2 model) {runtime?.respiratoryRuntime?.peakAirwayPressureCmH2O?.toFixed(1) ?? '—'} cmH₂O</span>
        <span>Airway resistance {runtime?.respiratoryRuntime?.expiratoryResistanceCmH2OLs?.toFixed(1) ?? '—'} cmH₂O·s/L</span>
        <span>Active eligible alarms {runtime?.alarmRuntime?.evaluations?.filter(item => item.active && item.eligible).length ?? 0}</span>
        <span>Bronchospasm effective {runtime?.bronchospasmRuntime?.effectiveSeverityPercent?.toFixed(0) ?? '0'}%</span>
        {verifiedRole === 'instructor' && <>
          <label>Bronchospasm severity {bronchospasmSeverity}%
            <input type="range" min={0} max={100} step={5} value={bronchospasmSeverity}
              aria-label="Bronchospasm severity percent" onChange={event => setBronchospasmSeverity(Number(event.target.value))}/>
          </label>
          <span style={{ fontSize: 12 }}>Live severity</span>

        </>}
        {verifiedRole === 'instructor' && runtime?.alarmRuntime && <>
          {(['invasiveBloodPressure', 'capnography', 'bis', 'temperature'] as const).map(parameter =>
            <label key={parameter} style={{fontSize:12}}>
              <input type="checkbox" checked={Boolean(runtime.display?.[parameter])}
                onChange={event => command('alarm.display.set', { parameter, enabled: event.target.checked })}/>
              {parameter}
            </label>)}
        </>}
        <span>BIS (modelled) {runtime?.monitorRuntime?.bisValue == null ? '—' : Math.round(runtime.monitorRuntime.bisValue)}</span>
        <span>TOF (last measurement) {runtime?.monitorRuntime?.tofReading ? `${runtime.monitorRuntime.tofReading.count}/4 · ratio ${runtime.monitorRuntime.tofReading.ratio.toFixed(2)}` : '—'}</span>
        <button type="button" onClick={() => command('monitor.tof.measure', {})}>Measure TOF</button>
        <span>Spontaneous RR {patient?.respiratory?.spontaneousRespiratoryRate?.toFixed(1) ?? '—'}/min</span>
        {verifiedRole === 'instructor' && <>
          <label>Target HR <input type="number" min={0} max={240} value={newHeartRate}
            aria-label="v2 target HR" onChange={event => setNewHeartRate(Number(event.target.value))} /></label>
          <label>HR transition <select aria-label="v2 HR transition duration" value={heartRateTransitionSeconds}
            onChange={event => onHeartRateTransitionSecondsChange(Number(event.target.value))}>
            {[0, 5, 10, 30, 60].map(seconds =>
              <option key={seconds} value={seconds}>{seconds === 0 ? 'Immediate' : `${seconds} seconds`}</option>)}
          </select></label>
          <button type="button" disabled={status !== 'connected' || !Number.isFinite(newHeartRate) ||
            newHeartRate < 0 || newHeartRate > 240}
            onClick={() => command('patient.parameter.set', {
              path: 'heartRate', value: newHeartRate, transitionSeconds: heartRateTransitionSeconds,
            })}>Set HR (instructor)</button>
        </>}
        <label>FiSevo to set <input type="number" min={0} max={8} step={0.1} value={newFiSevo}
          onChange={event => setNewFiSevo(Number(event.target.value))} /></label>
        <button type="button" disabled={status !== 'connected' || !Number.isFinite(newFiSevo) || newFiSevo < 0 || newFiSevo > 8} onClick={() => command('anaesth.gas.set', { fiSevoPercent: newFiSevo })}>Set FiSevo</button>
        {actionLibrary && <>
          <span>Session catalogue: {actionLibrary.source} (v{actionLibrary.version})</span>
          <label>Action <select aria-label="Session v2 action" value={actionLibrary.actions.some(item => item.id === selectedAction) ? selectedAction : (actionLibrary.actions[0]?.id ?? '')}
            onChange={event => setSelectedAction(event.target.value)}>
            {actionLibrary.actions.map(item => <option key={item.id} value={item.id}>{item.name} · {item.kind}</option>)}
          </select></label>
          <button type="button" onClick={() => command('action.invoke', { actionId: actionLibrary.actions.some(item => item.id === selectedAction) ? selectedAction : actionLibrary.actions[0]?.id })}
            disabled={!actionLibrary.actions.length}>Invoke selected action (experimental)</button>
        </>}
        {verifiedRole === 'instructor' && <>
          <button type="button" onClick={() => controlClock(!clock.running)}>
            {clock.running ? 'Pause' : 'Resume'}
          </button>
          <label>Simulation speed <select aria-label="Simulation clock speed" value={clock.speed}
            onChange={event => controlClock(clock.running, Number(event.target.value))}>
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select></label>
          <button type="button" disabled={clock.running} onClick={() => command('tick', { deltaMs: 1000 })}>Step +1s</button>
          <button type="button" disabled={clock.running} onClick={() => {
            for (let i = 0; i < 10; i++) command('tick', { deltaMs: 1000 })
          }}>Step +10s</button>
        </>}
        <span>Active effects {actionRuntime?.activeEffects?.length ?? 0}</span>
        <span>Neuromuscular block (v2 model): {runtime?.effectIndicators?.neuromuscularBlockPercent ?? '—'}%</span>
        {relaxantEffect && <span>Relaxant onset: {Math.round(relaxantElapsedSeconds ?? 0)} / {relaxantEffect.effect.onsetSeconds}s simulated; the running clock advances its effect.</span>}
        {verifiedRole === 'instructor' && <>
          <button type="button" onClick={resetPatient} disabled={resetPending}>
            {resetPending ? 'Resetting…' : 'Reset Patient'}
          </button>
          <button type="button" onClick={newSession} disabled={resetPending}>New Session</button>
        </>}
      </div>}
      </div>
    </section>
  )
}
