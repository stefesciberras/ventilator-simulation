from pathlib import Path
import re

p = Path('src/session/useTeachingSession.ts')
s = p.read_text()

# Session lifecycle now comes from the reusable teaching module. Keep only EDUVENT
# row types + update primitive here for host-specific synchronization.
s = s.replace("import type { RealtimeChannel } from '@supabase/supabase-js'\n", '')
old = '''import {
  claimInstructorSession,
  closeTeachingSessionChannel,
  createTeachingSession,
  ensureAnonymousSession,
  findActiveInstructorSession,
  fetchSessionMembers,
  fetchTeachingSession,
  joinTeachingSession,
  subscribeToSessionMembers,
  subscribeToTeachingSession,
  touchInstructorSession,
  touchSessionMember,
  type SessionMemberRow,
  type TeachingSessionRow,
  updateTeachingSession,
} from './supabase'
'''
new = '''import {
  type SessionMemberRow,
  type TeachingSessionRow,
  updateTeachingSession,
} from './supabase'
import { useSharedTeachingSession, type SharedTeachingRole, type RecoverableTeachingCandidate } from '../teaching/session'
import { eduventTeachingSessionRepository, type EduventTeachingSessionCreateInput } from './eduventTeachingSessionAdapter'
'''
assert old in s
s = s.replace(old, new, 1)

# Replace EDUVENT-owned lifecycle type/recovery definitions with aliases to shared core.
start = s.index("export type SessionRole = 'standalone' | 'instructor' | 'candidate'")
end = s.index('export interface InstructorSessionInitialState')
replacement = '''export type SessionRole = SharedTeachingRole
export type SessionConnection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'
export type RuntimeTransportKind = 'cloud' | 'webrtc' | 'local-server' | 'appliance'
export type RecoverableCandidateSession = RecoverableTeachingCandidate

'''
s = s[:start] + replacement + s[end:]

# Replace lifecycle-owned React state; host-specific runtime state stays local.
old = '''  const [role, setRole] = useState<SessionRole>('standalone')
  const [connection, setConnection] = useState<SessionConnection>('idle')
  const [session, setSession] = useState<TeachingSessionRow | null>(null)
  const [members, setMembers] = useState<SessionMemberRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [recoverableInstructor, setRecoverableInstructor] = useState<{ sessionId: string; sessionKey: string } | null>(null)
  const [recoverableCandidate, setRecoverableCandidate] = useState<RecoverableCandidateSession | null>(null)
'''
assert old in s
s = s.replace(old, "  const [hostError, setHostError] = useState<string | null>(null)\n", 1)

s = s.replace("  const channelRef = useRef<RealtimeChannel | null>(null)\n  const membersChannelRef = useRef<RealtimeChannel | null>(null)\n", '')
s = s.replace("  const instructorHeartbeatRef = useRef<number | null>(null)\n", '')
s = s.replace("  const telemetryTimerRef = useRef<number | null>(null)\n", '')

# The shared hook needs a deferred candidate-row callback because the EDUVENT
# application function is declared later in this adapter hook.
marker = "  const runtimeEventListenersRef = useRef(new Set<(envelope: LocalRuntimeEnvelope) => void>())\n\n"
assert marker in s
insert = '''  const applyCandidateSessionRef = useRef<(row: TeachingSessionRow, force?: boolean) => void>(() => undefined)

  const teachingCore = useSharedTeachingSession<
    TeachingSessionRow,
    SessionMemberRow,
    EduventTeachingSessionCreateInput,
    { patient: PatientSettings; ventilator: VentilatorSettings; alarmLevel: CandidateAlarmLevel }
  >({
    storageNamespace: 'eduvent',
    repository: eduventTeachingSessionRepository,
    getMemberTelemetry: () => ({
      patient: patientRef.current,
      ventilator: ventilatorRef.current,
      alarmLevel: alarmLevelRef.current,
    }),
    host: {
      prepareInstructorSession: async (row, input, phase) => {
        patientRevisionRef.current = Number(row.patient_revision ?? 0)
        ventilatorRevisionRef.current = Number(row.ventilator_revision ?? 0)
        alarmRevisionRef.current = Number(row.alarm_revision ?? 0)
        pauseRevisionRef.current = Number(row.pause_revision ?? 0)
        if (phase === 'resume' || !input) {
          setSimulationPaused(Boolean(row.simulation_paused))
          return row
        }
        const patch: Partial<TeachingSessionRow> = {}
        const transitionMs = Math.max(0, Math.round(input.patientTransitionSeconds * 1000))
        if (Number(row.transition_ms ?? 0) !== transitionMs) patch.transition_ms = transitionMs
        if (Boolean(row.simulation_paused) !== input.simulationPaused) {
          pauseRevisionRef.current = Math.max(pauseRevisionRef.current, Number(row.pause_revision ?? 0)) + 1
          patch.simulation_paused = input.simulationPaused
          patch.pause_revision = pauseRevisionRef.current
        }
        return Object.keys(patch).length ? await updateTeachingSession(row.id, patch) : row
      },
      onSessionRow: (row, nextRole, _source, force) => {
        sessionRef.current = row
        if (nextRole === 'candidate' && localRuntimeConnectionRef.current !== 'connected') {
          applyCandidateSessionRef.current(row, force)
        }
      },
      onSessionCleared: () => {
        localTransportRef.current?.disconnect()
        localTransportRef.current = null
        localRuntimeConnectionRef.current = 'disabled'
        setLocalRuntimeConnection('disabled')
        setScenarioClockSync(null)
        setSimulationPaused(false)
        setSimulationSpeed(1)
      },
    },
  })

  const {
    role,
    connection,
    session,
    members,
    recoverableInstructor,
    recoverableCandidate,
  } = teachingCore
  const error = hostError ?? teachingCore.error

'''
s = s.replace(marker, marker + insert, 1)

