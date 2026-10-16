from pathlib import Path

core = Path('src/teaching/session/useSharedTeachingSession.ts')
s = core.read_text()
s = s.replace('''  candidateHeartbeatMs?: number
  instructorHeartbeatMs?: number
}''','''  candidateHeartbeatMs?: number
  instructorHeartbeatMs?: number
  candidateRefreshMs?: number
}''',1)
s = s.replace('''  candidateHeartbeatMs = 10000,
  instructorHeartbeatMs = 10000,
}:''','''  candidateHeartbeatMs = 10000,
  instructorHeartbeatMs = 10000,
  candidateRefreshMs = 1000,
}:''',1)
marker = '''  useEffect(() => {
    if (!recoverableCandidate) return
'''
assert marker in s
refresh = '''  useEffect(() => {
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

'''
s = s.replace(marker, refresh + marker, 1)
core.write_text(s)

host = Path('src/session/useTeachingSession.ts')
s = host.read_text()
s = s.replace("import { useSharedTeachingSession, type SharedTeachingRole, type RecoverableTeachingCandidate } from '../teaching/session'", "import { useSharedTeachingSession, type SharedTeachingRole, type RecoverableTeachingCandidate, type SharedTeachingRuntimeTransport } from '../teaching/session'", 1)
s = s.replace('''  type LocalRuntimeConnection,
  type LocalRuntimeEnvelope,
  type LocalRuntimeSnapshot,
} from './localRuntimeTransport' ''','''  type LocalRuntimeConnection,
  type LocalRuntimeEnvelope,
  type LocalRuntimePayload,
  type LocalRuntimeSnapshot,
} from './localRuntimeTransport' ''',1)
if 'type LocalRuntimePayload,' not in s:
    s = s.replace('''  type LocalRuntimeEnvelope,
  type LocalRuntimeSnapshot,''','''  type LocalRuntimeEnvelope,
  type LocalRuntimePayload,
  type LocalRuntimeSnapshot,''',1)
assert 'type LocalRuntimePayload,' in s
assert "const localTransportRef = useRef<LocalRuntimeTransport | WebRtcRuntimeTransport | null>(null)" in s
s = s.replace("const localTransportRef = useRef<LocalRuntimeTransport | WebRtcRuntimeTransport | null>(null)", "const localTransportRef = useRef<SharedTeachingRuntimeTransport<LocalRuntimePayload> | null>(null)", 1)
old = '''  const {
    role,
    connection,
    session,
    members,
    recoverableInstructor,
    recoverableCandidate,
  } = teachingCore
  const error = hostError ?? teachingCore.error
'''
assert old in s
new = '''  const {
    role,
    connection: coreConnection,
    session,
    members,
    recoverableInstructor,
    recoverableCandidate,
  } = teachingCore
  const connection: SessionConnection = localRuntimeConnection === 'connected' && coreConnection !== 'error'
    ? 'connected'
    : coreConnection
  const error = hostError ?? teachingCore.error
'''
s = s.replace(old,new,1)
marker = "  const candidateVentilatorLocked = role === 'candidate'"
assert marker in s
telemetry = '''  useEffect(() => {
    if (role !== 'candidate' || !session?.id) return
    const timer = window.setTimeout(() => {
      void teachingCore.touchMemberNow().catch(() => undefined)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [patient, ventilator, candidateAlarmLevel, role, session?.id])

'''
s = s.replace(marker, telemetry + marker,1)
host.write_text(s)
