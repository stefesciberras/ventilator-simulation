import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { PatientSettings, VentilatorSettings } from '../simulation/types'
import {
  closeTeachingSessionChannel,
  createTeachingSession,
  fetchTeachingSession,
  joinTeachingSession,
  subscribeToTeachingSession,
  type TeachingSessionRow,
  updateTeachingSession,
} from './supabase'

export type SessionRole = 'standalone' | 'instructor' | 'candidate'
export type SessionConnection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

interface UseTeachingSessionArgs {
  patient: PatientSettings
  ventilator: VentilatorSettings
  patientTransitionSeconds: number
  setPatient: (next: PatientSettings) => void
  setVentilator: (next: VentilatorSettings) => void
  setPatientTransitionSeconds: (seconds: number) => void
}

interface PolicyPatch {
  syncPatient?: boolean
  syncVentilator?: boolean
  candidateCanEditPatient?: boolean
  candidateCanEditVentilator?: boolean
}

export function useTeachingSession({
  patient,
  ventilator,
  patientTransitionSeconds,
  setPatient,
  setVentilator,
  setPatientTransitionSeconds,
}: UseTeachingSessionArgs) {
  const [role, setRole] = useState<SessionRole>('standalone')
  const [connection, setConnection] = useState<SessionConnection>('idle')
  const [session, setSession] = useState<TeachingSessionRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const roleRef = useRef<SessionRole>('standalone')
  const sessionRef = useRef<TeachingSessionRow | null>(null)
  const patientRevisionRef = useRef(0)
  const ventilatorRevisionRef = useRef(0)
  const suppressPatientBroadcastRef = useRef(false)
  const suppressVentilatorBroadcastRef = useRef(false)
  const patientBroadcastTimerRef = useRef<number | null>(null)
  const ventilatorBroadcastTimerRef = useRef<number | null>(null)

  useEffect(() => { roleRef.current = role }, [role])
  useEffect(() => { sessionRef.current = session }, [session])

  const applyCandidateSession = (next: TeachingSessionRow) => {
    patientRevisionRef.current = Math.max(patientRevisionRef.current, Number(next.patient_revision ?? 0))
    ventilatorRevisionRef.current = Math.max(ventilatorRevisionRef.current, Number(next.ventilator_revision ?? 0))

    if (next.sync_patient && next.patient_settings) {
      suppressPatientBroadcastRef.current = true
      setPatient(next.patient_settings)
      setPatientTransitionSeconds(Math.max(0, Math.round((next.transition_ms ?? 0) / 1000)))
      window.setTimeout(() => { suppressPatientBroadcastRef.current = false }, 0)
    }

    if (next.sync_ventilator && next.ventilator_settings) {
      suppressVentilatorBroadcastRef.current = true
      setVentilator(next.ventilator_settings)
      window.setTimeout(() => { suppressVentilatorBroadcastRef.current = false }, 0)
    }
  }

  const attachSubscription = async (sessionId: string) => {
    await closeTeachingSessionChannel(channelRef.current)
    channelRef.current = subscribeToTeachingSession(
      sessionId,
      (next) => {
        setSession(next)
        if (roleRef.current === 'candidate') applyCandidateSession(next)
      },
      async (status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('connected')
          try {
            const fresh = await fetchTeachingSession(sessionId)
            setSession(fresh)
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
      const created = await createTeachingSession(patient, ventilator)
      roleRef.current = 'instructor'
      setRole('instructor')
      const row = await fetchTeachingSession(created.sessionId)
      patientRevisionRef.current = Number(row.patient_revision ?? 0)
      ventilatorRevisionRef.current = Number(row.ventilator_revision ?? 0)
      setSession(row)
      await attachSubscription(created.sessionId)
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
      patientRevisionRef.current = Number(row.patient_revision ?? 0)
      ventilatorRevisionRef.current = Number(row.ventilator_revision ?? 0)
      setSession(row)
      applyCandidateSession(row)
      await attachSubscription(joined.sessionId)
    } catch (cause) {
      setConnection('error')
      setError(cause instanceof Error ? cause.message : 'Unable to join teaching session.')
      roleRef.current = 'standalone'
      setRole('standalone')
    }
  }

  const leaveSession = async () => {
    if (patientBroadcastTimerRef.current != null) window.clearTimeout(patientBroadcastTimerRef.current)
    if (ventilatorBroadcastTimerRef.current != null) window.clearTimeout(ventilatorBroadcastTimerRef.current)
    await closeTeachingSessionChannel(channelRef.current)
    channelRef.current = null
    roleRef.current = 'standalone'
    setRole('standalone')
    setSession(null)
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

    try {
      const next = await updateTeachingSession(current.id, databasePatch)
      setSession(next)
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
    if (!Object.keys(patch).length) return
    try {
      const next = await updateTeachingSession(current.id, patch)
      setSession(next)
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
        setSession(next)
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
        setSession(next)
        setError(null)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to broadcast ventilator settings.')
      }
    }, 180)
    return () => {
      if (ventilatorBroadcastTimerRef.current != null) window.clearTimeout(ventilatorBroadcastTimerRef.current)
    }
  }, [ventilator, role])

  useEffect(() => () => {
    void closeTeachingSessionChannel(channelRef.current)
  }, [])

  const candidateVentilatorLocked = role === 'candidate' && Boolean(session?.sync_ventilator) && !Boolean(session?.candidate_can_edit_ventilator)
  const candidatePatientLocked = role === 'candidate' && Boolean(session?.sync_patient) && !Boolean(session?.candidate_can_edit_patient)

  return {
    role,
    connection,
    session,
    error,
    candidateVentilatorLocked,
    candidatePatientLocked,
    startInstructor,
    joinCandidate,
    leaveSession,
    endInstructorSession,
    updatePolicy,
    broadcastNow,
  }
}
