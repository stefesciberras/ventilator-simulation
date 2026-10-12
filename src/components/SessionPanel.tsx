import { useState } from 'react'
import type { SessionConnection, SessionRole } from '../session/useTeachingSession'
import type { TeachingSessionRow } from '../session/supabase'

interface SessionPanelProps {
  role: SessionRole
  connection: SessionConnection
  session: TeachingSessionRow | null
  error: string | null
  onStartInstructor: () => Promise<void>
  onJoinCandidate: (sessionKey: string, displayName: string) => Promise<void>
  onLeaveSession: () => Promise<void>
  onEndInstructorSession: () => Promise<void>
  onUpdatePolicy: (patch: {
    syncPatient?: boolean
    syncVentilator?: boolean
    candidateCanEditPatient?: boolean
    candidateCanEditVentilator?: boolean
  }) => Promise<void>
  onBroadcastNow: () => Promise<void>
}

function ConnectionBadge({ connection }: { connection: SessionConnection }) {
  const label = connection === 'connected'
    ? 'Connected'
    : connection === 'connecting'
      ? 'Connecting…'
      : connection === 'reconnecting'
        ? 'Reconnecting…'
        : connection === 'error'
          ? 'Connection error'
          : 'Offline'
  return <span className={`session-connection ${connection}`}><span className="session-connection-dot" />{label}</span>
}

export function SessionPanel({
  role,
  connection,
  session,
  error,
  onStartInstructor,
  onJoinCandidate,
  onLeaveSession,
  onEndInstructorSession,
  onUpdatePolicy,
  onBroadcastNow,
}: SessionPanelProps) {
  const [joinMode, setJoinMode] = useState(false)
  const [sessionKey, setSessionKey] = useState('')
  const [displayName, setDisplayName] = useState('')

  if (role === 'standalone') {
    return (
      <section className="session-panel standalone-session-panel">
        <div className="session-panel-heading">
          <div><span className="session-kicker">Teaching</span><h2>Session mode</h2></div>
          <span className="session-role-pill">Standalone</span>
        </div>
        {!joinMode ? (
          <div className="session-launch-actions">
            <button type="button" className="session-primary-button" disabled={connection === 'connecting'} onClick={() => void onStartInstructor()}>
              Start instructor session
            </button>
            <button type="button" className="session-secondary-button" onClick={() => setJoinMode(true)}>Join as candidate</button>
          </div>
        ) : (
          <form className="candidate-join-form" onSubmit={(event) => {
            event.preventDefault()
            if (!sessionKey.trim()) return
            void onJoinCandidate(sessionKey, displayName)
          }}>
            <label>
              <span>Session key</span>
              <input
                value={sessionKey}
                onChange={(event) => setSessionKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="K7D4Q9"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={6}
                required
              />
            </label>
            <label>
              <span>Name <small>(optional)</small></span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} placeholder="Candidate" />
            </label>
            <div className="session-launch-actions">
              <button type="submit" className="session-primary-button" disabled={connection === 'connecting' || sessionKey.length < 6}>Join session</button>
              <button type="button" className="session-secondary-button" onClick={() => setJoinMode(false)}>Cancel</button>
            </div>
          </form>
        )}
        {connection === 'connecting' && <ConnectionBadge connection={connection} />}
        {error && <div className="session-error" role="alert">{error}</div>}
      </section>
    )
  }

  if (role === 'instructor') {
    return (
      <section className="session-panel instructor-session-panel">
        <div className="session-panel-heading">
          <div><span className="session-kicker">Teaching</span><h2>Instructor mode</h2></div>
          <ConnectionBadge connection={connection} />
        </div>
        <div className="session-key-card">
          <span>Candidate session key</span>
          <strong>{session?.session_key ?? '———'}</strong>
          <small>Share this key with all candidates in this session.</small>
        </div>

        <div className="session-domain-grid">
          <div className={`session-domain-card ${session?.sync_patient ? 'shared' : ''}`}>
            <div className="session-domain-title"><strong>Patient</strong><span>{session?.sync_patient ? 'Shared' : 'Local'}</span></div>
            <label className="session-switch-row">
              <span>Share patient settings</span>
              <input type="checkbox" checked={Boolean(session?.sync_patient)} onChange={(event) => void onUpdatePolicy({ syncPatient: event.target.checked })} />
            </label>
            <label className="session-switch-row">
              <span>Candidate may change</span>
              <input type="checkbox" checked={Boolean(session?.candidate_can_edit_patient)} disabled={!session?.sync_patient} onChange={(event) => void onUpdatePolicy({ candidateCanEditPatient: event.target.checked })} />
            </label>
          </div>

          <div className={`session-domain-card ${session?.sync_ventilator ? 'shared' : ''}`}>
            <div className="session-domain-title"><strong>Ventilator</strong><span>{session?.sync_ventilator ? 'Shared' : 'Local'}</span></div>
            <label className="session-switch-row">
              <span>Share ventilator settings</span>
              <input type="checkbox" checked={Boolean(session?.sync_ventilator)} onChange={(event) => void onUpdatePolicy({ syncVentilator: event.target.checked })} />
            </label>
            <label className="session-switch-row">
              <span>Candidate may change</span>
              <input type="checkbox" checked={Boolean(session?.candidate_can_edit_ventilator)} disabled={!session?.sync_ventilator} onChange={(event) => void onUpdatePolicy({ candidateCanEditVentilator: event.target.checked })} />
            </label>
          </div>
        </div>

        <div className="session-action-row">
          <button type="button" className="session-secondary-button" onClick={() => void onBroadcastNow()}>Push current settings</button>
          <button type="button" className="session-danger-button" onClick={() => void onEndInstructorSession()}>End session</button>
        </div>
        {error && <div className="session-error" role="alert">{error}</div>}
      </section>
    )
  }

  return (
    <section className="session-panel candidate-session-panel">
      <div className="session-panel-heading">
        <div><span className="session-kicker">Teaching</span><h2>Candidate session</h2></div>
        <ConnectionBadge connection={connection} />
      </div>
      <div className="candidate-session-summary">
        <span>Session <strong>{session?.session_key ?? '———'}</strong></span>
        <div className="candidate-control-status">
          <span className={session?.sync_patient && !session?.candidate_can_edit_patient ? 'locked' : 'available'}>
            Patient: {session?.sync_patient ? (session.candidate_can_edit_patient ? 'shared / editable' : 'instructor controlled') : 'candidate local'}
          </span>
          <span className={session?.sync_ventilator && !session?.candidate_can_edit_ventilator ? 'locked' : 'available'}>
            Ventilator: {session?.sync_ventilator ? (session.candidate_can_edit_ventilator ? 'shared / editable' : 'instructor controlled') : 'candidate local'}
          </span>
        </div>
      </div>
      {connection === 'reconnecting' && <div className="session-warning">Connection lost. Simulation continues with the last received settings while EDUVENT reconnects.</div>}
      {error && <div className="session-error" role="alert">{error}</div>}
      <button type="button" className="session-secondary-button" onClick={() => void onLeaveSession()}>Leave session</button>
    </section>
  )
}