# Replace local session storage helper with shared-core update/replace primitive.
old = '''  const storeSession = (next: TeachingSessionRow | null) => {
    sessionRef.current = next
    setSession(next)
  }

'''
assert old in s
new = '''  const storeSession = (next: TeachingSessionRow) => {
    sessionRef.current = next
    teachingCore.replaceSession(next, 'host-update')
  }

'''
s = s.replace(old, new, 1)

# Existing refs now track shared core state.
s = s.replace("  useEffect(() => { roleRef.current = role }, [role])", "  useEffect(() => { roleRef.current = role }, [role])")

# Runtime-transport connection can strengthen, but not own, shared lifecycle state.
s = s.replace("          if (roleRef.current !== 'standalone') setConnection('connected')", "          if (roleRef.current !== 'standalone') teachingCore.setExternalConnection('connected')")

# Local-runtime remote end now delegates lifecycle cleanup to shared core.
old = '''      removeCandidateRecovery()
      setRecoverableCandidate(null)
      setConnection('idle')
      setError('The instructor ended this teaching session.')
      roleRef.current = 'standalone'
      setRole('standalone')
      localTransportRef.current?.disconnect()
      localTransportRef.current = null
      return
'''
assert old in s
s = s.replace(old, "      void teachingCore.terminateRemote('The instructor ended this teaching session.')\n      return\n", 1)

# All remaining adapter errors are host-specific, not lifecycle state.
s = s.replace('setError(', 'setHostError(')
# Undo the one name inside shared-core expression if introduced (defensive).
s = s.replace('teachingCore.setExternalHostError', 'teachingCore.setExternalError')

# After declaring EDUVENT candidate application, point the deferred shared callback at it.
needle = "  const applyCandidateSession = (next: TeachingSessionRow, force = false) => {"
idx = s.index(needle)
# Insert assignment immediately after function body by locating the next lifecycle marker.
lifecycle_marker = "  const refreshMembers = async (sessionId: string) => {"
life_idx = s.index(lifecycle_marker, idx)
s = s[:life_idx] + "  applyCandidateSessionRef.current = applyCandidateSession\n\n" + s[life_idx:]

