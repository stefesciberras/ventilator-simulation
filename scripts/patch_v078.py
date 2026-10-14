from pathlib import Path
import json

root = Path('.')

# package.json
package_path = root / 'package.json'
package = json.loads(package_path.read_text())
package['scripts']['local'] = 'npm run build && node server/local-session-server.mjs'
package['scripts']['local:serve'] = 'node server/local-session-server.mjs'
package['dependencies']['ws'] = '^8.18.3'
package_path.write_text(json.dumps(package, indent=2) + '\n')

# central version
version_path = root / 'src/appVersion.ts'
version_path.write_text("export const APP_VERSION = '0.78.0'\n")

# useTeachingSession LAN runtime integration
hook_path = root / 'src/session/useTeachingSession.ts'
hook = hook_path.read_text()

anchor = "} from './supabase'\n"
insert = """} from './supabase'\nimport {\n  LocalRuntimeTransport,\n  getDefaultLocalRuntimeUrl,\n  type LocalRuntimeConnection,\n  type LocalRuntimeEnvelope,\n  type LocalRuntimeSnapshot,\n} from './localRuntimeTransport'\n"""
assert anchor in hook
hook = hook.replace(anchor, insert, 1)

anchor = "  const [recoverableCandidate, setRecoverableCandidate] = useState<RecoverableCandidateSession | null>(null)\n"
insert = anchor + """  const [localRuntimeConnection, setLocalRuntimeConnection] = useState<LocalRuntimeConnection>('disabled')\n  const [localRuntimeUrl, setLocalRuntimeUrl] = useState<string | null>(() => getDefaultLocalRuntimeUrl())\n"""
assert anchor in hook
hook = hook.replace(anchor, insert, 1)

anchor = "  const instructorClientIdRef = useRef<string | null>(null)\n"
insert = anchor + """  const localRuntimeConnectionRef = useRef<LocalRuntimeConnection>('disabled')\n  const localTransportRef = useRef<LocalRuntimeTransport | null>(null)\n  const localCheckpointTimerRef = useRef<number | null>(null)\n  const runtimeEventListenersRef = useRef(new Set<(envelope: LocalRuntimeEnvelope) => void>())\n"""
assert anchor in hook
hook = hook.replace(anchor, insert, 1)

anchor = "  useEffect(() => { alarmLevelRef.current = candidateAlarmLevel }, [candidateAlarmLevel])\n"
insert = anchor + "  useEffect(() => { localRuntimeConnectionRef.current = localRuntimeConnection }, [localRuntimeConnection])\n"
assert anchor in hook
hook = hook.replace(anchor, insert, 1)

