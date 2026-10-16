import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type {
  RecoverableTeachingCandidate,
  RecoverableTeachingInstructor,
  SharedTeachingConnection,
  SharedTeachingMemberRow,
  SharedTeachingRole,
  SharedTeachingSessionHostHooks,
  SharedTeachingSessionRepository,
  SharedTeachingSessionRow,
  SharedSessionRowSource,
} from './types'

interface SharedTeachingSessionOptions<TSession extends SharedTeachingSessionRow, TMember extends SharedTeachingMemberRow, TCreateInput, TMemberTelemetry> {
  storageNamespace: string
  repository: SharedTeachingSessionRepository<TSession, TMember, TCreateInput, TMemberTelemetry>
  host?: SharedTeachingSessionHostHooks<TSession, TCreateInput>
  getMemberTelemetry: () => TMemberTelemetry
  candidateHeartbeatMs?: number
  instructorHeartbeatMs?: number
  candidateRefreshMs?: number
}

function candidateRecoveryKey(namespace: string) { return `${namespace}.candidate-session-recovery` }
function instructorSessionKey(namespace: string) { return `${namespace}.instructor-session-id` }
function instructorClientKey(namespace: string) { return `${namespace}.instructor-client-id` }

function readCandidateRecovery(namespace: string): RecoverableTeachingCandidate | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(candidateRecoveryKey(namespace))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<RecoverableTeachingCandidate>
    if (typeof parsed.sessionKey !== 'string' || !parsed.sessionKey || typeof parsed.expiresAt !== 'string') return null
    return { sessionKey: parsed.sessionKey, displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '', expiresAt: parsed.expiresAt }
  } catch { return null }
}

function candidateRecoveryExpired(recovery: RecoverableTeachingCandidate) {
  const expiry = Date.parse(recovery.expiresAt)
  return Number.isFinite(expiry) && expiry <= Date.now()
}

