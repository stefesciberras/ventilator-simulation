import type { RealtimeChannel } from '@supabase/supabase-js'

export type SharedTeachingRole = 'standalone' | 'instructor' | 'candidate'
export type SharedTeachingConnection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'
export type SharedTeachingSessionStatus = 'active' | 'paused' | 'ended'

export interface SharedTeachingSessionRow {
  id: string
  session_key: string
  instructor_id: string
  created_at: string
  updated_at: string
  expires_at: string
  status: SharedTeachingSessionStatus
  instructor_client_id?: string | null
  instructor_last_seen?: string | null
}

export interface SharedTeachingMemberRow {
  id: string
  session_id: string
  user_id: string
  role: 'candidate' | 'instructor'
  display_name: string | null
  joined_at: string
  last_seen: string
}

export interface RecoverableTeachingCandidate {
  sessionKey: string
  displayName: string
  expiresAt: string
}

export interface RecoverableTeachingInstructor {
  sessionId: string
  sessionKey: string
}

export interface SharedTeachingSessionRepository<TSession extends SharedTeachingSessionRow, TMember extends SharedTeachingMemberRow, TCreateInput, TMemberTelemetry> {
  ensureIdentity: () => Promise<unknown>
  createSession: (input: TCreateInput) => Promise<{ sessionId: string; sessionKey: string }>
  joinSession: (sessionKey: string, displayName?: string) => Promise<{ sessionId: string; status: SharedTeachingSessionStatus }>
  fetchSession: (sessionId: string) => Promise<TSession>
  updateSession: (sessionId: string, patch: Partial<TSession>) => Promise<TSession>
  findActiveInstructorSession: () => Promise<RecoverableTeachingInstructor | null>
  claimInstructorSession: (sessionId: string, clientId: string) => Promise<void>
  touchInstructorSession: (sessionId: string, clientId: string) => Promise<void>
  fetchMembers: (sessionId: string) => Promise<TMember[]>
  touchMember: (sessionId: string, telemetry: TMemberTelemetry) => Promise<void>
  subscribeSession: (sessionId: string, onUpdate: (session: TSession) => void, onStatus: (status: string) => void) => RealtimeChannel
  subscribeMembers: (sessionId: string, onChange: () => void) => RealtimeChannel
  closeChannel: (channel: RealtimeChannel | null) => Promise<void>
}

export type SharedSessionRowSource = 'start' | 'resume' | 'join' | 'subscription' | 'refresh' | 'runtime' | 'host-update'

export interface SharedTeachingSessionHostHooks<TSession extends SharedTeachingSessionRow, TCreateInput> {
  prepareInstructorSession?: (row: TSession, input: TCreateInput | null, phase: 'start' | 'resume') => Promise<TSession | void> | TSession | void
  onSessionRow?: (row: TSession, role: Exclude<SharedTeachingRole, 'standalone'>, source: SharedSessionRowSource, force: boolean) => void
  onSessionCleared?: (previousRole: SharedTeachingRole) => void
}