anchor = "  const applyCandidateSession = (next: TeachingSessionRow, force = false) => {\n"
helpers = r'''  const buildLocalRuntimeSnapshot = (row = sessionRef.current): LocalRuntimeSnapshot | null => {
    if (!row) return null
    return {
      sessionId: row.id,
      sessionKey: row.session_key,
      status: row.status,
      sentAt: Date.now(),
      patient: patientRef.current,
      ventilator: ventilatorRef.current,
      alarmLimits: alarmLimitsRef.current,
      patientTransitionMs: Math.max(0, Math.round(patientTransitionSecondsRef.current * 1000)),
      simulationPaused,
      policy: {
        syncPatient: Boolean(row.sync_patient),
        syncVentilator: Boolean(row.sync_ventilator),
        candidateCanEditPatient: Boolean(row.candidate_can_edit_patient),
        candidateCanEditVentilator: Boolean(row.candidate_can_edit_ventilator),
        syncAlarms: Boolean(row.sync_alarms),
        candidateCanEditAlarms: Boolean(row.candidate_can_edit_alarms),
        alarmsSilent: Boolean(row.alarms_silent),
        candidateCanEditWaveforms: Boolean(row.candidate_can_edit_waveforms),
        allowOesophagealPressure: Boolean(row.allow_oesophageal_pressure),
        showPatientEffort: Boolean(row.show_patient_effort),
      },
    }
  }

  const publishLocalRuntimeSnapshot = (row = sessionRef.current) => {
    if (roleRef.current !== 'instructor') return false
    const snapshot = buildLocalRuntimeSnapshot(row)
    return snapshot ? Boolean(localTransportRef.current?.publish({ type: 'snapshot', snapshot })) : false
  }

  const applyLocalRuntimeSnapshot = (snapshot: LocalRuntimeSnapshot) => {
    if (roleRef.current !== 'candidate') return
    const current = sessionRef.current
    if (!current || snapshot.sessionId !== current.id || snapshot.sessionKey !== current.session_key) return
    if (snapshot.status === 'ended') {
      removeCandidateRecovery()
      setRecoverableCandidate(null)
      setConnection('idle')
      setError('The instructor ended this teaching session.')
      roleRef.current = 'standalone'
      setRole('standalone')
      localTransportRef.current?.disconnect()
      localTransportRef.current = null
      return
    }

    const merged: TeachingSessionRow = {
      ...current,
      status: snapshot.status,
      sync_patient: snapshot.policy.syncPatient,
      sync_ventilator: snapshot.policy.syncVentilator,
      candidate_can_edit_patient: snapshot.policy.candidateCanEditPatient,
      candidate_can_edit_ventilator: snapshot.policy.candidateCanEditVentilator,
      sync_alarms: snapshot.policy.syncAlarms,
      candidate_can_edit_alarms: snapshot.policy.candidateCanEditAlarms,
      alarms_silent: snapshot.policy.alarmsSilent,
      candidate_can_edit_waveforms: snapshot.policy.candidateCanEditWaveforms,
      allow_oesophageal_pressure: snapshot.policy.allowOesophagealPressure,
      show_patient_effort: snapshot.policy.showPatientEffort,
      patient_settings: snapshot.patient,
      ventilator_settings: snapshot.ventilator,
      alarm_settings: snapshot.alarmLimits,
      transition_ms: snapshot.patientTransitionMs,
      simulation_paused: snapshot.simulationPaused,
      updated_at: new Date(snapshot.sentAt).toISOString(),
    }
    storeSession(merged)

    if (snapshot.policy.syncPatient) {
      suppressPatientBroadcastRef.current = true
      setPatient(snapshot.patient)
      setPatientTransitionSeconds(Math.max(0, Math.round(snapshot.patientTransitionMs / 1000)))
      window.setTimeout(() => { suppressPatientBroadcastRef.current = false }, 0)
    }
    if (snapshot.policy.syncVentilator) {
      suppressVentilatorBroadcastRef.current = true
      setVentilator(snapshot.ventilator)
      window.setTimeout(() => { suppressVentilatorBroadcastRef.current = false }, 0)
    }
    if (snapshot.policy.syncAlarms) setAlarmLimits(snapshot.alarmLimits)
    setSimulationPaused(snapshot.simulationPaused)
  }

  const handleLocalRuntimeEnvelope = (envelope: LocalRuntimeEnvelope) => {
    if (envelope.payload.type === 'snapshot') applyLocalRuntimeSnapshot(envelope.payload.snapshot)
    for (const listener of runtimeEventListenersRef.current) listener(envelope)
  }

  const attachLocalRuntime = (nextRole: 'instructor' | 'candidate', row: TeachingSessionRow) => {
    localTransportRef.current?.disconnect()
    localTransportRef.current = null
    const url = getDefaultLocalRuntimeUrl()
    setLocalRuntimeUrl(url)
    if (!url) {
      localRuntimeConnectionRef.current = 'disabled'
      setLocalRuntimeConnection('disabled')
      return
    }

    const clientId = nextRole === 'instructor'
      ? (instructorClientIdRef.current ?? crypto.randomUUID())
      : crypto.randomUUID()
    const transport = new LocalRuntimeTransport({
      url,
      role: nextRole,
      sessionKey: row.session_key,
      sessionId: row.id,
      clientId,
      onConnection: (state) => {
        localRuntimeConnectionRef.current = state
        setLocalRuntimeConnection(state)
        if (state === 'connected') {
          if (roleRef.current !== 'standalone') setConnection('connected')
          if (nextRole === 'instructor') window.setTimeout(() => publishLocalRuntimeSnapshot(), 0)
        }
      },
      onEnvelope: handleLocalRuntimeEnvelope,
    })
    localTransportRef.current = transport
    transport.connect()
  }

  const broadcastRuntimeEvent = (eventType: string, payload: unknown, scenarioTimeMs: number) => {
    if (roleRef.current !== 'instructor') return false
    return Boolean(localTransportRef.current?.publish({
      type: 'scenario-event',
      event: {
        eventId: crypto.randomUUID(),
        scenarioTimeMs: Math.max(0, scenarioTimeMs),
        emittedAt: Date.now(),
        eventType,
        payload,
      },
    }))
  }

  const subscribeRuntimeEvents = (listener: (envelope: LocalRuntimeEnvelope) => void) => {
    runtimeEventListenersRef.current.add(listener)
    return () => runtimeEventListenersRef.current.delete(listener)
  }

'''
assert anchor in hook
hook = hook.replace(anchor, helpers + anchor, 1)

