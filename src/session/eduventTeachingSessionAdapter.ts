import type { AlarmLimits, CandidateAlarmLevel } from '../alarmTypes'
import type { PatientSettings, VentilatorSettings } from '../simulation/types'
import type { SharedTeachingSessionRepository } from '../teaching/session/types'
import {
  claimInstructorSession,
  closeTeachingSessionChannel,
  createTeachingSession,
  ensureAnonymousSession,
  fetchSessionMembers,
  fetchTeachingSession,
  findActiveInstructorSession,
  joinTeachingSession,
  subscribeToSessionMembers,
  subscribeToTeachingSession,
  touchInstructorSession,
  touchSessionMember,
  updateTeachingSession,
  type SessionMemberRow,
  type TeachingSessionRow,
} from './supabase'

export interface EduventTeachingSessionCreateInput {
  patient: PatientSettings
  ventilator: VentilatorSettings
  alarmLimits: AlarmLimits
  patientTransitionSeconds: number
  simulationPaused: boolean
}

export interface EduventTeachingMemberTelemetry {
  patient: PatientSettings
  ventilator: VentilatorSettings
  alarmLevel: CandidateAlarmLevel
}

export const eduventTeachingSessionRepository: SharedTeachingSessionRepository<
  TeachingSessionRow,
  SessionMemberRow,
  EduventTeachingSessionCreateInput,
  EduventTeachingMemberTelemetry
> = {
  ensureIdentity: ensureAnonymousSession,
  createSession: (input) => createTeachingSession(input.patient, input.ventilator, input.alarmLimits),
  joinSession: joinTeachingSession,
  fetchSession: fetchTeachingSession,
  updateSession: updateTeachingSession,
  findActiveInstructorSession,
  claimInstructorSession,
  touchInstructorSession,
  fetchMembers: fetchSessionMembers,
  touchMember: (sessionId, telemetry) => touchSessionMember(sessionId, telemetry.patient, telemetry.ventilator, telemetry.alarmLevel),
  subscribeSession: subscribeToTeachingSession,
  subscribeMembers: subscribeToSessionMembers,
  closeChannel: closeTeachingSessionChannel,
}
