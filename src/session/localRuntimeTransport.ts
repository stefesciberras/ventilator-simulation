import type { PatientSettings, VentilatorSettings } from '../simulation/types'
import type { AlarmLimits } from '../alarmTypes'

export type LocalRuntimeConnection = 'disabled' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface LocalRuntimePolicy {
  syncPatient: boolean
  syncVentilator: boolean
  candidateCanEditPatient: boolean
  candidateCanEditVentilator: boolean
  syncAlarms: boolean
  candidateCanEditAlarms: boolean
  alarmsSilent: boolean
  candidateCanEditWaveforms: boolean
  allowOesophagealPressure: boolean
  showPatientEffort: boolean
}

export interface LocalRuntimeSnapshot {
  sessionId: string
  sessionKey: string
  status: 'active' | 'paused' | 'ended'
  sentAt: number
  scenarioElapsedMs?: number
  patient: PatientSettings
  ventilator: VentilatorSettings
  alarmLimits: AlarmLimits
  patientTransitionMs: number
  simulationPaused: boolean
  policy: LocalRuntimePolicy
}

export interface LocalScenarioRuntimeEvent {
  eventId: string
  scenarioTimeMs: number
  emittedAt: number
  eventType: string
  payload: unknown
}

export type LocalRuntimePayload =
  | { type: 'snapshot'; snapshot: LocalRuntimeSnapshot }
  | { type: 'scenario-event'; event: LocalScenarioRuntimeEvent }

export interface LocalRuntimeEnvelope {
  type: 'runtime'
  sequence: number
  serverTime: number
  payload: LocalRuntimePayload
}

interface LocalRuntimeTransportOptions {
  url: string
  role: 'instructor' | 'candidate'
  sessionKey: string
  sessionId: string
  clientId: string
  onConnection: (state: LocalRuntimeConnection) => void
  onEnvelope: (envelope: LocalRuntimeEnvelope) => void
}

const MAX_RECONNECT_DELAY_MS = 5000

export function getDefaultLocalRuntimeUrl(): string | null {
  if (typeof window === 'undefined') return null

  const queryOverride = new URLSearchParams(window.location.search).get('localRelay')?.trim()
  const storedOverride = window.localStorage.getItem('eduvent.local-runtime-url')?.trim()
  const override = queryOverride || storedOverride
  if (override) {
    try {
      const url = new URL(override)
      if (url.protocol === 'ws:' || url.protocol === 'wss:') return url.toString()
    } catch {
      // Fall through to same-origin detection.
    }
  }

  const hostname = window.location.hostname
  const privateIpv4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname)
  const localHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local') || privateIpv4
  if (window.location.protocol !== 'http:' || !localHost) return null
  return `ws://${window.location.host}/eduvent-session`
}

export type LocalRuntimeProfile = 'local-server' | 'appliance'

export function getLocalRuntimeProfile(): LocalRuntimeProfile {
  if (typeof window === 'undefined') return 'local-server'
  const query = new URLSearchParams(window.location.search).get('runtimeProfile')?.trim().toLowerCase()
  const stored = window.localStorage.getItem('eduvent.runtime-profile')?.trim().toLowerCase()
  const selected = query || stored
  if (selected === 'appliance') return 'appliance'
  if (window.location.hostname === 'eduvent.local' || window.location.hostname.startsWith('eduvent-box')) return 'appliance'
  return 'local-server'
}

export function saveLocalRuntimeUrl(url: string | null) {
  if (typeof window === 'undefined') return
  if (!url) {
    window.localStorage.removeItem('eduvent.local-runtime-url')
    return
  }
  const parsed = new URL(url)
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') throw new Error('Local runtime URL must use ws:// or wss://.')
  window.localStorage.setItem('eduvent.local-runtime-url', parsed.toString())
}

export class LocalRuntimeTransport {
  private socket: WebSocket | null = null
  private reconnectTimer: number | null = null
  private reconnectAttempts = 0
  private intentionallyClosed = false
  private lastSequence = 0

  constructor(private readonly options: LocalRuntimeTransportOptions) {}

  connect() {
    this.intentionallyClosed = false
    this.openSocket(this.lastSequence > 0 ? 'reconnecting' : 'connecting')
  }

  disconnect() {
    this.intentionallyClosed = true
    if (this.reconnectTimer != null) window.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.socket?.close()
    this.socket = null
    this.options.onConnection('disabled')
  }

  publish(payload: LocalRuntimePayload) {
    if (this.options.role !== 'instructor' || this.socket?.readyState !== WebSocket.OPEN) return false
    this.socket.send(JSON.stringify({ type: 'publish', payload }))
    return true
  }

  requestResync() {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify({ type: 'resync', lastSequence: this.lastSequence }))
  }

  private openSocket(state: LocalRuntimeConnection) {
    this.options.onConnection(state)
    try {
      const socket = new WebSocket(this.options.url)
      this.socket = socket

      socket.addEventListener('open', () => {
        this.reconnectAttempts = 0
        this.options.onConnection('connected')
        socket.send(JSON.stringify({
          type: 'hello',
          role: this.options.role,
          sessionKey: this.options.sessionKey,
          sessionId: this.options.sessionId,
          clientId: this.options.clientId,
          lastSequence: this.lastSequence,
        }))
      })

      socket.addEventListener('message', (event) => {
        let message: unknown
        try { message = JSON.parse(String(event.data)) } catch { return }
        if (!message || typeof message !== 'object') return
        const record = message as Record<string, unknown>
        if (record.type === 'welcome') {
          const sequence = Number(record.sequence ?? 0)
          if (Number.isFinite(sequence)) this.lastSequence = Math.max(this.lastSequence, sequence)
          const snapshot = record.snapshot
          if (snapshot && typeof snapshot === 'object') {
            this.options.onEnvelope({
              type: 'runtime',
              sequence: this.lastSequence,
              serverTime: Date.now(),
              payload: { type: 'snapshot', snapshot: snapshot as LocalRuntimeSnapshot },
            })
          }
          return
        }
        if (record.type !== 'runtime') return
        const envelope = record as unknown as LocalRuntimeEnvelope
        if (!Number.isFinite(envelope.sequence) || envelope.sequence <= 0) return
        if (this.lastSequence > 0 && envelope.sequence > this.lastSequence + 1) {
          this.requestResync()
          return
        }
        if (envelope.sequence <= this.lastSequence) return
        this.lastSequence = envelope.sequence
        this.options.onEnvelope(envelope)
      })

      socket.addEventListener('close', () => {
        if (this.socket === socket) this.socket = null
        if (this.intentionallyClosed) return
        this.scheduleReconnect()
      })

      socket.addEventListener('error', () => {
        if (socket.readyState === WebSocket.OPEN) return
        this.options.onConnection('error')
      })
    } catch {
      this.options.onConnection('error')
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.intentionallyClosed || this.reconnectTimer != null) return
    this.options.onConnection('reconnecting')
    const delay = Math.min(MAX_RECONNECT_DELAY_MS, 400 * 2 ** this.reconnectAttempts)
    this.reconnectAttempts += 1
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket('reconnecting')
    }, delay)
  }
}
