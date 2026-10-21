import type { RealtimeChannel, User } from '@supabase/supabase-js'
import { supabase } from '../session/supabase'
import type {
  TeachingLibraryDraft,
  TeachingLibraryItem,
  TeachingPromptDraft,
  TeachingPromptResponseRow,
  TeachingPromptRow,
} from './types'

function isPermanentInstructor(user: User | null | undefined): user is User {
  if (!user) return false
  const anonymous = Boolean((user as User & { is_anonymous?: boolean }).is_anonymous)
  return !anonymous && Boolean(user.email)
}

async function currentUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('No authenticated teaching-session user is available.')
  return data.user
}

export async function getPermanentTeachingAuthor(): Promise<User | null> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!sessionData.session) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return isPermanentInstructor(data.user) ? data.user : null
}

async function requirePermanentTeachingAuthor() {
  const user = await getPermanentTeachingAuthor()
  if (!user) throw new Error('Sign in to an instructor account to use the question library.')
  return user
}

export async function fetchActivePrompt(sessionId: string): Promise<TeachingPromptRow | null> {
  const { data, error } = await supabase
    .from('teaching_prompts')
    .select('*')
    .eq('session_id', sessionId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? data as TeachingPromptRow : null
}

export async function fetchPromptResponses(promptId: string): Promise<TeachingPromptResponseRow[]> {
  const { data, error } = await supabase
    .from('teaching_prompt_responses')
    .select('*')
    .eq('prompt_id', promptId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as TeachingPromptResponseRow[]
}

export async function presentSessionPrompt(sessionId: string, draft: TeachingPromptDraft) {
  const user = await currentUser()
  const { error: closeError } = await supabase
    .from('teaching_prompts')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('status', 'active')
  if (closeError) throw closeError

  const options = (draft.options ?? [])
    .map((option) => ({ id: option.id, text: option.text.trim() }))
    .filter((option) => option.text)

  const correctOptionId = draft.kind === 'mcq' ? draft.correctOptionId ?? null : null
  if (draft.kind === 'mcq' && (!correctOptionId || !options.some((option) => option.id === correctOptionId))) {
    throw new Error('Choose the correct answer before presenting this MCQ.')
  }

  const { data: prompt, error } = await supabase.from('teaching_prompts').insert({
    session_id: sessionId,
    instructor_id: user.id,
    kind: draft.kind,
    title: draft.title?.trim() || null,
    body: draft.body.trim(),
    options,
    status: 'active',
  }).select('id').single()
  if (error) throw error

  if (correctOptionId) {
    const { error: keyError } = await supabase.from('teaching_prompt_answer_keys').insert({
      prompt_id: prompt.id,
      session_id: sessionId,
      instructor_id: user.id,
      correct_option_id: correctOptionId,
      explanation: draft.explanation?.trim() || null,
    })
    if (keyError) {
      await supabase.from('teaching_prompts').delete().eq('id', prompt.id)
      throw keyError
    }
  }
}

export async function releaseSessionPromptAnswer(promptId: string) {
  const { data: answerKey, error: keyError } = await supabase
    .from('teaching_prompt_answer_keys')
    .select('correct_option_id')
    .eq('prompt_id', promptId)
    .single()
  if (keyError) throw keyError

  const { error } = await supabase
    .from('teaching_prompts')
    .update({
      released_correct_option_id: answerKey.correct_option_id,
      answer_released_at: new Date().toISOString(),
    })
    .eq('id', promptId)
    .eq('status', 'active')
  if (error) throw error
}

export async function closeSessionPrompt(promptId: string) {
  const { error } = await supabase
    .from('teaching_prompts')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', promptId)
  if (error) throw error
}

export async function submitSessionPromptResponse(prompt: TeachingPromptRow, optionId: string) {
  const user = await currentUser()
  const { error } = await supabase.from('teaching_prompt_responses').insert({
    prompt_id: prompt.id,
    session_id: prompt.session_id,
    user_id: user.id,
    option_id: optionId,
  })
  if (error) throw error
}

export function subscribeToTeachingPrompts(sessionId: string, onChange: () => void): RealtimeChannel {
  const instanceId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())
  return supabase
    .channel(`teaching-prompts-${sessionId}-${instanceId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teaching_prompts', filter: `session_id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teaching_prompt_responses', filter: `session_id=eq.${sessionId}` }, onChange)
    .subscribe()
}

export async function closeTeachingChannel(channel: RealtimeChannel | null) {
  if (!channel) return
  await supabase.removeChannel(channel)
}

export function subscribeTeachingAuth(onChange: () => void) {
  const { data } = supabase.auth.onAuthStateChange(() => onChange())
  return () => data.subscription.unsubscribe()
}

export async function listTeachingLibraryItems(environmentId?: string): Promise<TeachingLibraryItem[]> {
  const user = await requirePermanentTeachingAuthor()
  let query = supabase
    .from('teaching_library_items')
    .select('*')
    .eq('owner_id', user.id)
  if (environmentId) query = query.overlaps('environments', ['all', environmentId])
  const { data, error } = await query.order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as TeachingLibraryItem[]
}

export async function createTeachingLibraryItem(sourceApp: string, draft: TeachingLibraryDraft) {
  const user = await requirePermanentTeachingAuthor()
  const now = new Date().toISOString()
  const options = (draft.options ?? []).map((option) => ({ id: option.id, text: option.text.trim() })).filter((option) => option.text)
  const { data, error } = await supabase
    .from('teaching_library_items')
    .insert({
      owner_id: user.id,
      source_app: sourceApp,
      module: draft.module.trim() || 'General',
      environments: draft.environments?.length ? draft.environments : ['all'],
      kind: draft.kind,
      title: draft.title?.trim() || null,
      body: draft.body.trim(),
      options,
      correct_option_id: draft.correctOptionId || null,
      explanation: draft.explanation?.trim() || null,
      tags: (draft.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
      updated_at: now,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as TeachingLibraryItem
}

export async function updateTeachingLibraryItem(id: string, sourceApp: string, draft: TeachingLibraryDraft) {
  const user = await requirePermanentTeachingAuthor()
  const options = (draft.options ?? []).map((option) => ({ id: option.id, text: option.text.trim() })).filter((option) => option.text)
  const { data, error } = await supabase
    .from('teaching_library_items')
    .update({
      source_app: sourceApp,
      module: draft.module.trim() || 'General',
      environments: draft.environments?.length ? draft.environments : ['all'],
      kind: draft.kind,
      title: draft.title?.trim() || null,
      body: draft.body.trim(),
      options,
      correct_option_id: draft.correctOptionId || null,
      explanation: draft.explanation?.trim() || null,
      tags: (draft.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('*')
    .single()
  if (error) throw error
  return data as TeachingLibraryItem
}
