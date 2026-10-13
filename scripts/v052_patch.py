from pathlib import Path


def replace_once(path: Path, old: str, new: str):
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:100]!r}')
    path.write_text(text.replace(old, new, 1))

hook = Path('src/session/useTeachingSession.ts')
panel = Path('src/components/SessionPanel.tsx')
app = Path('src/App.tsx')

replace_once(
    hook,
    "export type SessionConnection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'\n",
    "export type SessionConnection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'\n\n"
    "export interface RecoverableCandidateSession {\n"
    "  sessionKey: string\n"
    "  displayName: string\n"
    "  expiresAt: string\n"
    "}\n\n"
    "const CANDIDATE_RECOVERY_STORAGE_KEY = 'eduvent.candidate-session-recovery'\n\n"
    "function readCandidateRecovery(): RecoverableCandidateSession | null {\n"
    "  if (typeof window === 'undefined') return null\n"
    "  try {\n"
    "    const raw = window.localStorage.getItem(CANDIDATE_RECOVERY_STORAGE_KEY)\n"
    "    if (!raw) return null\n"
    "    const parsed = JSON.parse(raw) as Partial<RecoverableCandidateSession>\n"
    "    if (typeof parsed.sessionKey !== 'string' || parsed.sessionKey.length !== 6 || typeof parsed.expiresAt !== 'string') return null\n"
    "    return { sessionKey: parsed.sessionKey, displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '', expiresAt: parsed.expiresAt }\n"
    "  } catch {\n"
    "    return null\n"
    "  }\n"
    "}\n\n"
    "function persistCandidateRecovery(recovery: RecoverableCandidateSession) {\n"
    "  try { window.localStorage.setItem(CANDIDATE_RECOVERY_STORAGE_KEY, JSON.stringify(recovery)) } catch { /* local recovery is optional */ }\n"
    "}\n\n"
    "function removeCandidateRecovery() {\n"
    "  try { window.localStorage.removeItem(CANDIDATE_RECOVERY_STORAGE_KEY) } catch { /* local recovery is optional */ }\n"
    "}\n\n"
    "function candidateRecoveryIsExpired(recovery: RecoverableCandidateSession) {\n"
    "  const expiresAt = Date.parse(recovery.expiresAt)\n"
    "  return Number.isFinite(expiresAt) && expiresAt <= Date.now()\n"
    "}\n"
)

replace_once(
    hook,
    "  const [recoverableInstructor, setRecoverableInstructor] = useState<{ sessionId: string; sessionKey: string } | null>(null)\n",
    "  const [recoverableInstructor, setRecoverableInstructor] = useState<{ sessionId: string; sessionKey: string } | null>(null)\n"
    "  const [recoverableCandidate, setRecoverableCandidate] = useState<RecoverableCandidateSession | null>(null)\n"
)

replace_once(
    hook,
    "          if (next.status === 'ended') {\n            setConnection('idle')\n            setError('The instructor ended this teaching session.')\n",
    "          if (next.status === 'ended') {\n            removeCandidateRecovery()\n            setRecoverableCandidate(null)\n            setConnection('idle')\n            setError('The instructor ended this teaching session.')\n"
)

old_join = '''  const joinCandidate = async (sessionKey: string, displayName: string) => {\n    setConnection('connecting')\n    setError(null)\n    try {\n      const joined = await joinTeachingSession(sessionKey, displayName)\n      roleRef.current = 'candidate'\n      setRole('candidate')\n      const row = await fetchTeachingSession(joined.sessionId)\n      patientRevisionRef.current = 0\n      ventilatorRevisionRef.current = 0\n      alarmRevisionRef.current = 0\n      pauseRevisionRef.current = 0\n      storeSession(row)\n      applyCandidateSession(row, true)\n      await touchSessionMember(joined.sessionId, patientRef.current, ventilatorRef.current, alarmLevelRef.current)\n      await attachSubscription(joined.sessionId)\n    } catch (cause) {\n      setConnection('error')\n      setError(cause instanceof Error ? cause.message : 'Unable to join teaching session.')\n      roleRef.current = 'standalone'\n      setRole('standalone')\n    }\n  }\n'''
new_join = '''  const joinCandidate = async (sessionKey: string, displayName: string, recoveryAttempt = false) => {\n    setConnection('connecting')\n    setError(null)\n    try {\n      const joined = await joinTeachingSession(sessionKey, displayName)\n      roleRef.current = 'candidate'\n      setRole('candidate')\n      const row = await fetchTeachingSession(joined.sessionId)\n      const recovery: RecoverableCandidateSession = {\n        sessionKey: row.session_key,\n        displayName: displayName.trim(),\n        expiresAt: row.expires_at,\n      }\n      persistCandidateRecovery(recovery)\n      setRecoverableCandidate(recovery)\n      patientRevisionRef.current = 0\n      ventilatorRevisionRef.current = 0\n      alarmRevisionRef.current = 0\n      pauseRevisionRef.current = 0\n      storeSession(row)\n      applyCandidateSession(row, true)\n      await touchSessionMember(joined.sessionId, patientRef.current, ventilatorRef.current, alarmLevelRef.current)\n      await attachSubscription(joined.sessionId)\n    } catch (cause) {\n      const message = cause instanceof Error ? cause.message : 'Unable to join teaching session.'\n      if (recoveryAttempt && /expired|not found|ended/i.test(message)) {\n        removeCandidateRecovery()\n        setRecoverableCandidate(null)\n      }\n      setConnection('error')\n      setError(message)\n      roleRef.current = 'standalone'\n      setRole('standalone')\n    }\n  }\n\n  const resumeCandidate = async () => {\n    const recovery = readCandidateRecovery()\n    if (!recovery) {\n      setRecoverableCandidate(null)\n      return\n    }\n    await joinCandidate(recovery.sessionKey, recovery.displayName, true)\n  }\n'''
replace_once(hook, old_join, new_join)