export function useSharedTeachingSession<TSession extends SharedTeachingSessionRow, TMember extends SharedTeachingMemberRow, TCreateInput, TMemberTelemetry>({
  storageNamespace,
  repository,
  host,
  getMemberTelemetry,
  candidateHeartbeatMs = 10000,
  instructorHeartbeatMs = 10000,
  candidateRefreshMs = 1000,
}: SharedTeachingSessionOptions<TSession, TMember, TCreateInput, TMemberTelemetry>) {
  const [role, setRole] = useState<SharedTeachingRole>('standalone')
  const [connection, setConnection] = useState<SharedTeachingConnection>('idle')
  const [session, setSession] = useState<TSession | null>(null)
  const [members, setMembers] = useState<TMember[]>([])
  const [error, setError] = useState<string | null>(null)
  const [recoverableInstructor, setRecoverableInstructor] = useState<RecoverableTeachingInstructor | null>(null)
  const [recoverableCandidate, setRecoverableCandidate] = useState<RecoverableTeachingCandidate | null>(null)

  const roleRef = useRef<SharedTeachingRole>('standalone')
  const sessionRef = useRef<TSession | null>(null)
  const sessionChannelRef = useRef<RealtimeChannel | null>(null)
  const memberChannelRef = useRef<RealtimeChannel | null>(null)
  const instructorHeartbeatRef = useRef<number | null>(null)
  const candidateHeartbeatRef = useRef<number | null>(null)
  const telemetryRef = useRef(getMemberTelemetry)
  const hostRef = useRef(host)

  useEffect(() => { roleRef.current = role }, [role])
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { telemetryRef.current = getMemberTelemetry }, [getMemberTelemetry])
  useEffect(() => { hostRef.current = host }, [host])

  const notifyHost = (row: TSession, nextRole: Exclude<SharedTeachingRole, 'standalone'>, source: SharedSessionRowSource, force = false) => {
    hostRef.current?.onSessionRow?.(row, nextRole, source, force)
  }

  const storeSession = (row: TSession | null, source: SharedSessionRowSource = 'host-update', force = false) => {
    sessionRef.current = row
    setSession(row)
    if (row && roleRef.current !== 'standalone') notifyHost(row, roleRef.current, source, force)
  }

  const clearChannels = async () => {
    await repository.closeChannel(sessionChannelRef.current)
    await repository.closeChannel(memberChannelRef.current)
    sessionChannelRef.current = null
    memberChannelRef.current = null
  }

  const refreshMembers = async (sessionId: string) => {
    try {
      const next = await repository.fetchMembers(sessionId)
      if (sessionRef.current?.id === sessionId || roleRef.current === 'instructor') setMembers(next)
    } catch { /* presence can recover on the next event */ }
  }

  const attachMembers = async (sessionId: string) => {
    await repository.closeChannel(memberChannelRef.current)
    await refreshMembers(sessionId)
    memberChannelRef.current = repository.subscribeMembers(sessionId, () => void refreshMembers(sessionId))
  }

  const terminateLocally = async (message: string | null, clearCandidate = false) => {
    const previousRole = roleRef.current
    if (instructorHeartbeatRef.current != null) window.clearInterval(instructorHeartbeatRef.current)
    if (candidateHeartbeatRef.current != null) window.clearInterval(candidateHeartbeatRef.current)
    instructorHeartbeatRef.current = null
    candidateHeartbeatRef.current = null
    await clearChannels()
    if (clearCandidate) {
      try { window.localStorage.removeItem(candidateRecoveryKey(storageNamespace)) } catch { /* optional */ }
      setRecoverableCandidate(null)
    }
    roleRef.current = 'standalone'
    setRole('standalone')
    sessionRef.current = null
    setSession(null)
    setMembers([])
    setConnection('idle')
    setError(message)
    hostRef.current?.onSessionCleared?.(previousRole)
  }

  const attachSession = async (sessionId: string) => {
    await repository.closeChannel(sessionChannelRef.current)
    sessionChannelRef.current = repository.subscribeSession(
      sessionId,
      (next) => {
        if (next.status === 'ended') {
          void terminateLocally('The instructor ended this teaching session.', roleRef.current === 'candidate')
          return
        }
        storeSession(next, 'subscription')
      },
      async (status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('connected')
          try {
            const fresh = await repository.fetchSession(sessionId)
            if (roleRef.current !== 'standalone') storeSession(fresh, 'refresh')
          } catch { /* stream remains active */ }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnection('reconnecting')
        } else if (status === 'CLOSED' && roleRef.current !== 'standalone') {
          setConnection('reconnecting')
        }
      },
    )
  }

  const attachInstructorLease = (sessionId: string, clientId: string) => {
    if (instructorHeartbeatRef.current != null) window.clearInterval(instructorHeartbeatRef.current)
    const heartbeat = () => {
      void repository.touchInstructorSession(sessionId, clientId).catch((cause) => {
        const message = cause instanceof Error ? cause.message : 'Instructor control lease was lost.'
        if (/expired/i.test(message)) {
          try {
            window.sessionStorage.removeItem(instructorSessionKey(storageNamespace))
            window.sessionStorage.removeItem(instructorClientKey(storageNamespace))
          } catch { /* optional */ }
          void terminateLocally('This teaching session expired 2 hours after it was created.')
          return
        }
        setConnection('error')
        setError(message)
      })
    }
    heartbeat()
    instructorHeartbeatRef.current = window.setInterval(heartbeat, instructorHeartbeatMs)
  }

  const attachCandidateHeartbeat = (sessionId: string) => {
    if (candidateHeartbeatRef.current != null) window.clearInterval(candidateHeartbeatRef.current)
    const heartbeat = () => {
      void repository.touchMember(sessionId, telemetryRef.current()).catch((cause) => {
        const message = cause instanceof Error ? cause.message : ''
        if (/expired|ended/i.test(message)) void terminateLocally('This teaching session expired 2 hours after it was created.', true)
      })
    }
    heartbeat()
    candidateHeartbeatRef.current = window.setInterval(heartbeat, candidateHeartbeatMs)
  }

  const startInstructor = async (input: TCreateInput) => {
    setConnection('connecting')
    setError(null)
    try {
      const created = await repository.createSession(input)
      const clientId = crypto.randomUUID()
      await repository.claimInstructorSession(created.sessionId, clientId)
      let row = await repository.fetchSession(created.sessionId)
      const prepared = await hostRef.current?.prepareInstructorSession?.(row, input, 'start')
      if (prepared) row = prepared
      roleRef.current = 'instructor'
      setRole('instructor')
      try {
        window.sessionStorage.setItem(instructorSessionKey(storageNamespace), row.id)
        window.sessionStorage.setItem(instructorClientKey(storageNamespace), clientId)
      } catch { /* optional */ }
      setRecoverableInstructor(null)
      storeSession(row, 'start', true)
      await attachSession(row.id)
      await attachMembers(row.id)
      attachInstructorLease(row.id, clientId)
      setConnection('connected')
      return row
    } catch (cause) {
      setConnection('error')
      setError(cause instanceof Error ? cause.message : 'Unable to create instructor session.')
      roleRef.current = 'standalone'
      setRole('standalone')
      return null
    }
  }

  const resumeInstructor = async (sessionId?: string) => {
    setConnection('connecting')
    setError(null)
    try {
      await repository.ensureIdentity()
      const found = sessionId ? { sessionId, sessionKey: '' } : await repository.findActiveInstructorSession()
      if (!found) {
        setRecoverableInstructor(null)
        setConnection('idle')
        return null
      }
      const storedClient = typeof window === 'undefined' ? null : window.sessionStorage.getItem(instructorClientKey(storageNamespace))
      const clientId = storedClient || crypto.randomUUID()
      await repository.claimInstructorSession(found.sessionId, clientId)
      let row = await repository.fetchSession(found.sessionId)
      const prepared = await hostRef.current?.prepareInstructorSession?.(row, null, 'resume')
      if (prepared) row = prepared
      roleRef.current = 'instructor'
      setRole('instructor')
      try {
        window.sessionStorage.setItem(instructorSessionKey(storageNamespace), row.id)
        window.sessionStorage.setItem(instructorClientKey(storageNamespace), clientId)
      } catch { /* optional */ }
      setRecoverableInstructor(null)
      storeSession(row, 'resume', true)
      await attachSession(row.id)
      await attachMembers(row.id)
      attachInstructorLease(row.id, clientId)
      setConnection('connected')
      return row
    } catch (cause) {
      setConnection('error')
      setError(cause instanceof Error ? cause.message : 'Unable to rejoin instructor session.')
      return null
    }
  }

  const joinCandidate = async (sessionKey: string, displayName: string, recoveryAttempt = false) => {
    setConnection('connecting')
    setError(null)
    try {
      const joined = await repository.joinSession(sessionKey, displayName)
      const row = await repository.fetchSession(joined.sessionId)
      const recovery: RecoverableTeachingCandidate = { sessionKey: row.session_key, displayName: displayName.trim(), expiresAt: row.expires_at }
      try { window.localStorage.setItem(candidateRecoveryKey(storageNamespace), JSON.stringify(recovery)) } catch { /* optional */ }
      setRecoverableCandidate(recovery)
      roleRef.current = 'candidate'
      setRole('candidate')
      storeSession(row, 'join', true)
      await repository.touchMember(row.id, telemetryRef.current())
      await attachSession(row.id)
      attachCandidateHeartbeat(row.id)
      setConnection('connected')
      return row
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to join teaching session.'
      if (recoveryAttempt && /expired|not found|ended/i.test(message)) {
        try { window.localStorage.removeItem(candidateRecoveryKey(storageNamespace)) } catch { /* optional */ }
        setRecoverableCandidate(null)
      }
      setConnection('error')
      setError(message)
      roleRef.current = 'standalone'
      setRole('standalone')
      return null
    }
  }

  const resumeCandidate = async () => {
    const recovery = readCandidateRecovery(storageNamespace)
    if (!recovery || candidateRecoveryExpired(recovery)) {
      try { window.localStorage.removeItem(candidateRecoveryKey(storageNamespace)) } catch { /* optional */ }
      setRecoverableCandidate(null)
      return null
    }
    return joinCandidate(recovery.sessionKey, recovery.displayName, true)
  }

  const leaveSession = async () => terminateLocally(null, roleRef.current === 'candidate')

  const endInstructorSession = async () => {
    const current = sessionRef.current
    if (roleRef.current === 'instructor' && current) {
      try { await repository.updateSession(current.id, { status: 'ended' } as Partial<TSession>) } catch { /* local leave still wins */ }
    }
    try {
      window.sessionStorage.removeItem(instructorSessionKey(storageNamespace))
      window.sessionStorage.removeItem(instructorClientKey(storageNamespace))
    } catch { /* optional */ }
    await terminateLocally(null)
  }

  const updateSession = async (patch: Partial<TSession>, source: SharedSessionRowSource = 'host-update') => {
    const current = sessionRef.current
    if (!current) return null
    const optimistic = { ...current, ...patch, updated_at: new Date().toISOString() } as TSession
    storeSession(optimistic, source)
    try {
      const next = await repository.updateSession(current.id, patch)
      storeSession(next, source)
      setError(null)
      return next
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update teaching session.')
      return null
    }
  }

  const touchMemberNow = async () => {
    const current = sessionRef.current
    if (roleRef.current !== 'candidate' || !current) return
    await repository.touchMember(current.id, telemetryRef.current())
  }

  const replaceSession = (row: TSession, source: SharedSessionRowSource = 'runtime', force = false) => storeSession(row, source, force)
  const terminateRemote = (message: string) => terminateLocally(message, roleRef.current === 'candidate')
  const setExternalConnection = (next: SharedTeachingConnection) => setConnection(next)
  const setExternalError = (message: string | null) => setError(message)

  useEffect(() => {
    const recovery = readCandidateRecovery(storageNamespace)
    if (recovery && !candidateRecoveryExpired(recovery)) setRecoverableCandidate(recovery)
    else if (recovery) {
      try { window.localStorage.removeItem(candidateRecoveryKey(storageNamespace)) } catch { /* optional */ }
    }

    const storedSessionId = typeof window === 'undefined' ? null : window.sessionStorage.getItem(instructorSessionKey(storageNamespace))
    if (storedSessionId) {
      void resumeInstructor(storedSessionId)
      return
    }
    void (async () => {
      try {
        const found = await repository.findActiveInstructorSession()
        if (found && roleRef.current === 'standalone') setRecoverableInstructor(found)
      } catch { /* standalone is normal */ }
    })()
  }, [])

  useEffect(() => {
    if (role !== 'candidate' || !session?.id || candidateRefreshMs <= 0) return
    let active = true
    const sessionId = session.id
    const refresh = async () => {
      try {
        const fresh = await repository.fetchSession(sessionId)
        if (!active || roleRef.current !== 'candidate') return
        if (fresh.status === 'ended') {
          await terminateLocally('The instructor ended this teaching session.', true)
          return
        }
        storeSession(fresh, 'refresh')
      } catch {
        // Realtime and the next durable refresh recover independently.
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), candidateRefreshMs)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [role, session?.id, candidateRefreshMs])

  useEffect(() => {
    if (!recoverableCandidate) return
    const expiry = Date.parse(recoverableCandidate.expiresAt)
    if (!Number.isFinite(expiry)) return
    const remaining = expiry - Date.now()
    if (remaining <= 0) {
      try { window.localStorage.removeItem(candidateRecoveryKey(storageNamespace)) } catch { /* optional */ }
      setRecoverableCandidate(null)
      return
    }
    const timer = window.setTimeout(() => {
      try { window.localStorage.removeItem(candidateRecoveryKey(storageNamespace)) } catch { /* optional */ }
      setRecoverableCandidate(null)
    }, remaining)
    return () => window.clearTimeout(timer)
  }, [recoverableCandidate?.expiresAt])

  useEffect(() => () => {
    if (instructorHeartbeatRef.current != null) window.clearInterval(instructorHeartbeatRef.current)
    if (candidateHeartbeatRef.current != null) window.clearInterval(candidateHeartbeatRef.current)
    void repository.closeChannel(sessionChannelRef.current)
    void repository.closeChannel(memberChannelRef.current)
  }, [])

  return {
    role,
    connection,
    session,
    members,
    error,
    recoverableInstructor,
    recoverableCandidate,
    startInstructor,
    resumeInstructor,
    joinCandidate,
    resumeCandidate,
    leaveSession,
    endInstructorSession,
    updateSession,
    replaceSession,
    terminateRemote,
    touchMemberNow,
    setExternalConnection,
    setExternalError,
  }
}
