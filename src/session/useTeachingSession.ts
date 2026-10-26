import { useEffect, useRef, useState } from 'react'
import type { PatientSettings, VentilatorSettings } from '../simulation/types'
import type { AlarmLimits, CandidateAlarmLevel } from '../alarmTypes'
import type { SimulationSpeed } from '../simulationSpeed'
import type { LoppjuSimRuntimeMode, SimulationCommand } from '../core/runtimeModes'
import {
  getNegotiatedLocalSessionRuntimeMode,
  getPreferredLocalSessionRuntimeMode,
  publishLocalSimulationCommand,
  subscribeLocalRuntimePayload,
  subscribeLocalSessionRuntimeMode,
} from './localRuntimeTransport'
import {
  useTeachingSession as useTeachingSessionBase,
  type InstructorSessionInitialState,
} from './useTeachingSessionBase'

export type {
  SessionRole,
  SessionConnection,
  RuntimeTransportKind,
  RecoverableCandidateSession,
  InstructorSessionInitialState,
} from './useTeachingSessionBase'

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

function fingerprint(value: unknown) {
  try { return JSON.stringify(value) } catch { return '' }
}

function statePayload<T extends object>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object') return null
  const state = (payload as { state?: unknown }).state
  return state && typeof state === 'object' ? state as T : null
}

/**
 * Runtime-modes v2 wrapper.
 *
 * The mature Teaching implementation remains isolated in useTeachingSessionBase.
 * This layer adds the one-instructor/one-candidate Simulation contract only when
 * the local session negotiates `simulation`; Teaching therefore keeps its
 * existing candidate-local semantics unchanged.
 */