# Candidate cloud updates do not overwrite the LAN fast path while connected.
old = """      (next) => {\n        storeSession(next)\n        if (roleRef.current === 'candidate') {\n          if (next.status === 'ended') {\n"""
new = """      (next) => {\n        if (roleRef.current === 'candidate') {\n          if (next.status === 'ended') {\n"""
assert old in hook
hook = hook.replace(old, new, 1)
old = """            return\n          }\n          applyCandidateSession(next)\n        }\n      },\n"""
new = """            return\n          }\n          if (localRuntimeConnectionRef.current === 'connected') return\n          storeSession(next)\n          applyCandidateSession(next)\n          return\n        }\n        storeSession(next)\n      },\n"""
assert old in hook
hook = hook.replace(old, new, 1)

old = """            const fresh = await fetchTeachingSession(sessionId)\n            storeSession(fresh)\n            if (roleRef.current === 'candidate') applyCandidateSession(fresh)\n"""
new = """            const fresh = await fetchTeachingSession(sessionId)\n            if (roleRef.current !== 'candidate' || localRuntimeConnectionRef.current !== 'connected') {\n              storeSession(fresh)\n              if (roleRef.current === 'candidate') applyCandidateSession(fresh)\n            }\n"""
assert old in hook
hook = hook.replace(old, new, 1)

hook = hook.replace("setConnection('reconnecting')\n        } else if (status === 'CLOSED'", "setConnection(localRuntimeConnectionRef.current === 'connected' ? 'connected' : 'reconnecting')\n        } else if (status === 'CLOSED'", 1)
hook = hook.replace("setConnection('reconnecting')\n        }\n      },\n    )", "setConnection(localRuntimeConnectionRef.current === 'connected' ? 'connected' : 'reconnecting')\n        }\n      },\n    )", 1)

# Attach LAN transport after cloud session setup.
needle = "      attachInstructorLease(created.sessionId, clientId)\n      setRecoverableInstructor(null)\n"
assert needle in hook
hook = hook.replace(needle, "      attachInstructorLease(created.sessionId, clientId)\n      attachLocalRuntime('instructor', row)\n      setRecoverableInstructor(null)\n", 1)
needle = "      await attachSubscription(joined.sessionId)\n    } catch (cause) {\n"
assert needle in hook
hook = hook.replace(needle, "      await attachSubscription(joined.sessionId)\n      attachLocalRuntime('candidate', row)\n    } catch (cause) {\n", 1)
needle = "      attachInstructorLease(found.sessionId, clientId)\n    } catch (cause) {\n"
assert needle in hook
hook = hook.replace(needle, "      attachInstructorLease(found.sessionId, clientId)\n      attachLocalRuntime('instructor', row)\n    } catch (cause) {\n", 1)

