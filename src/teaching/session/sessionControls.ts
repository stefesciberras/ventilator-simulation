import type { RealtimeChannel } from '@supabase/supabase-js'
import type { SessionControlState } from '../../core/runtimeModes'
import { supabase } from '../../session/supabase'

export interface SessionControlSnapshot extends SessionControlState {
  pauseRevision: number
  waveformFreezeRevision: number
  alarmSilenceRevision: number
}

interface SessionControlRow {
  simulation_paused?: boolean | null
  pause_revision?: number | null
  waveforms_frozen?: boolean | null
  waveforms_freeze_revision?: number | null
  global_alarms_silenced?: boolean | null
  global_alarm_silence_revision?: number | null
}

export interface SessionControlPatch {
  waveformsFrozen?: boolean
  alarmsSilenced?: boolean
}

export const DEFAULT_SESSION_CONTROL_SNAPSHOT: SessionControlSnapshot = {
  paused: false,
  waveformsFrozen: false,
  alarmsSilenced: false,
  pauseRevision: 0,
  waveformFreezeRevision: 0,
  alarmSilenceRevision: 0,
}

export function sessionControlSnapshotFromRow(row: SessionControlRow | null | undefined): SessionControlSnapshot {
  if (!row) return { ...DEFAULT_SESSION_CONTROL_SNAPSHOT }
  return {
    paused: Boolean(row.simulation_paused),
    waveformsFrozen: Boolean(row.waveforms_frozen),
    alarmsSilenced: Boolean(row.global_alarms_silenced),
    pauseRevision: Number(row.pause_revision ?? 0),
    waveformFreezeRevision: Number(row.waveforms_freeze_revision ?? 0),
    alarmSilenceRevision: Number(row.global_alarm_silence_revision ?? 0),
  }
}

export async function fetchSessionControlSnapshot(sessionId: string): Promise<SessionControlSnapshot> {
  const { data, error } = await supabase
    .from('teaching_sessions')
    .select('simulation_paused,pause_revision,waveforms_frozen,waveforms_freeze_revision,global_alarms_silenced,global_alarm_silence_revision')
    .eq('id', sessionId)
    .single()
  if (error) throw error
  return sessionControlSnapshotFromRow(data as SessionControlRow)
}

export async function setInstructorGlobalSessionControls(sessionId: string, patch: SessionControlPatch): Promise<SessionControlSnapshot> {
  const { data, error } = await supabase.rpc('set_edusim_session_controls', {
    p_session_id: sessionId,
    p_waveforms_frozen: patch.waveformsFrozen ?? null,
    p_global_alarms_silenced: patch.alarmsSilenced ?? null,
  })
  if (error) throw error

  const result = (Array.isArray(data) ? data[0] : data) as SessionControlRow | null
  const current = await fetchSessionControlSnapshot(sessionId)
  if (!result) return current
  return {
    ...current,
    waveformsFrozen: Boolean(result.waveforms_frozen),
    waveformFreezeRevision: Number(result.waveforms_freeze_revision ?? current.waveformFreezeRevision),
    alarmsSilenced: Boolean(result.global_alarms_silenced),
    alarmSilenceRevision: Number(result.global_alarm_silence_revision ?? current.alarmSilenceRevision),
  }
}

export function subscribeSessionControlSnapshot(
  sessionId: string,
  listener: (snapshot: SessionControlSnapshot) => void,
): RealtimeChannel {
  return supabase
    .channel(`session-controls:${sessionId}:${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'teaching_sessions',
        filter: `id=eq.${sessionId}`,
      },
      (payload) => listener(sessionControlSnapshotFromRow(payload.new as SessionControlRow)),
    )
    .subscribe()
}

export async function closeSessionControlSubscription(channel: RealtimeChannel | null) {
  if (channel) await supabase.removeChannel(channel)
}
