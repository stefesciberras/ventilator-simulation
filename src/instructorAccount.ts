import type { User } from '@supabase/supabase-js'
import type { AlarmLimits } from './alarmTypes'
import type { PatientSettings, VentilatorSettings } from './simulation/types'
import { supabase } from './session/supabase'

export type ScenarioWaveform = 'volume' | 'co2' | 'oesophagealPressure'

export interface InstructorScenarioSnapshot {
  ventilator: VentilatorSettings
  patient: PatientSettings
  alarmLimits: AlarmLimits
  patientTransitionSeconds: number
  waveformDisplay: {
    third: ScenarioWaveform
    fourth: ScenarioWaveform | null
  }
}

export interface InstructorPresetRow {
  id: string
  instructor_id: string
  name: string
  scenario: InstructorScenarioSnapshot
  created_at: string
  updated_at: string
}

export function isPermanentInstructor(user: User | null | undefined): user is User {
  if (!user) return false
  const anonymous = Boolean((user as User & { is_anonymous?: boolean }).is_anonymous)
  return !anonymous && Boolean(user.email)
}

export async function getInstructorAccount(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return isPermanentInstructor(data.user) ? data.user : null
}

export function subscribeToInstructorAccount(onChange: (user: User | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    onChange(isPermanentInstructor(session?.user) ? session!.user : null)
  })
  return () => data.subscription.unsubscribe()
}

export async function signInInstructor(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) throw error
  if (!isPermanentInstructor(data.user)) throw new Error('A permanent instructor account was not returned.')
  return data.user
}

export async function createInstructorAccount(email: string, password: string) {
  const { data: current } = await supabase.auth.getUser()
  if (current.user && !isPermanentInstructor(current.user)) {
    // EDUVENT creates anonymous identities for teaching rooms. Account creation
    // is a deliberate switch to a permanent instructor identity.
    await supabase.auth.signOut()
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: window.location.origin,
    },
  })
  if (error) throw error
  return {
    user: isPermanentInstructor(data.user) ? data.user : null,
    confirmationRequired: data.session == null,
  }
}

export async function signOutInstructor() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

async function requirePermanentInstructor() {
  const user = await getInstructorAccount()
  if (!user) throw new Error('Sign in to an instructor account first.')
  return user
}

export async function listInstructorPresets(): Promise<InstructorPresetRow[]> {
  const user = await requirePermanentInstructor()
  const { data, error } = await supabase
    .from('instructor_presets')
    .select('*')
    .eq('instructor_id', user.id)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as InstructorPresetRow[]
}

export async function createInstructorPreset(name: string, scenario: InstructorScenarioSnapshot) {
  const user = await requirePermanentInstructor()
  const cleanName = name.trim()
  if (!cleanName) throw new Error('Enter a scenario name.')
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('instructor_presets')
    .insert({
      instructor_id: user.id,
      name: cleanName,
      scenario,
      updated_at: now,
    })
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('You already have a scenario with that name.')
    throw error
  }
  return data as InstructorPresetRow
}

export async function deleteInstructorPreset(id: string) {
  const user = await requirePermanentInstructor()
  const { error } = await supabase
    .from('instructor_presets')
    .delete()
    .eq('id', id)
    .eq('instructor_id', user.id)
  if (error) throw error
}