export function useTeachingSession(args: UseTeachingSessionArgs) {
  const base = useTeachingSessionBase(args)
  const [runtimeMode, setRuntimeMode] = useState<LoppjuSimRuntimeMode>('standalone')
  const actorIdRef = useRef(typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `candidate-${Date.now()}`)
  const canonicalPatientRef = useRef('')
  const canonicalVentilatorRef = useRef('')
  const canonicalAlarmRef = useRef('')
  const lastSentPatientRef = useRef('')
  const lastSentVentilatorRef = useRef('')
  const lastSentAlarmRef = useRef('')
  const patientCommandTimerRef = useRef<number | null>(null)
  const ventilatorCommandTimerRef = useRef<number | null>(null)
  const alarmCommandTimerRef = useRef<number | null>(null)

  const sessionId = base.session?.id ?? null

  useEffect(() => {
    if (base.role === 'standalone' || !sessionId) {
      setRuntimeMode('standalone')
      canonicalPatientRef.current = ''
      canonicalVentilatorRef.current = ''
      canonicalAlarmRef.current = ''
      return
    }

    const current = getNegotiatedLocalSessionRuntimeMode(sessionId)
    if (current) setRuntimeMode(current)
    return subscribeLocalSessionRuntimeMode(sessionId, setRuntimeMode)
  }, [base.role, sessionId])

  useEffect(() => {
    if (!sessionId) return
    return subscribeLocalRuntimePayload(sessionId, (payload) => {
      if (payload.type === 'snapshot') {
        canonicalPatientRef.current = fingerprint(payload.snapshot.patient)
        canonicalVentilatorRef.current = fingerprint(payload.snapshot.ventilator)
        canonicalAlarmRef.current = fingerprint(payload.snapshot.alarmLimits)
        return
      }

      if (payload.type !== 'command' || base.role !== 'instructor' || runtimeMode !== 'simulation') return
      const command = payload.command
      if (command.sessionId !== sessionId || command.product !== 'mv' || command.actorRole !== 'candidate') return

      if (command.type === 'patient.parameter.set') {
        const next = statePayload<PatientSettings>(command.payload)
        if (next) args.setPatient(next)
      } else if (command.type === 'device.parameter.set') {
        const next = statePayload<VentilatorSettings>(command.payload)
        if (next) args.setVentilator(next)
      } else if (command.type === 'alarm.set') {
        const next = statePayload<AlarmLimits>(command.payload)
        if (next) args.setAlarmLimits(next)
      } else if (command.type === 'simulation.pause.set') {
        const paused = (command.payload as { paused?: unknown } | null)?.paused
        if (typeof paused === 'boolean') args.setSimulationPaused(paused)
      }
    })
  }, [args, base.role, runtimeMode, sessionId])

  const sendCandidateCommand = (type: SimulationCommand['type'], payload: unknown) => {
    if (!sessionId || base.role !== 'candidate' || runtimeMode !== 'simulation' || base.localRuntimeConnection !== 'connected') return false
    const command: SimulationCommand = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      sessionId,
      actorId: actorIdRef.current,
      actorRole: 'candidate',
      type,
      product: 'mv',
      payload,
      simulationTime: Math.max(0, (base.scenarioClockSync?.elapsedMs ?? 0) / 1000),
      clientTime: Date.now(),
    }
    return publishLocalSimulationCommand(sessionId, command)
  }

  useEffect(() => {
    if (base.role !== 'candidate' || runtimeMode !== 'simulation' || base.candidatePatientLocked) return
    const next = fingerprint(args.patient)
    if (!canonicalPatientRef.current || next === canonicalPatientRef.current || next === lastSentPatientRef.current) return
    if (patientCommandTimerRef.current != null) window.clearTimeout(patientCommandTimerRef.current)
    patientCommandTimerRef.current = window.setTimeout(() => {
      lastSentPatientRef.current = next
      sendCandidateCommand('patient.parameter.set', { state: args.patient })
    }, 80)
    return () => { if (patientCommandTimerRef.current != null) window.clearTimeout(patientCommandTimerRef.current) }
  }, [args.patient, base.role, base.candidatePatientLocked, base.localRuntimeConnection, runtimeMode, sessionId])

  useEffect(() => {
    if (base.role !== 'candidate' || runtimeMode !== 'simulation' || base.candidateVentilatorLocked) return
    const next = fingerprint(args.ventilator)
    if (!canonicalVentilatorRef.current || next === canonicalVentilatorRef.current || next === lastSentVentilatorRef.current) return
    if (ventilatorCommandTimerRef.current != null) window.clearTimeout(ventilatorCommandTimerRef.current)
    ventilatorCommandTimerRef.current = window.setTimeout(() => {
      lastSentVentilatorRef.current = next
      sendCandidateCommand('device.parameter.set', { state: args.ventilator })
    }, 60)
    return () => { if (ventilatorCommandTimerRef.current != null) window.clearTimeout(ventilatorCommandTimerRef.current) }
  }, [args.ventilator, base.role, base.candidateVentilatorLocked, base.localRuntimeConnection, runtimeMode, sessionId])

  useEffect(() => {
    if (base.role !== 'candidate' || runtimeMode !== 'simulation' || base.candidateAlarmsLocked) return
    const next = fingerprint(args.alarmLimits)
    if (!canonicalAlarmRef.current || next === canonicalAlarmRef.current || next === lastSentAlarmRef.current) return
    if (alarmCommandTimerRef.current != null) window.clearTimeout(alarmCommandTimerRef.current)
    alarmCommandTimerRef.current = window.setTimeout(() => {
      lastSentAlarmRef.current = next
      sendCandidateCommand('alarm.set', { state: args.alarmLimits })
    }, 100)
    return () => { if (alarmCommandTimerRef.current != null) window.clearTimeout(alarmCommandTimerRef.current) }
  }, [args.alarmLimits, base.role, base.candidateAlarmsLocked, base.localRuntimeConnection, runtimeMode, sessionId])

  const startInstructor = async (initial?: InstructorSessionInitialState) => {
    await base.startInstructor(initial)
    if (getPreferredLocalSessionRuntimeMode() !== 'simulation') return
    // Conventional Simulation starts with one shared device state. Patient
    // physiology remains instructor-editable by default; candidates control the
    // clinical device and any explicitly candidate-accessible actions.
    await base.updatePolicy({
      syncPatient: true,
      syncVentilator: true,
      candidateCanEditPatient: false,
      candidateCanEditVentilator: true,
      candidateControlsVisible: true,
      syncAlarms: true,
      candidateCanEditAlarms: true,
    })
  }

  return {
    ...base,
    runtimeMode,
    startInstructor,
  }
}
