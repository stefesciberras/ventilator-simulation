import { useEffect, useRef, useState } from 'react'
import type { PatientSettings, VentilatorSettings } from '../simulation/types'
import type { AlarmLimits, CandidateAlarmLevel } from '../alarmTypes'
import {
  type SessionMemberRow,
  type TeachingSessionRow,
  updateTeachingSession,
} from './supabase'
import { useSharedTeachingSession, type SharedTeachingRole, type RecoverableTeachingCandidate } from '../teaching/session'
import { eduventTeachingSessionRepository, type EduventTeachingSessionCreateInput } from './eduventTeachingSessionAdapter'
import {
  LocalRuntimeTransport,
  getDefaultLocalRuntimeUrl,
  getLocalRuntimeProfile,
  type LocalRuntimeConnection,
  type LocalRuntimeEnvelope,
  type LocalRuntimeSnapshot,
} from './localRuntimeTransport'
import { WebRtcRuntimeTransport } from './webRtcRuntimeTransport'
import { appendScenarioLog } from '../diagnostics'
import { isSimulationSpeed, type SimulationSpeed } from '../simulationSpeed'

export type SessionRole = SharedTeachingRole
export type SessionConnection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'
export type RuntimeTransportKind = 'cloud' | 'webrtc' | 'local-server' | 'appliance'
export type RecoverableCandidateSession = RecoverableTeachingCandidate

export interface InstructorSessionInitialState {
  patient: PatientSettings
  ventilator: VentilatorSettings
  alarmLimits: AlarmLimits
  patientTransitionSeconds: number
}

interface UseTeachingSessionArgs {
  patient: PatientSettings
  ventilator: VentilatorSettings
  alarmLimits: AlarmLimits
  patientTransitionSeconds: number
  setPatient: (next: PatientSettings) => void
  setVentilator: (next: VentilatorSettings) => void
  setAlarmLimits: (next: AlarmLimits) => void
  setPatientTransitionSeconds: (seconds: number) => void
  candidateAlarmLevel: CandidateAlarmLevel
  simulationPaused: boolean
  setSimulationPaused: (paused: boolean) => void
  simulationSpeed: SimulationSpeed
  setSimulationSpeed: (speed: SimulationSpeed) => void
}

interface PolicyPatch {
  syncPatient?: boolean
  syncVentilator?: boolean
  candidateCanEditPatient?: boolean
  candidateCanEditVentilator?: boolean
  syncAlarms?: boolean
  candidateCanEditAlarms?: boolean
  alarmsSilent?: boolean
  candidateCanEditWaveforms?: boolean
  allowOesophagealPressure?: boolean
  showPatientEffort?: boolean
}