# Local transport cleanup.
needle = "    if (instructorHeartbeatRef.current != null) window.clearInterval(instructorHeartbeatRef.current)\n    await closeTeachingSessionChannel(channelRef.current)\n"
assert needle in hook
hook = hook.replace(needle, "    if (instructorHeartbeatRef.current != null) window.clearInterval(instructorHeartbeatRef.current)\n    if (localCheckpointTimerRef.current != null) window.clearInterval(localCheckpointTimerRef.current)\n    localTransportRef.current?.disconnect()\n    localTransportRef.current = null\n    localRuntimeConnectionRef.current = 'disabled'\n    setLocalRuntimeConnection('disabled')\n    await closeTeachingSessionChannel(channelRef.current)\n", 1)

# Publish an ended snapshot before cloud teardown.
needle = "    if (roleRef.current === 'instructor' && current) {\n      try {\n        await updateTeachingSession(current.id, { status: 'ended' })\n"
assert needle in hook
hook = hook.replace(needle, "    if (roleRef.current === 'instructor' && current) {\n      publishLocalRuntimeSnapshot({ ...current, status: 'ended' })\n      try {\n        await updateTeachingSession(current.id, { status: 'ended' })\n", 1)

# Optimistic policy state is sent locally before the cloud write completes.
needle = """    try {\n      const next = await updateTeachingSession(current.id, databasePatch)\n      storeSession(next)\n"""
replacement = """    const optimistic = { ...current, ...databasePatch, updated_at: new Date().toISOString() } as TeachingSessionRow\n    storeSession(optimistic)\n    publishLocalRuntimeSnapshot(optimistic)\n    try {\n      const next = await updateTeachingSession(current.id, databasePatch)\n      storeSession(next)\n"""
assert needle in hook
hook = hook.replace(needle, replacement, 1)

# Broadcast now uses LAN immediately as well as cloud persistence.
needle = "    if (roleRef.current !== 'instructor' || !current) return\n    const patch: Partial<TeachingSessionRow> = {}\n"
assert needle in hook
hook = hook.replace(needle, "    if (roleRef.current !== 'instructor' || !current) return\n    publishLocalRuntimeSnapshot(current)\n    const patch: Partial<TeachingSessionRow> = {}\n", 1)

# Candidate polling only becomes authoritative when LAN is not connected.
old = """        storeSession(fresh)\n        if (fresh.status === 'ended') {\n"""
new = """        if (fresh.status === 'ended') {\n"""
assert old in hook
hook = hook.replace(old, new, 1)
old = """          return\n        }\n        applyCandidateSession(fresh)\n"""
new = """          return\n        }\n        if (localRuntimeConnectionRef.current !== 'connected') {\n          storeSession(fresh)\n          applyCandidateSession(fresh)\n        }\n"""
assert old in hook
hook = hook.replace(old, new, 1)

# LAN fast-path state propagation and 5-second checkpoints.
anchor = "  // Realtime remains the fast path, but the teaching session row is authoritative.\n"
lan_effects = r'''  // The LAN relay is the runtime fast path. It publishes immediately from React state,
  // while Supabase remains the durable cloud copy and fallback transport.
  useEffect(() => {
    if (role !== 'instructor' || !session?.id) return
    publishLocalRuntimeSnapshot(session)
  }, [
    role,
    session?.id,
    session?.status,
    session?.sync_patient,
    session?.sync_ventilator,
    session?.candidate_can_edit_patient,
    session?.candidate_can_edit_ventilator,
    session?.sync_alarms,
    session?.candidate_can_edit_alarms,
    session?.alarms_silent,
    session?.candidate_can_edit_waveforms,
    session?.allow_oesophageal_pressure,
    session?.show_patient_effort,
    patient,
    ventilator,
    alarmLimits,
    patientTransitionSeconds,
    simulationPaused,
    localRuntimeConnection,
  ])

  useEffect(() => {
    if (localCheckpointTimerRef.current != null) window.clearInterval(localCheckpointTimerRef.current)
    if (role !== 'instructor' || !session?.id || localRuntimeConnection !== 'connected') return
    publishLocalRuntimeSnapshot(session)
    localCheckpointTimerRef.current = window.setInterval(() => publishLocalRuntimeSnapshot(), 5000)
    return () => {
      if (localCheckpointTimerRef.current != null) window.clearInterval(localCheckpointTimerRef.current)
      localCheckpointTimerRef.current = null
    }
  }, [role, session?.id, localRuntimeConnection])

'''
assert anchor in hook
hook = hook.replace(anchor, lan_effects + anchor, 1)