# Remove old lifecycle/presence/recovery implementation wholesale. Host-specific
# policy broadcasting begins at updatePolicy and remains in this adapter.
life_start = s.index(lifecycle_marker)
policy_start = s.index('  const updatePolicy = async (patch: PolicyPatch) => {', life_start)
replacement = '''  const startInstructor = async (initial?: InstructorSessionInitialState) => {
    setHostError(null)
    const input: EduventTeachingSessionCreateInput = {
      patient: initial?.patient ?? patientRef.current,
      ventilator: initial?.ventilator ?? ventilatorRef.current,
      alarmLimits: initial?.alarmLimits ?? alarmLimitsRef.current,
      patientTransitionSeconds: initial?.patientTransitionSeconds ?? patientTransitionSecondsRef.current,
      simulationPaused: simulationPausedRef.current,
    }
    appendScenarioLog('session.instructor.start_requested', { hasInitialState: Boolean(initial), simulationPaused: input.simulationPaused })
    const row = await teachingCore.startInstructor(input)
    if (row) appendScenarioLog('session.instructor.started', { sessionId: row.id, sessionKey: row.session_key, status: row.status, simulationPaused: Boolean(row.simulation_paused) })
  }

  const resumeInstructor = async (sessionId?: string) => {
    setHostError(null)
    appendScenarioLog('session.instructor.resume_requested', { sessionId: sessionId ?? null })
    const row = await teachingCore.resumeInstructor(sessionId)
    if (row) appendScenarioLog('session.instructor.resumed', { sessionId: row.id, sessionKey: row.session_key, status: row.status })
  }

  const joinCandidate = async (sessionKey: string, displayName: string) => {
    setHostError(null)
    appendScenarioLog('session.candidate.join_requested', { sessionKey: sessionKey.trim().toUpperCase(), displayName: displayName.trim() })
    const row = await teachingCore.joinCandidate(sessionKey, displayName)
    if (row) appendScenarioLog('session.candidate.joined', { sessionId: row.id, sessionKey: row.session_key, displayName: displayName.trim(), status: row.status })
  }

  const resumeCandidate = async () => {
    setHostError(null)
    await teachingCore.resumeCandidate()
  }

  const leaveSession = async () => {
    appendScenarioLog('session.leave', { role: roleRef.current, sessionId: sessionRef.current?.id ?? null, sessionKey: sessionRef.current?.session_key ?? null })
    localTransportRef.current?.disconnect()
    localTransportRef.current = null
    if (localCheckpointTimerRef.current != null) window.clearInterval(localCheckpointTimerRef.current)
    await teachingCore.leaveSession()
  }

  const endInstructorSession = async () => {
    const current = sessionRef.current
    appendScenarioLog('session.instructor.end_requested', { sessionId: current?.id ?? null, sessionKey: current?.session_key ?? null })
    if (roleRef.current === 'instructor' && current) publishLocalRuntimeSnapshot({ ...current, status: 'ended' })
    await teachingCore.endInstructorSession()
  }

  useEffect(() => {
    if ((role !== 'instructor' && role !== 'candidate') || !session) {
      localTransportRef.current?.disconnect()
      localTransportRef.current = null
      return
    }
    attachLocalRuntime(role, session)
    return () => {
      localTransportRef.current?.disconnect()
      localTransportRef.current = null
    }
  }, [role, session?.id])

'''
s = s[:life_start] + replacement + s[policy_start:]

# Shared core owns candidate authoritative refresh + member heartbeat/telemetry.
for marker_start, marker_end in [
    ("  // Realtime remains the fast path, but the teaching session row is authoritative.", "  useEffect(() => () => {"),
]:
    if marker_start in s:
        a = s.index(marker_start)
        b = s.index(marker_end, a)
        s = s[:a] + s[b:]

# Replace old unmount cleanup references to channels removed with shared core.
old = '''  useEffect(() => () => {
    localTransportRef.current?.disconnect()
    if (localCheckpointTimerRef.current != null) window.clearInterval(localCheckpointTimerRef.current)
    void closeTeachingSessionChannel(channelRef.current)
    void closeTeachingSessionChannel(membersChannelRef.current)
  }, [])
'''
if old in s:
    s = s.replace(old, '''  useEffect(() => () => {
    localTransportRef.current?.disconnect()
    if (localCheckpointTimerRef.current != null) window.clearInterval(localCheckpointTimerRef.current)
  }, [])
''', 1)

# Return shared-core lifecycle methods/wrappers.
s = s.replace('    resumeInstructor,\n    joinCandidate,\n    resumeCandidate,\n    leaveSession,\n    endInstructorSession,', '    resumeInstructor,\n    joinCandidate,\n    resumeCandidate,\n    leaveSession,\n    endInstructorSession,')

p.write_text(s)

# Export shared session module from teaching barrel.
index = Path('src/teaching/index.ts')
text = index.read_text()
line = "export * from './session'\n"
if line not in text:
    text += line
index.write_text(text)

session_index = Path('src/teaching/session/index.ts')
session_index.parent.mkdir(parents=True, exist_ok=True)
session_index.write_text("export * from './types'\nexport * from './useSharedTeachingSession'\n")

Path('src/appVersion.ts').write_text("export const APP_VERSION = '0.82.6.0'\n")
