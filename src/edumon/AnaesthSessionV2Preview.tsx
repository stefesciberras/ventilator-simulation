import { useEffect, useRef, useState } from 'react'
import type { MonitorPatientState } from './types'

type SessionV2Snapshot = {
  session: { epoch: number; revision: number; status: string; mode: string }
  runtimes: Array<{ id: string; state: { patient?: Partial<MonitorPatientState> & {
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
    const patient = next.runtimes.find(item => item.id === 'main')?.state.patient
    if (patient) patientCallbackRef.current(patient)
  }
  const connect = () => {
    closedRef.current = false
    attemptRef.current += 1
    const currentAttempt = attemptRef.current
    snapshotRef.current = null
    setSnapshot(null)
    setStatus('connecting')
    setMessage('Connecting to experimental Cloudflare session authority...')
    const url = endpoint.trim()
    if (!/^wss?:\/\//.test(url) || !/^[a-zA-Z0-9_-]{3,80}$/.test(sessionId)) {
      setStatus('error')
      setMessage('Invalid LAN endpoint or session ID')
      return
    }
    let tries = 0
    const open = () => {
      if (closedRef.current || currentAttempt !== attemptRef.current) return
      const socket = new WebSocket(`${url}?sessionId=${encodeURIComponent(sessionId)}`, [`v2auth.${secret}`])
      socketRef.current = socket
      socket.onopen = () => {
        setMessage('Connected; awaiting canonical session snapshot...')
      }
      socket.onmessage = event => {
        let packet: any
        try { packet = JSON.parse(String(event.data)) } catch { return }
        if (packet.protocol !== 2) return
        if (packet.type === 'welcome') {
          tries = 0
          setStatus('connected')
          setMessage('Live Cloudflare preview; changes are persisted before acknowledgement.')
          receiveSnapshot(packet.snapshot)
        } else if (packet.type === 'snapshot') {
          receiveSnapshot(packet.snapshot)
        } else if (packet.type === 'receipt') {
          if (!packet.receipt?.accepted) setMessage(`Command rejected: ${packet.receipt?.reason ?? 'unknown'}`)
        } else if (packet.type === 'error') {
          setMessage(`Cloud authority: ${packet.reason}`)
          if (['unauthenticated', 'not-session-member', 'invalid-session'].includes(packet.reason)) {
            closedRef.current = true
            setStatus('error')
            socket.close()
          }
        }
      }
      socket.onerror = () => { /* reconnect on close */ }
      socket.onclose = () => {
        if (closedRef.current || currentAttempt !== attemptRef.current) return
        setStatus('reconnecting')
        setMessage('Connection lost; retrieving the canonical Durable Object snapshot...')
        const delay = Math.min(5000, 500 * (2 ** Math.min(tries++, 4)))
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
  }
  const command = (type: string, payload: object) => {
    const socket = socketRef.current
    const epoch = snapshotRef.current?.session.epoch
    if (socket?.readyState !== WebSocket.OPEN || !epoch) return
    socket.send(JSON.stringify({ protocol: 2, type: 'command',
      requestId: `cmd-${++sequenceRef.current}`,
      command: { id: crypto.randomUUID(), epoch, runtimeId: 'main', type, payload },
    }))
  }
  const patient = snapshot?.runtimes.find(item => item.id === 'main')?.state.patient
  return (
    <section style={{ border: '1px solid #8696a8', borderRadius: 8, padding: 12, margin: '8px 16px', maxWidth: 680 }}
      aria-label="Experimental Session Engine v2 preview">
      <strong>Session Engine v2 — experimental Cloudflare preview</strong>
      <p style={{ fontSize: 12, margin: '6px 0' }}>Uses demo Anaesth state, not the full physiology engine. Never use for a real clinical session.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <label>Cloudflare WebSocket <input aria-label="v2 WebSocket endpoint" value={endpoint}
          onChange={event => setEndpoint(event.target.value)} disabled={status === 'connected'} /></label>
        <label>Session <input aria-label="v2 session ID" value={sessionId}
          onChange={event => setSessionId(event.target.value)} disabled={status === 'connected'} /></label>
        <label>Experimental access secret <input type="password" autoComplete="off" aria-label="v2 test access secret"
          value={secret} onChange={event => setSecret(event.target.value)} disabled={status === 'connected'} /></label>
        {status === 'connected' || status === 'connecting' || status === 'reconnecting'
          ? <button type="button" onClick={disconnect}>Disconnect</button>
          : <button type="button" onClick={connect} disabled={!secret}>Connect</button>}
      </div>
      <p role="status" style={{ fontSize: 12 }}>{status}: {message}</p>
      {snapshot && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <span>Epoch {snapshot.session.epoch} · Rev {snapshot.session.revision}</span>
        <span>HR {patient?.heartRate ?? '—'} bpm</span>
        <span>FiSevo {patient?.anaestheticGases?.fiSevoPercent ?? '—'}%</span>
        <label>HR <input type="number" min={0} max={240} value={newHeartRate}
          onChange={event => setNewHeartRate(Number(event.target.value))} /></label>
        <button type="button" onClick={() => command('patient.parameter.set', { path: 'heartRate', value: newHeartRate })}>Set HR (instructor)</button>
        <label>FiSevo <input type="number" min={0} max={8} step={0.1} value={newFiSevo}
          onChange={event => setNewFiSevo(Number(event.target.value))} /></label>
        <button type="button" onClick={() => command('anaesth.gas.set', { fiSevoPercent: newFiSevo })}>Set FiSevo</button>
      </div>}
    </section>
  )
}