# Unmount LAN cleanup.
old = """  useEffect(() => () => {\n    void closeTeachingSessionChannel(channelRef.current)\n    void closeTeachingSessionChannel(membersChannelRef.current)\n  }, [])\n"""
new = """  useEffect(() => () => {\n    localTransportRef.current?.disconnect()\n    if (localCheckpointTimerRef.current != null) window.clearInterval(localCheckpointTimerRef.current)\n    void closeTeachingSessionChannel(channelRef.current)\n    void closeTeachingSessionChannel(membersChannelRef.current)\n  }, [])\n"""
assert old in hook
hook = hook.replace(old, new, 1)

# Return LAN runtime API for scenario engine/UI.
needle = """    connection,\n    session,\n"""
assert needle in hook
hook = hook.replace(needle, """    connection,\n    localRuntimeConnection,\n    localRuntimeUrl,\n    session,\n""", 1)
needle = """    updatePolicy,\n    broadcastNow,\n"""
assert needle in hook
hook = hook.replace(needle, """    updatePolicy,\n    broadcastNow,\n    broadcastRuntimeEvent,\n    subscribeRuntimeEvents,\n""", 1)

hook_path.write_text(hook)

# App passes LAN runtime status to SessionPanel.
app_path = root / 'src/App.tsx'
app = app_path.read_text()
needle = """            connection={teachingSession.connection}\n            session={teachingSession.session}\n"""
assert needle in app
app = app.replace(needle, """            connection={teachingSession.connection}\n            localRuntimeConnection={teachingSession.localRuntimeConnection}\n            localRuntimeUrl={teachingSession.localRuntimeUrl}\n            session={teachingSession.session}\n""", 1)
app_path.write_text(app)

# Session panel displays the cloud and LAN paths separately.
panel_path = root / 'src/components/SessionPanel.tsx'
panel = panel_path.read_text()
panel = panel.replace("import type { SessionConnection, SessionRole } from '../session/useTeachingSession'\n", "import type { SessionConnection, SessionRole } from '../session/useTeachingSession'\nimport type { LocalRuntimeConnection } from '../session/localRuntimeTransport'\n", 1)
needle = """  connection: SessionConnection\n  session: TeachingSessionRow | null\n"""
assert needle in panel
panel = panel.replace(needle, """  connection: SessionConnection\n  localRuntimeConnection: LocalRuntimeConnection\n  localRuntimeUrl: string | null\n  session: TeachingSessionRow | null\n""", 1)

anchor = "function hasVentilatorSettings(value: SessionMemberRow['ventilator_settings']): value is VentilatorSettings {\n"
helper = r'''function LocalRuntimeBadge({ connection, url }: { connection: LocalRuntimeConnection; url: string | null }) {
  if (connection === 'disabled') return null
  const label = connection === 'connected'
    ? 'LAN live'
    : connection === 'connecting'
      ? 'LAN connecting…'
      : connection === 'reconnecting'
        ? 'LAN reconnecting…'
        : 'LAN unavailable'
  return <span className={`local-runtime-badge ${connection}`} title={url ?? 'Local runtime relay'}><i />{label}</span>
}

'''
assert anchor in panel
panel = panel.replace(anchor, helper + anchor, 1)

needle = """  connection,\n  session,\n"""
assert needle in panel
panel = panel.replace(needle, """  connection,\n  localRuntimeConnection,\n  localRuntimeUrl,\n  session,\n""", 1)

# Instructor and candidate headings.
needle = """            <ConnectionBadge connection={connection} />\n            <button className=\"panel-collapse-button\""""
assert needle in panel
panel = panel.replace(needle, """            <ConnectionBadge connection={connection} />\n            <LocalRuntimeBadge connection={localRuntimeConnection} url={localRuntimeUrl} />\n            <button className=\"panel-collapse-button\"""", 1)
needle = """        <ConnectionBadge connection={connection} />\n      </div>\n      <div className=\"candidate-session-summary\">\n"""
assert needle in panel
panel = panel.replace(needle, """        <div className=\"session-transport-badges\">\n          <ConnectionBadge connection={connection} />\n          <LocalRuntimeBadge connection={localRuntimeConnection} url={localRuntimeUrl} />\n        </div>\n      </div>\n      <div className=\"candidate-session-summary\">\n""", 1)
panel_path.write_text(panel)

