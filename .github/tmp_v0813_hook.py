from pathlib import Path


def replace(path: str, old: str, new: str, expected: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual != expected:
        raise SystemExit(f"{path}: expected {expected} occurrence(s), found {actual}: {old[:180]!r}")
    p.write_text(text.replace(old, new))

hook = 'src/session/useTeachingSession.ts'
replace(hook,
    "import { WebRtcRuntimeTransport } from './webRtcRuntimeTransport'\n",
    "import { WebRtcRuntimeTransport } from './webRtcRuntimeTransport'\nimport { appendScenarioLog } from '../diagnostics'\n")
replace(hook,
    "      onConnection: (state: LocalRuntimeConnection) => {\n        localRuntimeConnectionRef.current = state\n        setLocalRuntimeConnection(state)\n",
    "      onConnection: (state: LocalRuntimeConnection) => {\n        localRuntimeConnectionRef.current = state\n        setLocalRuntimeConnection(state)\n        appendScenarioLog('runtime.connection', { role: nextRole, sessionId: row.id, sessionKey: row.session_key, state, transport: url ? getLocalRuntimeProfile() : 'webrtc' })\n")
replace(hook,
    "  const broadcastRuntimeEvent = (eventType: string, payload: unknown, scenarioTimeMs: number) => {\n    if (roleRef.current !== 'instructor') return false\n    return Boolean(localTransportRef.current?.publish({\n",
    "  const broadcastRuntimeEvent = (eventType: string, payload: unknown, scenarioTimeMs: number) => {\n    if (roleRef.current !== 'instructor') return false\n    appendScenarioLog('scenario.runtime_event.broadcast', { sessionId: sessionRef.current?.id ?? null, eventType, scenarioTimeMs: Math.max(0, scenarioTimeMs) })\n    return Boolean(localTransportRef.current?.publish({\n")
replace(hook,
    "  const startInstructor = async (initial?: InstructorSessionInitialState) => {\n    setConnection('connecting')\n    setError(null)\n",
    "  const startInstructor = async (initial?: InstructorSessionInitialState) => {\n    setConnection('connecting')\n    setError(null)\n    appendScenarioLog('session.instructor.start_requested', { hasInitialState: Boolean(initial), simulationPaused: simulationPausedRef.current })\n")
replace(hook,
    "      attachLocalRuntime('instructor', row)\n      setRecoverableInstructor(null)\n    } catch (cause) {\n",
    "      attachLocalRuntime('instructor', row)\n      setRecoverableInstructor(null)\n      appendScenarioLog('session.instructor.started', { sessionId: row.id, sessionKey: row.session_key, status: row.status, simulationPaused: Boolean(row.simulation_paused) })\n    } catch (cause) {\n      appendScenarioLog('session.instructor.start_failed', { message: cause instanceof Error ? cause.message : String(cause) })\n")
replace(hook,
    "  const joinCandidate = async (sessionKey: string, displayName: string, recoveryAttempt = false) => {\n    setConnection('connecting')\n    setError(null)\n",
    "  const joinCandidate = async (sessionKey: string, displayName: string, recoveryAttempt = false) => {\n    setConnection('connecting')\n    setError(null)\n    appendScenarioLog('session.candidate.join_requested', { sessionKey: sessionKey.trim().toUpperCase(), displayName: displayName.trim(), recoveryAttempt })\n")
replace(hook,
    "      await attachSubscription(joined.sessionId)\n      attachLocalRuntime('candidate', row)\n    } catch (cause) {\n      const message = cause instanceof Error ? cause.message : 'Unable to join teaching session.'\n",
    "      await attachSubscription(joined.sessionId)\n      attachLocalRuntime('candidate', row)\n      appendScenarioLog('session.candidate.joined', { sessionId: row.id, sessionKey: row.session_key, displayName: displayName.trim(), status: row.status, recoveryAttempt })\n    } catch (cause) {\n      const message = cause instanceof Error ? cause.message : 'Unable to join teaching session.'\n      appendScenarioLog('session.candidate.join_failed', { sessionKey: sessionKey.trim().toUpperCase(), recoveryAttempt, message })\n")
replace(hook,
    "  const resumeInstructor = async (sessionId?: string) => {\n    setConnection('connecting')\n    setError(null)\n",
    "  const resumeInstructor = async (sessionId?: string) => {\n    setConnection('connecting')\n    setError(null)\n    appendScenarioLog('session.instructor.resume_requested', { sessionId: sessionId ?? null })\n")
replace(hook,
    "      attachInstructorLease(found.sessionId, clientId)\n      attachLocalRuntime('instructor', row)\n    } catch (cause) {\n      setConnection('error')\n",
    "      attachInstructorLease(found.sessionId, clientId)\n      attachLocalRuntime('instructor', row)\n      appendScenarioLog('session.instructor.resumed', { sessionId: row.id, sessionKey: row.session_key, status: row.status })\n    } catch (cause) {\n      appendScenarioLog('session.instructor.resume_failed', { sessionId: sessionId ?? null, message: cause instanceof Error ? cause.message : String(cause) })\n      setConnection('error')\n")
replace(hook,
    "  const leaveSession = async () => {\n    const leavingRole = roleRef.current\n",
    "  const leaveSession = async () => {\n    const leavingRole = roleRef.current\n    appendScenarioLog('session.leave', { role: leavingRole, sessionId: sessionRef.current?.id ?? null, sessionKey: sessionRef.current?.session_key ?? null })\n")
replace(hook,
    "  const endInstructorSession = async () => {\n    const current = sessionRef.current\n",
    "  const endInstructorSession = async () => {\n    const current = sessionRef.current\n    appendScenarioLog('session.instructor.end_requested', { sessionId: current?.id ?? null, sessionKey: current?.session_key ?? null })\n")
replace(hook,
    "  const updatePolicy = async (patch: PolicyPatch) => {\n    const current = sessionRef.current\n    if (roleRef.current !== 'instructor' || !current) return\n",
    "  const updatePolicy = async (patch: PolicyPatch) => {\n    const current = sessionRef.current\n    if (roleRef.current !== 'instructor' || !current) return\n    appendScenarioLog('session.policy.update_requested', { sessionId: current.id, patch })\n")
replace(hook,
    "  const broadcastNow = async () => {\n    const current = sessionRef.current\n    if (roleRef.current !== 'instructor' || !current) return\n",
    "  const broadcastNow = async () => {\n    const current = sessionRef.current\n    if (roleRef.current !== 'instructor' || !current) return\n    appendScenarioLog('session.settings.push_requested', { sessionId: current.id, syncPatient: current.sync_patient, syncVentilator: current.sync_ventilator, syncAlarms: current.sync_alarms })\n")
replace(hook,
    "        storeSession(next)\n        setError(null)\n      } catch (cause) {\n        setError(cause instanceof Error ? cause.message : 'Unable to broadcast simulation pause state.')\n",
    "        storeSession(next)\n        setError(null)\n        appendScenarioLog('session.pause_changed', { sessionId: latest.id, paused: simulationPaused, pauseRevision: pauseRevisionRef.current })\n      } catch (cause) {\n        setError(cause instanceof Error ? cause.message : 'Unable to broadcast simulation pause state.')\n",
    expected=1)
