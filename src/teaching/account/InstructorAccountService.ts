import type { User } from '@supabase/supabase-js'
import { supabase } from '../../session/supabase'

export function isPermanentInstructor(user: User | null | undefined): user is User {
  if (!user) return false
  const anonymous = Boolean((user as User & { is_anonymous?: boolean }).is_anonymous)
  return !anonymous && Boolean(user.email)
}

export async function getInstructorAccount(): Promise<User | null> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!sessionData.session) return null
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
  if (current.user && !isPermanentInstructor(current.user)) await supabase.auth.signOut()

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: window.location.origin },
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

export async function requireInstructorAccount() {
  const user = await getInstructorAccount()
  if (!user) throw new Error('Sign in to an instructor account first.')
  return user
}
