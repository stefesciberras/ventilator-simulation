import { encodeV2WebSocketSecret } from '../session-v2/websocketAuth.mjs'
import { useEffect, useRef, useState } from 'react'
import type { MonitorPatientState } from './types'

type SessionV2ActionLibrary = { version: number; source: string;
  actions: Array<{ id: string; name: string; kind: string; candidateAccess: string; mode: string }> }
type SessionV2Snapshot = {
  session: { epoch: number; revision: number; status: string; mode: string }
  runtimes: Array<{ id: string; state: { monitorProjection?: Partial<MonitorPatientState>; actionRuntime?: { simulationTime: number; activeEffects: Array<{ actionId: string }> }; patient?: Partial<MonitorPatientState> & {
    anaestheticGases?: { fiSevoPercent?: number }
  } } }>
}
type Status = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

/**
 * Manual, isolated LAN preview only. Normal v1 paths do not instantiate this.
 * This panel may update the monitor's patient input from canonical v2 state;
 * it does not claim to synchronize the full physiology, waveform phase or UI.
 */
export function AnaesthSessionV2Preview({
  onPatientSnapshot,
}: {
  onPatientSnapshot: (patient: Partial<MonitorPatientState>) => void
}) {
  const [endpoint, setEndpoint] = useState(() => `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/session-v2/ws`)
  const [sessionId, setSessionId] = useState('ana-preview')
  const [secret, setSecret] = useState('')
  const [status, setStatus] = useState<Status>('disconnected')
  const [message, setMessage] = useState('Experimental Cloudflare v2 preview; v1 remains in use for regular sessions.')
  const [snapshot, setSnapshot] = useState<SessionV2Snapshot | null>(null)
  const [actionLibrary, setActionLibrary] = useState<SessionV2ActionLibrary | null>(null)
  const [selectedAction, setSelectedAction] = useState('propofol')
  const [verifiedRole, setVerifiedRole] = useState<'instructor' | 'candidate' | null>(null)
  const [resetPending, setResetPending] = useState(false)
  const [newHeartRate, setNewHeartRate] = useState(90)
  const [newFiSevo, setNewFiSevo] = useState(2)
  const socketRef = useRef<WebSocket | null>(null)
  const closedRef = useRef(true)
  const attemptRef = useRef(0)
  const sequenceRef = useRef(0)
  const snapshotRef = useRef<SessionV2Snapshot | null>(null)
  const patientCallbackRef = useRef(onPatientSnapshot)
  patientCallbackRef.current = onPatientSnapshot

  useEffect(() => () => {
    closedRef.current = true
    socketRef.current?.close()
  }, [])

  const receiveSnapshot = (next: SessionV2Snapshot) => {
    if (!next?.session || !Array.isArray(next.runtimes)) return
    const previous = snapshotRef.current
    if (previous && next.session.epoch < previous.session.epoch) return
    if (previous && next.session.epoch === previous.session.epoch &&
        next.session.revision < previous.session.revision) return
    snapshotRef.current = next
    setSnapshot(next)
    const runtime = next.runtimes.find(item => item.id === 'main')?.state
    const patient = runtime?.monitorProjection ?? runtime?.patient
    if (patient) patientCallbackRef.current(patient)
  }
  const connect = (targetSessionId = sessionId) => {
    closedRef.current = false
    attemptRef.current += 1
    const currentAttempt = attemptRef.current
    snapshotRef.current = null
    setSnapshot(null)
    setActionLibrary(null)
    setVerifiedRole(null)
    setResetPending(false)
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
          setVerifiedRole(packet.role === 'instructor' || packet.role === 'candidate'
            ? packet.role : null)
          setStatus('connected')
          setMessage('Live Cloudflare preview; changes are persisted before acknowledgement.')
          if (packet.actionLibrary) setActionLibrary(packet.actionLibrary as SessionV2ActionLibrary)
          receiveSnapshot(packet.snapshot)
        } else if (packet.type === 'snapshot') {
          if (packet.actionLibrary) setActionLibrary(packet.actionLibrary as SessionV2ActionLibrary)
          receiveSnapshot(packet.snapshot)
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
    closedRef.current = true
    attemptRef.current += 1
    socketRef.current?.close()
    socketRef.current = null
    snapshotRef.current = null
    setStatus('disconnected')
    setSnapshot(null)
    setActionLibrary(null)
    setVerifiedRole(null)
    setResetPending(false)
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
  return (
    <section style={{ border: '1px solid #8696a8', borderRadius: 8, padding: 12, margin: '8px 16px', maxWidth: 680 }}
      aria-label="Experimental Session Engine v2 preview">
      <strong>Session Engine v2 — experimental Cloudflare preview</strong>
      <p style={{ fontSize: 12, margin: '6px 0' }}>Uses a checkpointed pilot of Anaesth ActionEffects and a limited monitor projection, not the complete physiology engine. Do not use for clinical care or assessed simulation.</p>
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
        <span>HR {patient?.heartRate ?? '—'} bpm</span>
        <span>FiSevo {patient?.anaestheticGases?.fiSevoPercent ?? '—'}%</span>
        <span>Simulated time {actionRuntime?.simulationTime ?? 0}s</span>
        <span>Depth {patient?.anaestheticPhysiology?.depthOfAnaesthesia ?? '—'}</span>
        <span>Spontaneous RR {patient?.respiratory?.spontaneousRespiratoryRate?.toFixed(1) ?? '—'}/min</span>
        <label>HR <input type="number" min={0} max={240} value={newHeartRate}
          onChange={event => setNewHeartRate(Number(event.target.value))} /></label>
        <button type="button" onClick={() => command('patient.parameter.set', { path: 'heartRate', value: newHeartRate })}>Set HR (instructor)</button>
        <label>FiSevo <input type="number" min={0} max={8} step={0.1} value={newFiSevo}
          onChange={event => setNewFiSevo(Number(event.target.value))} /></label>
        <button type="button" onClick={() => command('anaesth.gas.set', { fiSevoPercent: newFiSevo })}>Set FiSevo</button>
        {actionLibrary && <>
          <span>Session catalogue: {actionLibrary.source} (v{actionLibrary.version})</span>
          <label>Action <select aria-label="Session v2 action" value={actionLibrary.actions.some(item => item.id === selectedAction) ? selectedAction : (actionLibrary.actions[0]?.id ?? '')}
            onChange={event => setSelectedAction(event.target.value)}>
            {actionLibrary.actions.map(item => <option key={item.id} value={item.id}>{item.name} · {item.kind}</option>)}
          </select></label>
          <button type="button" onClick={() => command('action.invoke', { actionId: actionLibrary.actions.some(item => item.id === selectedAction) ? selectedAction : actionLibrary.actions[0]?.id })}
            disabled={!actionLibrary.actions.length}>Invoke selected action (experimental)</button>
        </>}
        <button type="button" onClick={() => command('tick', { deltaMs: 1000 })}>Advance 1s (instructor)</button>
        <button type="button" onClick={() => {
          for (let i = 0; i < 10; i++) command('tick', { deltaMs: 1000 })
        }}>Advance 10s (instructor)</button>
        <span>Active effects {actionRuntime?.activeEffects?.length ?? 0}</span>
        {verifiedRole === 'instructor' && <>
          <button type="button" onClick={resetPatient} disabled={resetPending}>
            {resetPending ? 'Resetting…' : 'Reset Patient'}
          </button>
          <button type="button" onClick={newSession} disabled={resetPending}>New Session</button>
        </>
      </div>}
    </section>
  )
}