export function useTeachingSession({
  patient,
  ventilator,
  alarmLimits,
  patientTransitionSeconds,
  setPatient,
  setVentilator,
  setAlarmLimits,
  setPatientTransitionSeconds,
  candidateAlarmLevel,
  simulationPaused,
  setSimulationPaused,
  simulationSpeed,
  setSimulationSpeed,
}: UseTeachingSessionArgs) {
  const [hostError, setHostError] = useState<string | null>(null)
  const [localRuntimeConnection, setLocalRuntimeConnection] = useState<LocalRuntimeConnection>('disabled')
  const [localRuntimeUrl, setLocalRuntimeUrl] = useState<string | null>(() => getDefaultLocalRuntimeUrl())
  const [runtimeTransportKind, setRuntimeTransportKind] = useState<RuntimeTransportKind>(() => getDefaultLocalRuntimeUrl() ? getLocalRuntimeProfile() : 'webrtc')
  const [scenarioClockSync, setScenarioClockSync] = useState<{ elapsedMs: number; receivedAt: number; paused: boolean; speed: SimulationSpeed } | null>(null)
  const roleRef = useRef<SessionRole>('standalone')
  const sessionRef = useRef<TeachingSessionRow | null>(null)
  const patientRef = useRef(patient)
  const ventilatorRef = useRef(ventilator)
  const alarmLimitsRef = useRef(alarmLimits)
  const patientTransitionSecondsRef = useRef(patientTransitionSeconds)
  const alarmLevelRef = useRef<CandidateAlarmLevel>(candidateAlarmLevel)
  const simulationPausedRef = useRef(simulationPaused)
  const scenarioElapsedMsRef = useRef(0)
  const simulationSpeedRef = useRef<SimulationSpeed>(simulationSpeed)
  const patientRevisionRef = useRef(0)
  const ventilatorRevisionRef = useRef(0)
  const alarmRevisionRef = useRef(0)
  const pauseRevisionRef = useRef(0)
  const suppressPatientBroadcastRef = useRef(false)
  const suppressVentilatorBroadcastRef = useRef(false)
  const patientBroadcastTimerRef = useRef<number | null>(null)
  const ventilatorBroadcastTimerRef = useRef<number | null>(null)
  const pauseBroadcastTimerRef = useRef<number | null>(null)
  const instructorClientIdRef = useRef<string | null>(null)
  const localRuntimeConnectionRef = useRef<LocalRuntimeConnection>('disabled')
  const localTransportRef = useRef<LocalRuntimeTransport | WebRtcRuntimeTransport | null>(null)
  const localCheckpointTimerRef = useRef<number | null>(null)
  const runtimeEventListenersRef = useRef(new Set<(envelope: LocalRuntimeEnvelope) => void>())

  const applyCandidateSessionRef = useRef<(row: TeachingSessionRow, force?: boolean) => void>(() => undefined)

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

  const storeSession = (next: TeachingSessionRow) => {
    sessionRef.current = next
    teachingCore.replaceSession(next, 'host-update')
  }

  useEffect(() => { roleRef.current = role }, [role])
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { patientRef.current = patient }, [patient])
  useEffect(() => { ventilatorRef.current = ventilator }, [ventilator])
  useEffect(() => { alarmLimitsRef.current = alarmLimits }, [alarmLimits])
  useEffect(() => { patientTransitionSecondsRef.current = patientTransitionSeconds }, [patientTransitionSeconds])
  useEffect(() => { alarmLevelRef.current = candidateAlarmLevel }, [candidateAlarmLevel])
  useEffect(() => { simulationPausedRef.current = simulationPaused }, [simulationPaused])
  useEffect(() => { simulationSpeedRef.current = simulationSpeed }, [simulationSpeed])
  useEffect(() => { localRuntimeConnectionRef.current = localRuntimeConnection }, [localRuntimeConnection])

  useEffect(() => {
    if (role !== 'standalone') return
    simulationPausedRef.current = false
    setSimulationPaused(false)
    setSimulationSpeed(1)
    setScenarioClockSync(null)
  }, [role])

  const buildLocalRuntimeSnapshot = (row = sessionRef.current): LocalRuntimeSnapshot | null => {
    if (!row) return null
    return {
      sessionId: row.id,
      sessionKey: row.session_key,
      status: row.status,
      sentAt: Date.now(),
      scenarioElapsedMs: Math.max(0, Math.round(scenarioElapsedMsRef.current)),
      simulationSpeed: simulationSpeedRef.current,
      patient: patientRef.current,
      ventilator: ventilatorRef.current,
      alarmLimits: alarmLimitsRef.current,
      patientTransitionMs: Math.max(0, Math.round(patientTransitionSecondsRef.current * 1000)),
      simulationPaused: simulationPausedRef.current,
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
      void teachingCore.terminateRemote('The instructor ended this teaching session.')
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
    const runtimeSpeed = isSimulationSpeed(snapshot.simulationSpeed) ? snapshot.simulationSpeed : 1
    setSimulationSpeed(runtimeSpeed)
    if (typeof snapshot.scenarioElapsedMs === 'number' && Number.isFinite(snapshot.scenarioElapsedMs)) {
      setScenarioClockSync({
        elapsedMs: Math.max(0, snapshot.scenarioElapsedMs),
        receivedAt: Date.now(),
        paused: snapshot.simulationPaused,
        speed: runtimeSpeed,
      })
    }
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

    const clientId = nextRole === 'instructor'
      ? (instructorClientIdRef.current ?? crypto.randomUUID())
      : crypto.randomUUID()
    const callbacks = {
      role: nextRole,
      sessionKey: row.session_key,
      sessionId: row.id,
      clientId,
      onConnection: (state: LocalRuntimeConnection) => {
        localRuntimeConnectionRef.current = state
        setLocalRuntimeConnection(state)
        appendScenarioLog('runtime.connection', { role: nextRole, sessionId: row.id, sessionKey: row.session_key, state, transport: url ? getLocalRuntimeProfile() : 'webrtc' })
        if (state === 'connected') {
          if (roleRef.current !== 'standalone') teachingCore.setExternalConnection('connected')
          if (nextRole === 'instructor') window.setTimeout(() => publishLocalRuntimeSnapshot(), 0)
        }
      },
      onEnvelope: handleLocalRuntimeEnvelope,
    }

    const transport = url
      ? new LocalRuntimeTransport({ ...callbacks, url })
      : new WebRtcRuntimeTransport(callbacks)
    setRuntimeTransportKind(url ? getLocalRuntimeProfile() : 'webrtc')
    localTransportRef.current = transport
    transport.connect()
  }

  const broadcastRuntimeEvent = (eventType: string, payload: unknown, scenarioTimeMs: number) => {
    if (roleRef.current !== 'instructor') return false
    appendScenarioLog('scenario.runtime_event.broadcast', { sessionId: sessionRef.current?.id ?? null, eventType, scenarioTimeMs: Math.max(0, scenarioTimeMs) })
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

  const updateScenarioElapsedMs = (elapsedMs: number) => {
    if (!Number.isFinite(elapsedMs)) return
    scenarioElapsedMsRef.current = Math.max(0, elapsedMs)
  }

  const applyCandidateSession = (next: TeachingSessionRow, force = false) => {
    const nextPatientRevision = Number(next.patient_revision ?? 0)
    const nextVentilatorRevision = Number(next.ventilator_revision ?? 0)
    const nextAlarmRevision = Number(next.alarm_revision ?? 0)
    const nextPauseRevision = Number(next.pause_revision ?? 0)
    const patientChanged = force || nextPatientRevision > patientRevisionRef.current
    const ventilatorChanged = force || nextVentilatorRevision > ventilatorRevisionRef.current
    const alarmChanged = force || nextAlarmRevision > alarmRevisionRef.current
    const pauseChanged = force || nextPauseRevision > pauseRevisionRef.current

    if (next.sync_patient && next.patient_settings && patientChanged) {
      suppressPatientBroadcastRef.current = true
      setPatient(next.patient_settings)
      setPatientTransitionSeconds(Math.max(0, Math.round((next.transition_ms ?? 0) / 1000)))
      window.setTimeout(() => { suppressPatientBroadcastRef.current = false }, 0)
    }

    if (next.sync_ventilator && next.ventilator_settings && ventilatorChanged) {
      suppressVentilatorBroadcastRef.current = true
      setVentilator(next.ventilator_settings)
      window.setTimeout(() => { suppressVentilatorBroadcastRef.current = false }, 0)
    }

    if (next.sync_alarms && next.alarm_settings && alarmChanged) {
      setAlarmLimits(next.alarm_settings)
    }

    if (pauseChanged) setSimulationPaused(Boolean(next.simulation_paused))

    patientRevisionRef.current = Math.max(patientRevisionRef.current, nextPatientRevision)
    ventilatorRevisionRef.current = Math.max(ventilatorRevisionRef.current, nextVentilatorRevision)
    alarmRevisionRef.current = Math.max(alarmRevisionRef.current, nextAlarmRevision)
    pauseRevisionRef.current = Math.max(pauseRevisionRef.current, nextPauseRevision)
  }

  applyCandidateSessionRef.current = applyCandidateSession

  const startInstructor = async (initial?: InstructorSessionInitialState) => {
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

  const updatePolicy = async (patch: PolicyPatch) => {
    const current = sessionRef.current
    if (roleRef.current !== 'instructor' || !current) return
    appendScenarioLog('session.policy.update_requested', { sessionId: current.id, patch })

    const databasePatch: Partial<TeachingSessionRow> = {}
    if (patch.syncPatient != null) databasePatch.sync_patient = patch.syncPatient
    if (patch.syncVentilator != null) databasePatch.sync_ventilator = patch.syncVentilator
    if (patch.candidateCanEditPatient != null) databasePatch.candidate_can_edit_patient = patch.candidateCanEditPatient
    if (patch.candidateCanEditVentilator != null) databasePatch.candidate_can_edit_ventilator = patch.candidateCanEditVentilator
    if (patch.syncAlarms != null) databasePatch.sync_alarms = patch.syncAlarms
    if (patch.candidateCanEditAlarms != null) databasePatch.candidate_can_edit_alarms = patch.candidateCanEditAlarms
    if (patch.alarmsSilent != null) databasePatch.alarms_silent = patch.alarmsSilent
    if (patch.candidateCanEditWaveforms != null) databasePatch.candidate_can_edit_waveforms = patch.candidateCanEditWaveforms
    if (patch.allowOesophagealPressure != null) databasePatch.allow_oesophageal_pressure = patch.allowOesophagealPressure
    if (patch.showPatientEffort != null) databasePatch.show_patient_effort = patch.showPatientEffort

    if (patch.syncPatient === true && !current.sync_patient) {
      patientRevisionRef.current += 1
      databasePatch.patient_settings = patient
      databasePatch.patient_revision = patientRevisionRef.current
      databasePatch.transition_ms = patientTransitionSeconds * 1000
    }
    if (patch.syncVentilator === true && !current.sync_ventilator) {
      ventilatorRevisionRef.current += 1
      databasePatch.ventilator_settings = ventilator
      databasePatch.ventilator_revision = ventilatorRevisionRef.current
    }
    if (patch.syncAlarms === true && !current.sync_alarms) {
      alarmRevisionRef.current += 1
      databasePatch.alarm_settings = alarmLimits
      databasePatch.alarm_revision = alarmRevisionRef.current
    }

    const optimistic = { ...current, ...databasePatch, updated_at: new Date().toISOString() } as TeachingSessionRow
    storeSession(optimistic)
    publishLocalRuntimeSnapshot(optimistic)
    try {
      const next = await updateTeachingSession(current.id, databasePatch)
      storeSession(next)
      setHostError(null)
    } catch (cause) {
      setHostError(cause instanceof Error ? cause.message : 'Unable to update session permissions.')
    }
  }

  const broadcastNow = async () => {
    const current = sessionRef.current
    if (roleRef.current !== 'instructor' || !current) return
    appendScenarioLog('session.settings.push_requested', { sessionId: current.id, syncPatient: current.sync_patient, syncVentilator: current.sync_ventilator, syncAlarms: current.sync_alarms })
    publishLocalRuntimeSnapshot(current)
    const patch: Partial<TeachingSessionRow> = {}
    if (current.sync_patient) {
      patientRevisionRef.current += 1
      patch.patient_settings = patient
      patch.patient_revision = patientRevisionRef.current
      patch.transition_ms = patientTransitionSeconds * 1000
    }
    if (current.sync_ventilator) {
      ventilatorRevisionRef.current += 1
      patch.ventilator_settings = ventilator
      patch.ventilator_revision = ventilatorRevisionRef.current
    }
    if (current.sync_alarms) {
      alarmRevisionRef.current += 1
      patch.alarm_settings = alarmLimits
      patch.alarm_revision = alarmRevisionRef.current
    }
    if (!Object.keys(patch).length) return
    try {
      const next = await updateTeachingSession(current.id, patch)
      storeSession(next)
      setHostError(null)
    } catch (cause) {
      setHostError(cause instanceof Error ? cause.message : 'Unable to broadcast settings.')
    }
  }

  useEffect(() => {
    const current = sessionRef.current
    if (role !== 'instructor' || !current?.sync_patient || suppressPatientBroadcastRef.current) return
    if (patientBroadcastTimerRef.current != null) window.clearTimeout(patientBroadcastTimerRef.current)
    patientBroadcastTimerRef.current = window.setTimeout(async () => {
      const latest = sessionRef.current
      if (!latest || roleRef.current !== 'instructor' || !latest.sync_patient) return
      patientRevisionRef.current += 1
      try {
        const next = await updateTeachingSession(latest.id, {
          patient_settings: patient,
          patient_revision: patientRevisionRef.current,
          transition_ms: patientTransitionSeconds * 1000,
        })
        storeSession(next)
        setHostError(null)
      } catch (cause) {
        setHostError(cause instanceof Error ? cause.message : 'Unable to broadcast patient settings.')
      }
    }, 180)
    return () => {
      if (patientBroadcastTimerRef.current != null) window.clearTimeout(patientBroadcastTimerRef.current)
    }
  }, [patient, patientTransitionSeconds, role])

  useEffect(() => {
    const current = sessionRef.current
    if (role !== 'instructor' || !current?.sync_ventilator || suppressVentilatorBroadcastRef.current) return
    if (ventilatorBroadcastTimerRef.current != null) window.clearTimeout(ventilatorBroadcastTimerRef.current)
    ventilatorBroadcastTimerRef.current = window.setTimeout(async () => {
      const latest = sessionRef.current
      if (!latest || roleRef.current !== 'instructor' || !latest.sync_ventilator) return
      ventilatorRevisionRef.current += 1
      try {
        const next = await updateTeachingSession(latest.id, {
          ventilator_settings: ventilator,
          ventilator_revision: ventilatorRevisionRef.current,
        })
        storeSession(next)
        setHostError(null)
      } catch (cause) {
        setHostError(cause instanceof Error ? cause.message : 'Unable to broadcast ventilator settings.')
      }
    }, 180)
    return () => {
      if (ventilatorBroadcastTimerRef.current != null) window.clearTimeout(ventilatorBroadcastTimerRef.current)
    }
  }, [ventilator, role])

  useEffect(() => {
    const current = sessionRef.current
    if (role !== 'instructor' || !current?.sync_alarms) return
    const timer = window.setTimeout(async () => {
      const latest = sessionRef.current
      if (!latest || roleRef.current !== 'instructor' || !latest.sync_alarms) return
      alarmRevisionRef.current += 1
      try {
        const next = await updateTeachingSession(latest.id, {
          alarm_settings: alarmLimits,
          alarm_revision: alarmRevisionRef.current,
        })
        storeSession(next)
        setHostError(null)
      } catch (cause) {
        setHostError(cause instanceof Error ? cause.message : 'Unable to broadcast alarm settings.')
      }
    }, 180)
    return () => window.clearTimeout(timer)
  }, [alarmLimits, role])

  useEffect(() => {
    if (role !== 'instructor' || !session?.id) return
    if (pauseBroadcastTimerRef.current != null) window.clearTimeout(pauseBroadcastTimerRef.current)
    pauseBroadcastTimerRef.current = window.setTimeout(async () => {
      const latest = sessionRef.current
      if (!latest || roleRef.current !== 'instructor') return
      if (simulationPaused === Boolean(latest.simulation_paused)) return
      pauseRevisionRef.current = Math.max(pauseRevisionRef.current, Number(latest.pause_revision ?? 0)) + 1
      try {
        const next = await updateTeachingSession(latest.id, {
          simulation_paused: simulationPaused,
          pause_revision: pauseRevisionRef.current,
        })
        storeSession(next)
        setHostError(null)
        appendScenarioLog('session.pause_changed', { sessionId: latest.id, paused: simulationPaused, pauseRevision: pauseRevisionRef.current })
      } catch (cause) {
        setHostError(cause instanceof Error ? cause.message : 'Unable to broadcast simulation pause state.')
      }
    }, 40)
    return () => {
      if (pauseBroadcastTimerRef.current != null) window.clearTimeout(pauseBroadcastTimerRef.current)
    }
  }, [simulationPaused, role, session?.id])

  // The selected runtime transport (WebRTC, PC relay, or appliance relay) is the fast path.
  // Supabase remains the durable cloud copy and fallback transport.
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
    simulationSpeed,
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

  useEffect(() => () => {
    localTransportRef.current?.disconnect()
    if (localCheckpointTimerRef.current != null) window.clearInterval(localCheckpointTimerRef.current)
  }, [])

  const candidateVentilatorLocked = role === 'candidate' && Boolean(session?.sync_ventilator) && !Boolean(session?.candidate_can_edit_ventilator)
  const candidatePatientLocked = role === 'candidate' && Boolean(session?.sync_patient) && !Boolean(session?.candidate_can_edit_patient)
  const candidateAlarmsLocked = role === 'candidate' && Boolean(session?.sync_alarms) && !Boolean(session?.candidate_can_edit_alarms)
  const candidateAlarmsSilent = role === 'candidate' && Boolean(session?.sync_alarms) && Boolean(session?.alarms_silent)
  const candidateWaveformsLocked = role === 'candidate' && !Boolean(session?.candidate_can_edit_waveforms)
  const candidatePauseLocked = role === 'candidate' && Boolean(session?.simulation_paused)
  const candidateOesophagealPressureAllowed = role !== 'candidate' || session == null || Boolean(session.allow_oesophageal_pressure)
  const candidatePatientEffortVisible = role === 'candidate' && Boolean(session?.show_patient_effort)

  return {
    role,
    connection,
    localRuntimeConnection,
    localRuntimeUrl,
    runtimeTransportKind,
    scenarioClockSync,
    session,
    members,
    error,
    candidateVentilatorLocked,
    candidatePatientLocked,
    candidateAlarmsLocked,
    candidateAlarmsSilent,
    candidateWaveformsLocked,
    candidatePauseLocked,
    candidateOesophagealPressureAllowed,
    candidatePatientEffortVisible,
    recoverableInstructor,
    recoverableCandidate,
    startInstructor,
    resumeInstructor,
    joinCandidate,
    resumeCandidate,
    leaveSession,
    endInstructorSession,
    updatePolicy,
    broadcastNow,
    broadcastRuntimeEvent,
    subscribeRuntimeEvents,
    updateScenarioElapsedMs,
  }
}