old_heartbeat = '''    const heartbeat = () => {\n      void touchInstructorSession(sessionId, clientId).catch((cause) => {\n        setConnection('error')\n        setError(cause instanceof Error ? cause.message : 'Instructor control lease was lost.')\n      })\n    }\n'''
new_heartbeat = '''    const heartbeat = () => {\n      void touchInstructorSession(sessionId, clientId).catch((cause) => {\n        const message = cause instanceof Error ? cause.message : 'Instructor control lease was lost.'\n        if (/expired/i.test(message)) {\n          sessionStorage.removeItem('eduvent.instructor-session-id')\n          sessionStorage.removeItem('eduvent.instructor-client-id')\n          instructorClientIdRef.current = null\n          roleRef.current = 'standalone'\n          setRole('standalone')\n          storeSession(null)\n          setMembers([])\n          setConnection('idle')\n          setError('This teaching session expired 2 hours after it was created.')\n          void closeTeachingSessionChannel(channelRef.current)\n          void closeTeachingSessionChannel(membersChannelRef.current)\n          return\n        }\n        setConnection('error')\n        setError(message)\n      })\n    }\n'''
replace_once(hook, old_heartbeat, new_heartbeat)

old_mount = '''  useEffect(() => {\n    const storedSessionId = sessionStorage.getItem('eduvent.instructor-session-id')\n    if (storedSessionId) {\n      void resumeInstructor(storedSessionId)\n      return\n    }\n    void (async () => {\n      try {\n        const found = await findActiveInstructorSession()\n        if (found && roleRef.current === 'standalone') setRecoverableInstructor(found)\n      } catch {\n        // No recoverable instructor session is a normal standalone state.\n      }\n    })()\n  }, [])\n'''
new_mount = old_mount + '''\n  useEffect(() => {\n    const recovery = readCandidateRecovery()\n    if (!recovery) return\n    if (candidateRecoveryIsExpired(recovery)) {\n      removeCandidateRecovery()\n      return\n    }\n    setRecoverableCandidate(recovery)\n  }, [])\n\n  useEffect(() => {\n    if (!recoverableCandidate) return\n    const expiresAt = Date.parse(recoverableCandidate.expiresAt)\n    if (!Number.isFinite(expiresAt)) return\n    const remainingMs = expiresAt - Date.now()\n    if (remainingMs <= 0) {\n      removeCandidateRecovery()\n      setRecoverableCandidate(null)\n      return\n    }\n    const timer = window.setTimeout(() => {\n      removeCandidateRecovery()\n      setRecoverableCandidate(null)\n    }, remainingMs)\n    return () => window.clearTimeout(timer)\n  }, [recoverableCandidate?.expiresAt])\n'''
replace_once(hook, old_mount, new_mount)

replace_once(
    hook,
    "  const leaveSession = async () => {\n    if (patientBroadcastTimerRef.current != null) window.clearTimeout(patientBroadcastTimerRef.current)\n",
    "  const leaveSession = async () => {\n    const leavingRole = roleRef.current\n    if (patientBroadcastTimerRef.current != null) window.clearTimeout(patientBroadcastTimerRef.current)\n"
)
replace_once(
    hook,
    "    setConnection('idle')\n    setError(null)\n  }\n\n  const endInstructorSession",
    "    setConnection('idle')\n    setError(null)\n    if (leavingRole === 'candidate') {\n      removeCandidateRecovery()\n      setRecoverableCandidate(null)\n    }\n  }\n\n  const endInstructorSession"
)

replace_once(
    hook,
    "        if (fresh.status === 'ended') {\n          setConnection('idle')\n          setError('The instructor ended this teaching session.')\n",
    "        if (fresh.status === 'ended') {\n          removeCandidateRecovery()\n          setRecoverableCandidate(null)\n          setConnection('idle')\n          setError('The instructor ended this teaching session.')\n"
)

