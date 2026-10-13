import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { PatientSettings, VentilatorSettings } from '../simulation/types'
import type { AlarmLimits, CandidateAlarmLevel } from '../alarmTypes'
import {
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

export type SessionRole = 'standalone' | 'instructor' | 'candidate'
export type SessionConnection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

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
}

interface PolicyPatch {
  syncPatient?: boolean
  syncVentilator?: boolean
  candidateCanEditPatient?: boolean
  candidateCanEditVentilator?: boolean
  syncAlarms?: boolean
  candidateCanEditAlarms?: boolean
  alarmsSilent?: boolean
}

function getPauseButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('.top-simulation-pause')
}

function isSimulationPausedInDom(): boolean {
  return Boolean(getPauseButton()?.classList.contains('paused'))
}

function setSimulationPausedInDom(paused: boolean) {
  const button = getPauseButton()
  if (!button) return
  const current = button.classList.contains('paused')
  if (current !== paused) button.click()
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
}: UseTeachingSessionArgs) {
  const [role, setRole] = useState<SessionRole>('standalone')
  const [connection, setConnection] = useState<SessionConnection>('idle')
  const [session, setSession] = useState<TeachingSessionRow | null>(null)
  const [members, setMembers] = useState<SessionMemberRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [recoverableInstructor, setRecoverableInstructor] = useState<{ sessionId: string; sessionKey: string } | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const membersChannelRef = useRef<RealtimeChannel | null>(null)
  const roleRef = useRef<SessionRole>('standalone')
  const sessionRef = useRef<TeachingSessionRow | null>(null)
  const patientRef = useRef(patient)
  const ventilatorRef = useRef(ventilator)
  const alarmLimitsRef = useRef(alarmLimits)
  const alarmLevelRef = useRef<CandidateAlarmLevel>(candidateAlarmLevel)
  const patientRevisionRef = useRef(0)
  const ventilatorRevisionRef = useRef(0)
  const alarmRevisionRef = useRef(0)
  const pauseRevisionRef = useRef(0)
  const suppressPatientBroadcastRef = useRef(false)
  const suppressVentilatorBroadcastRef = useRef(false)
  const patientBroadcastTimerRef = useRef<number | null>(null)
  const ventilatorBroadcastTimerRef = useRef<number | null>(null)
  const pauseBroadcastTimerRef = useRef<number | null>(null)
  const telemetryTimerRef = useRef<number | null>(null)
  const instructorHeartbeatRef = useRef<number | null>(null)
  const instructorClientIdRef = useRef<string | null>(null)

  const storeSession = (next: TeachingSessionRow | null) => {
    sessionRef.current = next
    setSession(next)
  }

  useEffect(() => { roleRef.current = role }, [role])
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { patientRef.current = patient }, [patient])
  useEffect(() => { ventilatorRef.current = ventilator }, [ventilator])
  useEffect(() => { alarmLimitsRef.current = alarmLimits }, [alarmLimits])
  useEffect(() => { alarmLevelRef.current = candidateAlarmLevel }, [candidateAlarmLevel])

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

    if (pauseChanged) setSimulationPausedInDom(Boolean(next.simulation_paused))

    patientRevisionRef.current = Math.max(patientRevisionRef.current, nextPatientRevision)
    ventilatorRevisionRef.current = Math.max(ventilatorRevisionRef.current, nextVentilatorRevision)
    alarmRevisionRef.current = Math.max(alarmRevisionRef.current, nextAlarmRevision)
    pauseRevisionRef.current = Math.max(pauseRevisionRef.current, nextPauseRevision)
  }

  const refreshMembers = async (sessionId: string) => {
    try {
      const nextMembers = await fetchSessionMembers(sessionId)
      if (sessionRef.current?.id === sessionId || roleRef.current === 'instructor') setMembers(nextMembers)
    } catch {
      // Session updates remain usable even if the dashboard member refresh fails transiently.
    }
  }

  const attachMemberSubscription = async (sessionId: string) => {
    await closeTeachingSessionChannel(membersChannelRef.current)
    await refreshMembers(sessionId)
    membersChannelRef.current = subscribeToSessionMembers(sessionId, () => {
      void refreshMembers(sessionId)
    })
  }

  const attachSubscription = async (sessionId: string) => {
    await closeTeachingSessionChannel(channelRef.current)
    channelRef.current = subscribeToTeachingSession(
      sessionId,
      (next) => {
        storeSession(next)
        if (roleRef.current === 'candidate') {
          if (next.status === 'ended') {
            setConnection('idle')
            setError('The instructor ended this teaching session.')
            void closeTeachingSessionChannel(channelRef.current)
            roleRef.current = 'standalone'
            setRole('standalone')
            return
          }
          applyCandidateSession(next)
        }
      },
      async (status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('connected')
          try {
            const fresh = await fetchTeachingSession(sessionId)
            storeSession(fresh)
            if (roleRef.current === 'candidate') applyCandidateSession(fresh)
          } catch {
            // The realtime stream remains active; the next database update will resynchronise state.
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnection('reconnecting')
        } else if (status === 'CLOSED' && roleRef.current !== 'standalone') {
          setConnection('reconnecting')
        }
      },
    )
  }

  const startInstructor = async () => {
    setConnection('connecting')
    setError(null)
    try {
      const created = await createTeachingSession(patient, ventilator, alarmLimits)
      roleRef.current = 'instructor'
      setRole('instructor')
      let row = await fetchTeachingSession(created.sessionId)
      const clientId = instructorClientIdRef.current ?? crypto.randomUUID()
      instructorClientIdRef.current = clientId
      sessionStorage.setItem('eduvent.instructor-session-id', created.sessionId)
      sessionStorage.setItem('eduvent.instructor-client-id', clientId)
      await claimInstructorSession(created.sessionId, clientId)
      patientRevisionRef.current = Number(row.patient_revision ?? 0)
      ventilatorRevisionRef.current = Number(row.ventilator_revision ?? 0)
      alarmRevisionRef.current = Number(row.alarm_revision ?? 0)
      pauseRevisionRef.current = Number(row.pause_revision ?? 0)

      const localPaused = isSimulationPausedInDom()
      if (localPaused !== Boolean(row.simulation_paused)) {
        pauseRevisionRef.current += 1
        row = await updateTeachingSession(created.sessionId, {
          simulation_paused: localPaused,
          pause_revision: pauseRevisionRef.current,
        })
      }

      storeSession(row)
      await attachSubscription(created.sessionId)
      await attachMemberSubscription(created.sessionId)
      attachInstructorLease(created.sessionId, clientId)
      setRecoverableInstructor(null)
    } catch (cause) {
      setConnection('error')
      setError(cause instanceof Error ? cause.message : 'Unable to create instructor session.')
      roleRef.current = 'standalone'
      setRole('standalone')
    }
  }

  const joinCandidate = async (sessionKey: string, displayName: string) => {
    setConnection('connecting')
    setError(null)
    try {
      const joined = await joinTeachingSession(sessionKey, displayName)
      roleRef.current = 'candidate'
      setRole('candidate')
      const row = await fetchTeachingSession(joined.sessionId)
      patientRevisionRef.current = 0
      ventilatorRevisionRef.current = 0
      alarmRevisionRef.current = 0
      pauseRevisionRef.current = 0
      storeSession(row)
      applyCandidateSession(row, true)
      await touchSessionMember(joined.sessionId, patientRef.current, ventilatorRef.current, alarmLevelRef.current)
      await attachSubscription(joined.sessionId)
    } catch (cause) {
      setConnection('error')
      setError(cause instanceof Error ? cause.message : 'Unable to join teaching session.')
      roleRef.current = 'standalone'
      setRole('standalone')
    }
  }

  const attachInstructorLease = (sessionId: string, clientId: string) => {
    if (instructorHeartbeatRef.current != null) window.clearInterval(instructorHeartbeatRef.current)
    const heartbeat = () => {
      void touchInstructorSession(sessionId, clientId).catch((cause) => {
        setConnection('error')
        setError(cause instanceof Error ? cause.message : 'Instructor control lease was lost.')
      })
    }
    heartbeat()
    instructorHeartbeatRef.current = window.setInterval(heartbeat, 10000)
  }

  const resumeInstructor = async (sessionId?: string) => {
    setConnection('connecting')
    setError(null)
    try {
      await ensureAnonymousSession()
      const found = sessionId ? { sessionId, sessionKey: '' } : await findActiveInstructorSession()
      if (!found) {
        setRecoverableInstructor(null)
        setConnection('idle')
        return
      }
      const clientId = sessionStorage.getItem('eduvent.instructor-client-id') ?? crypto.randomUUID()
      instructorClientIdRef.current = clientId
      await claimInstructorSession(found.sessionId, clientId)
      const row = await fetchTeachingSession(found.sessionId)
      roleRef.current = 'instructor'
      setRole('instructor')
      patientRevisionRef.current = Number(row.patient_revision ?? 0)
      ventilatorRevisionRef.current = Number(row.ventilator_revision ?? 0)
      alarmRevisionRef.current = Number(row.alarm_revision ?? 0)
      pauseRevisionRef.current = Number(row.pause_revision ?? 0)
      sessionStorage.setItem('eduvent.instructor-session-id', found.sessionId)
      sessionStorage.setItem('eduvent.instructor-client-id', clientId)
      storeSession(row)
      setRecoverableInstructor(null)
      await attachSubscription(found.sessionId)
      await attachMemberSubscription(found.sessionId)
      attachInstructorLease(found.sessionId, clientId)
    } catch (cause) {
      setConnection('error')
      setError(cause instanceof Error ? cause.message : 'Unable to rejoin instructor session.')
    }
  }

  useEffect(() => {
    const storedSessionId = sessionStorage.getItem('eduvent.instructor-session-id')
    if (storedSessionId) {
      void resumeInstructor(storedSessionId)
      return
    }
    void (async () => {
      try {
        const found = await findActiveInstructorSession()
        if (found && roleRef.current === 'standalone') setRecoverableInstructor(found)
      } catch {
        // No recoverable instructor session is a normal standalone state.
      }
    })()
  }, [])

  const leaveSession = async () => {
    if (patientBroadcastTimerRef.current != null) window.clearTimeout(patientBroadcastTimerRef.current)
    if (ventilatorBroadcastTimerRef.current != null) window.clearTimeout(ventilatorBroadcastTimerRef.current)
    if (pauseBroadcastTimerRef.current != null) window.clearTimeout(pauseBroadcastTimerRef.current)
    if (telemetryTimerRef.current != null) window.clearTimeout(telemetryTimerRef.current)
    if (instructorHeartbeatRef.current != null) window.clearInterval(instructorHeartbeatRef.current)
    await closeTeachingSessionChannel(channelRef.current)
    await closeTeachingSessionChannel(membersChannelRef.current)
    channelRef.current = null
    membersChannelRef.current = null
    roleRef.current = 'standalone'
    setRole('standalone')
    storeSession(null)
    setMembers([])
    setConnection('idle')
    setError(null)
  }

  const endInstructorSession = async () => {
    const current = sessionRef.current
    if (roleRef.current === 'instructor' && current) {
      try {
        await updateTeachingSession(current.id, { status: 'ended' })
      } catch {
        // Leaving locally is still preferable to trapping the instructor in a broken session.
      }
    }
    sessionStorage.removeItem('eduvent.instructor-session-id')
    sessionStorage.removeItem('eduvent.instructor-client-id')
    instructorClientIdRef.current = null
    await leaveSession()
  }

  const updatePolicy = async (patch: PolicyPatch) => {
    const current = sessionRef.current
    if (roleRef.current !== 'instructor' || !current) return

    const databasePatch: Partial<TeachingSessionRow> = {}
    if (patch.syncPatient != null) databasePatch.sync_patient = patch.syncPatient
    if (patch.syncVentilator != null) databasePatch.sync_ventilator = patch.syncVentilator
    if (patch.candidateCanEditPatient != null) databasePatch.candidate_can_edit_patient = patch.candidateCanEditPatient
    if (patch.candidateCanEditVentilator != null) databasePatch.candidate_can_edit_ventilator = patch.candidateCanEditVentilator
    if (patch.syncAlarms != null) databasePatch.sync_alarms = patch.syncAlarms
    if (patch.candidateCanEditAlarms != null) databasePatch.candidate_can_edit_alarms = patch.candidateCanEditAlarms
    if (patch.alarmsSilent != null) databasePatch.alarms_silent = patch.alarmsSilent

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

    try {
      const next = await updateTeachingSession(current.id, databasePatch)
      storeSession(next)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update session permissions.')
    }
  }

  const broadcastNow = async () => {
    const current = sessionRef.current
    if (roleRef.current !== 'instructor' || !current) return
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
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to broadcast settings.')
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
        setError(null)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to broadcast patient settings.')
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
        setError(null)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to broadcast ventilator settings.')
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
        setError(null)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to broadcast alarm settings.')
      }
    }, 180)
    return () => window.clearTimeout(timer)
  }, [alarmLimits, role])

  useEffect(() => {
    if (role !== 'instructor' || !session?.id) return
    const button = getPauseButton()
    if (!button) return

    const publishPauseState = () => {
      if (pauseBroadcastTimerRef.current != null) window.clearTimeout(pauseBroadcastTimerRef.current)
      pauseBroadcastTimerRef.current = window.setTimeout(async () => {
        const latest = sessionRef.current
        if (!latest || roleRef.current !== 'instructor') return
        const paused = isSimulationPausedInDom()
        if (paused === Boolean(latest.simulation_paused)) return
        pauseRevisionRef.current = Math.max(pauseRevisionRef.current, Number(latest.pause_revision ?? 0)) + 1
        try {
          const next = await updateTeachingSession(latest.id, {
            simulation_paused: paused,
            pause_revision: pauseRevisionRef.current,
          })
          storeSession(next)
          setError(null)
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Unable to broadcast simulation pause state.')
        }
      }, 40)
    }

    const observer = new MutationObserver(publishPauseState)
    observer.observe(button, { attributes: true, attributeFilter: ['class'] })
    return () => {
      observer.disconnect()
      if (pauseBroadcastTimerRef.current != null) window.clearTimeout(pauseBroadcastTimerRef.current)
    }
  }, [role, session?.id])

  useEffect(() => {
    if (role !== 'candidate') return
    const button = getPauseButton()
    if (!button) return
    const protectInstructorPause = (event: MouseEvent) => {
      if (sessionRef.current?.simulation_paused && button.classList.contains('paused')) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    button.addEventListener('click', protectInstructorPause, true)
    return () => button.removeEventListener('click', protectInstructorPause, true)
  }, [role])

  // Realtime remains the fast path, but the teaching session row is authoritative.
  // Refreshing it once per second makes instructor pause/resume resilient to a
  // dropped postgres_changes notification without affecting candidate-local pause.
  useEffect(() => {
    if (role !== 'candidate' || !session?.id) return
    let active = true
    const sessionId = session.id

    const refreshAuthoritativeSession = async () => {
      try {
        const fresh = await fetchTeachingSession(sessionId)
        if (!active || roleRef.current !== 'candidate') return
        storeSession(fresh)
        if (fresh.status === 'ended') {
          setConnection('idle')
          setError('The instructor ended this teaching session.')
          roleRef.current = 'standalone'
          setRole('standalone')
          return
        }
        applyCandidateSession(fresh)
      } catch {
        // Realtime and the next refresh can recover independently.
      }
    }

    void refreshAuthoritativeSession()
    const timer = window.setInterval(() => void refreshAuthoritativeSession(), 1000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [role, session?.id])

  useEffect(() => {
    if (role !== 'candidate' || !session?.id) return
    const sendHeartbeat = () => {
      void touchSessionMember(session.id, patientRef.current, ventilatorRef.current, alarmLevelRef.current).catch(() => {
        // Realtime/session connectivity owns the visible connection state; telemetry may recover independently.
      })
    }
    sendHeartbeat()
    const timer = window.setInterval(sendHeartbeat, 10000)
    return () => window.clearInterval(timer)
  }, [role, session?.id])

  useEffect(() => {
    if (role !== 'candidate' || !session?.id) return
    if (telemetryTimerRef.current != null) window.clearTimeout(telemetryTimerRef.current)
    telemetryTimerRef.current = window.setTimeout(() => {
      void touchSessionMember(session.id, patient, ventilator, candidateAlarmLevel).catch(() => undefined)
    }, 500)
    return () => {
      if (telemetryTimerRef.current != null) window.clearTimeout(telemetryTimerRef.current)
    }
  }, [patient, ventilator, candidateAlarmLevel, role, session?.id])

  useEffect(() => () => {
    void closeTeachingSessionChannel(channelRef.current)
    void closeTeachingSessionChannel(membersChannelRef.current)
  }, [])

  const candidateVentilatorLocked = role === 'candidate' && Boolean(session?.sync_ventilator) && !Boolean(session?.candidate_can_edit_ventilator)
  const candidatePatientLocked = role === 'candidate' && Boolean(session?.sync_patient) && !Boolean(session?.candidate_can_edit_patient)
  const candidateAlarmsLocked = role === 'candidate' && Boolean(session?.sync_alarms) && !Boolean(session?.candidate_can_edit_alarms)
  const candidateAlarmsSilent = role === 'candidate' && Boolean(session?.sync_alarms) && Boolean(session?.alarms_silent)

  return {
    role,
    connection,
    session,
    members,
    error,
    candidateVentilatorLocked,
    candidatePatientLocked,
    candidateAlarmsLocked,
    candidateAlarmsSilent,
    recoverableInstructor,
    startInstructor,
    resumeInstructor,
    joinCandidate,
    leaveSession,
    endInstructorSession,
    updatePolicy,
    broadcastNow,
  }
}
