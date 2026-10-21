import { useEffect, useRef, useState } from 'react'
import type {
  RecoverableTeachingCandidate,
  RecoverableTeachingInstructor,
  SharedTeachingConnection,
  SharedTeachingMemberRow,
  SharedTeachingRole,
  SharedTeachingSessionRow,
} from './types'

function ConnectionBadge({ connection }: { connection: SharedTeachingConnection }) {
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

interface SharedSessionLauncherProps {
  instructorAuthenticated: boolean
  connection: SharedTeachingConnection
  error?: string | null
  recoverableInstructor?: RecoverableTeachingInstructor | null
  recoverableCandidate?: RecoverableTeachingCandidate | null
  onStartInstructor: () => void | Promise<unknown>
  onResumeInstructor?: (sessionId?: string) => void | Promise<unknown>
  onJoinCandidate: (sessionKey: string, displayName: string) => void | Promise<unknown>
  onResumeCandidate?: () => void | Promise<unknown>
  onSelfDirected?: (assignmentCode: string) => void
  instructorSignInNote?: string
}

export function SharedSessionLauncher({
  instructorAuthenticated,
  connection,
  error,
  recoverableInstructor,
  recoverableCandidate,
  onStartInstructor,
  onResumeInstructor,
  onJoinCandidate,
  onResumeCandidate,
  onSelfDirected,
  instructorSignInNote = 'Sign in to an instructor account to start or resume an instructor teaching session. Joining as a candidate does not require an account.',
}: SharedSessionLauncherProps) {
  const [mode, setMode] = useState<'choose' | 'candidate' | 'self-directed'>('choose')
  const [sessionKey, setSessionKey] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [assignmentCode, setAssignmentCode] = useState('')
  const candidateNameInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const rawKey = new URLSearchParams(window.location.search).get('session') ?? ''
    const deepLinkKey = rawKey.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    if (deepLinkKey.length !== 6) return
    setSessionKey(deepLinkKey)
    setMode('candidate')
    window.setTimeout(() => {
      candidateNameInputRef.current?.focus()
      candidateNameInputRef.current?.select()
    }, 80)
  }, [])

  useEffect(() => {
    if (!recoverableCandidate) return
    setSessionKey(recoverableCandidate.sessionKey)
    setDisplayName(recoverableCandidate.displayName)
  }, [recoverableCandidate])

  const launchSelfDirected = (code: string) => {
    if (onSelfDirected) {
      onSelfDirected(code)
      return
    }
    const url = new URL(window.location.href)
    url.search = ''
    url.hash = ''
    url.searchParams.set('assignment', code)
    window.location.assign(url.toString())
  }

  if (mode === 'candidate') {
    return (
      <form className="candidate-join-form" onSubmit={(event) => {
        event.preventDefault()
        const key = sessionKey.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
        if (key.length !== 6 || !displayName.trim()) return
        void onJoinCandidate(key, displayName.trim())
      }}>
        <label>
          <span>Session key</span>
          <input value={sessionKey} onChange={(event) => setSessionKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="ABC123" autoCapitalize="characters" autoComplete="off" maxLength={6} required />
        </label>
        <label>
          <span>Your name</span>
          <input ref={candidateNameInputRef} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Candidate name" autoComplete="name" required />
        </label>
        <div className="session-launch-actions">
          <button type="submit" className="session-primary-button" disabled={connection === 'connecting' || sessionKey.length < 6 || !displayName.trim()}>Join session</button>
          <button type="button" className="session-secondary-button" onClick={() => setMode('choose')}>Cancel</button>
        </div>
        {error && <div className="session-error">{error}</div>}
      </form>
    )
  }

  if (mode === 'self-directed') {
    return (
      <form className="candidate-join-form" onSubmit={(event) => {
        event.preventDefault()
        const code = assignmentCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
        if (code.length !== 8) return
        launchSelfDirected(code)
      }}>
        <label>
          <span>Self-directed session code</span>
          <input value={assignmentCode} onChange={(event) => setAssignmentCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} placeholder="A1B2C3D4" autoCapitalize="characters" autoComplete="off" maxLength={8} required />
        </label>
        <p className="session-start-note">This scenario runs independently on your device. No instructor needs to be online.</p>
        <div className="session-launch-actions">
          <button type="submit" className="session-primary-button" disabled={assignmentCode.length < 8}>Start scenario</button>
          <button type="button" className="session-secondary-button" onClick={() => setMode('choose')}>Cancel</button>
        </div>
      </form>
    )
  }

  return (
    <>
      <div className="session-launch-actions">
        <button type="button" className="session-primary-button" disabled={!instructorAuthenticated || connection === 'connecting'} title={!instructorAuthenticated ? 'Sign in to an instructor account first' : undefined} onClick={() => void onStartInstructor()}>Start instructor session</button>
        <button type="button" className="session-secondary-button" onClick={() => setMode('candidate')}>Join as candidate</button>
        <button type="button" className="session-secondary-button" onClick={() => setMode('self-directed')}>Run self-directed scenario</button>
        {recoverableCandidate && onResumeCandidate && (
          <button type="button" className="session-secondary-button" disabled={connection === 'connecting'} onClick={() => void onResumeCandidate()}>Rejoin candidate {recoverableCandidate.sessionKey}</button>
        )}
        {recoverableInstructor && onResumeInstructor && (
          <button type="button" className="session-secondary-button" disabled={!instructorAuthenticated || connection === 'connecting'} title={!instructorAuthenticated ? 'Sign in to an instructor account first' : undefined} onClick={() => void onResumeInstructor(recoverableInstructor.sessionId)}>Rejoin instructor {recoverableInstructor.sessionKey}</button>
        )}
      </div>
      {!instructorAuthenticated && <div className="session-instructor-signin-note">{instructorSignInNote}</div>}
      {error && <div className="session-error">{error}</div>}
    </>
  )
}