old_candidate_heartbeat = '''    const sendHeartbeat = () => {\n      void touchSessionMember(session.id, patientRef.current, ventilatorRef.current, alarmLevelRef.current).catch(() => {\n        // Realtime/session connectivity owns the visible connection state; telemetry may recover independently.\n      })\n    }\n'''
new_candidate_heartbeat = '''    const sendHeartbeat = () => {\n      void touchSessionMember(session.id, patientRef.current, ventilatorRef.current, alarmLevelRef.current).catch((cause) => {\n        const message = cause instanceof Error ? cause.message : ''\n        if (/expired|ended/i.test(message)) {\n          removeCandidateRecovery()\n          setRecoverableCandidate(null)\n          roleRef.current = 'standalone'\n          setRole('standalone')\n          storeSession(null)\n          setConnection('idle')\n          setError('This teaching session expired 2 hours after it was created.')\n          void closeTeachingSessionChannel(channelRef.current)\n          return\n        }\n        // Realtime/session connectivity owns the visible connection state; telemetry may recover independently.\n      })\n    }\n'''
replace_once(hook, old_candidate_heartbeat, new_candidate_heartbeat)

replace_once(
    hook,
    "    recoverableInstructor,\n    startInstructor,\n    resumeInstructor,\n    joinCandidate,\n",
    "    recoverableInstructor,\n    recoverableCandidate,\n    startInstructor,\n    resumeInstructor,\n    joinCandidate,\n    resumeCandidate,\n"
)

# Session panel props / UI.
replace_once(
    panel,
    "  recoverableInstructor?: { sessionId: string; sessionKey: string } | null\n",
    "  recoverableInstructor?: { sessionId: string; sessionKey: string } | null\n  recoverableCandidate?: { sessionKey: string; displayName: string; expiresAt: string } | null\n"
)
replace_once(
    panel,
    "  onResumeInstructor?: (sessionId?: string) => Promise<void>\n  onJoinCandidate: (sessionKey: string, displayName: string) => Promise<void>\n",
    "  onResumeInstructor?: (sessionId?: string) => Promise<void>\n  onJoinCandidate: (sessionKey: string, displayName: string) => Promise<void>\n  onResumeCandidate?: () => Promise<void>\n"
)
replace_once(
    panel,
    "  recoverableInstructor,\n  onStartInstructor,\n  onResumeInstructor,\n  onJoinCandidate,\n",
    "  recoverableInstructor,\n  recoverableCandidate,\n  onStartInstructor,\n  onResumeInstructor,\n  onJoinCandidate,\n  onResumeCandidate,\n"
)
replace_once(
    panel,
    "  useEffect(() => {\n    const body = document.body\n",
    "  useEffect(() => {\n    if (!recoverableCandidate) return\n    setSessionKey(recoverableCandidate.sessionKey)\n    setDisplayName(recoverableCandidate.displayName)\n  }, [recoverableCandidate])\n\n  useEffect(() => {\n    const body = document.body\n"
)
panel_text = panel.read_text().replace("version.textContent = 'v0.51'", "version.textContent = 'v0.52'")
panel.write_text(panel_text)
replace_once(
    panel,
    "            <button type=\"button\" className=\"session-secondary-button\" onClick={() => setJoinMode(true)}>Join as candidate</button>\n            {recoverableInstructor && onResumeInstructor && (\n",
    "            <button type=\"button\" className=\"session-secondary-button\" onClick={() => setJoinMode(true)}>Join as candidate</button>\n            {recoverableCandidate && onResumeCandidate && (\n              <button type=\"button\" className=\"session-secondary-button\" disabled={connection === 'connecting'} onClick={() => void onResumeCandidate()}>Rejoin candidate {recoverableCandidate.sessionKey}</button>\n            )}\n            {recoverableInstructor && onResumeInstructor && (\n"
)

# Wire props and bump app version/diagnostics.
replace_once(
    app,
    "            recoverableInstructor={teachingSession.recoverableInstructor}\n            onStartInstructor={teachingSession.startInstructor}\n          onResumeInstructor={teachingSession.resumeInstructor}\n            onJoinCandidate={teachingSession.joinCandidate}\n",
    "            recoverableInstructor={teachingSession.recoverableInstructor}\n            recoverableCandidate={teachingSession.recoverableCandidate}\n            onStartInstructor={teachingSession.startInstructor}\n            onResumeInstructor={teachingSession.resumeInstructor}\n            onJoinCandidate={teachingSession.joinCandidate}\n            onResumeCandidate={teachingSession.resumeCandidate}\n"
)
app_text = app.read_text().replace("'0.51'", "'0.52'").replace('v0.51', 'v0.52')
app.write_text(app_text)

print('v0.52 source patch applied')