# LAN badge styling.
css_path = root / 'src/session.css'
css = css_path.read_text()
css += r'''

/* v0.78 local-runtime transport */
.session-transport-badges {
  display: flex;
  align-items: center;
  gap: .45rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.local-runtime-badge {
  display: inline-flex;
  align-items: center;
  gap: .35rem;
  border: 1px solid rgb(118 197 155 / 28%);
  border-radius: 999px;
  padding: .24rem .5rem;
  background: rgb(65 132 98 / 11%);
  color: #a8cfba;
  font-size: .69rem;
  font-weight: 800;
  letter-spacing: .045em;
  text-transform: uppercase;
  white-space: nowrap;
}
.local-runtime-badge i {
  width: .48rem;
  height: .48rem;
  border-radius: 50%;
  background: #71848d;
  box-shadow: 0 0 0 2px rgb(113 132 141 / 15%);
}
.local-runtime-badge.connected { color: #baf2d2; border-color: rgb(82 216 143 / 42%); background: rgb(42 143 88 / 16%); }
.local-runtime-badge.connected i { background: #4fe08d; box-shadow: 0 0 0 2px rgb(79 224 141 / 17%), 0 0 10px rgb(79 224 141 / 38%); }
.local-runtime-badge.connecting i,
.local-runtime-badge.reconnecting i { background: #e4c05d; }
.local-runtime-badge.error { color: #f0abab; border-color: rgb(236 94 94 / 38%); background: rgb(135 39 39 / 16%); }
.local-runtime-badge.error i { background: #ef6666; }
'''
css_path.write_text(css)

# Local server operator notes.
docs = root / 'docs'
docs.mkdir(exist_ok=True)
(docs / 'local-teaching-server.md').write_text(r'''# EDUVENT local teaching server

EDUVENT can keep Supabase for authentication, session persistence and cloud fallback while moving the live instructor-to-candidate runtime path onto the local network.

## Start the server

From a checked-out EDUVENT repository:

```bash
npm install
npm run local
```

`npm run local` builds the current web app and starts a small HTTP/WebSocket server on port 4173. The terminal prints one localhost URL for the instructor and one or more LAN URLs for candidates.

The instructor should open the localhost URL. Candidates on the same Wi-Fi/LAN open the printed LAN URL. They still create/join the ordinary Supabase teaching session; once joined, EDUVENT automatically detects the local server and adds the **LAN live** runtime path.

## Runtime behaviour

- Candidate simulation, waveforms, alarms and ventilator response remain local in each browser.
- Instructor state snapshots are sent over the LAN immediately and checkpointed every 5 seconds.
- The relay assigns monotonically increasing sequence numbers and keeps a short replay buffer.
- A candidate that detects a sequence gap asks the server to replay missing messages. If replay is no longer possible, it receives the latest full snapshot.
- If the LAN relay disappears, the browser keeps the simulation running and Supabase remains the fallback transport.
- When the relay reconnects, the latest snapshot resynchronises the candidate.
- Supabase writes continue asynchronously, preserving the existing session record and remote-use capability.

## Dynamic scenarios

The transport already supports timestamped `scenario-event` envelopes in addition to full snapshots. `useTeachingSession()` exposes `broadcastRuntimeEvent(eventType, payload, scenarioTimeMs)` and `subscribeRuntimeEvents(listener)`. The dynamic-scenario engine can therefore be implemented above the transport without depending directly on either Supabase or WebSockets.

## Network/security notes

The local server binds to the LAN and is intended for a trusted classroom/simulation-centre network. Session routing uses the existing six-character teaching-session key. Do not expose port 4173 directly to the public internet. For remote teaching, continue using the cloud/Supabase path.
''')