interface SharedBasicSessionPanelProps extends SharedSessionLauncherProps {
  role: SharedTeachingRole
  session: SharedTeachingSessionRow | null
  members?: SharedTeachingMemberRow[]
  onLeaveSession: () => void | Promise<unknown>
  onEndInstructorSession: () => void | Promise<unknown>
  title?: string
}

/** Compact product-neutral session surface used by simulators that do not need
 * EDUVENT's advanced instructor policy dashboard. */
export function SharedBasicSessionPanel({
  role,
  session,
  members = [],
  connection,
  onLeaveSession,
  onEndInstructorSession,
  title = 'Session mode',
  ...launcherProps
}: SharedBasicSessionPanelProps) {
  const candidateCount = members.filter((member) => member.role === 'candidate').length

  return (
    <section className="session-panel standalone-session-panel">
      <div className="session-panel-heading">
        <div><span className="session-kicker">Teaching</span><h2>{title}</h2></div>
        <span className="session-role-pill">{role === 'standalone' ? 'Standalone' : role === 'instructor' ? 'Instructor' : 'Candidate'}</span>
      </div>

      {role === 'standalone' ? (
        <SharedSessionLauncher connection={connection} {...launcherProps} />
      ) : (
        <div className="session-active-summary">
          <div className="session-status-row">
            <ConnectionBadge connection={connection} />
            {session?.session_key && <span className="session-key-display"><small>SESSION</small><strong>{session.session_key}</strong></span>}
          </div>
          {role === 'instructor' && <p>{candidateCount} candidate{candidateCount === 1 ? '' : 's'} joined.</p>}
          {role === 'candidate' && <p>Connected to the instructor's teaching session.</p>}
          <div className="session-launch-actions">
            {role === 'instructor'
              ? <button type="button" className="session-secondary-button" onClick={() => void onEndInstructorSession()}>End session</button>
              : <button type="button" className="session-secondary-button" onClick={() => void onLeaveSession()}>Leave session</button>}
          </div>
        </div>
      )}
    </section>
  )
}
