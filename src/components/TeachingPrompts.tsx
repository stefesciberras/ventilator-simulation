import { useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { SessionRole } from '../session/useTeachingSession'
import { supabase } from '../session/supabase'
import './teaching-prompts.css'

export type TeachingPromptKind = 'message' | 'mcq' | 'poll'

export interface TeachingPromptOption {
  id: string
  text: string
}

export interface TeachingPromptRow {
  id: string
  session_id: string
  instructor_id: string
  kind: TeachingPromptKind
  title: string | null
  body: string
  options: TeachingPromptOption[]
  status: 'active' | 'closed'
  created_at: string
  closed_at: string | null
}

export interface TeachingPromptResponseRow {
  id: string
  prompt_id: string
  session_id: string
  user_id: string
  option_id: string
  created_at: string
}

interface PresentTeachingPromptInput {
  kind: TeachingPromptKind
  title?: string
  body: string
  options?: TeachingPromptOption[]
}

async function fetchActivePrompt(sessionId: string): Promise<TeachingPromptRow | null> {
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

async function fetchPromptResponses(promptId: string): Promise<TeachingPromptResponseRow[]> {
  const { data, error } = await supabase
    .from('teaching_prompt_responses')
    .select('*')
    .eq('prompt_id', promptId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as TeachingPromptResponseRow[]
}

export function useTeachingPrompts(role: SessionRole, sessionId: string | null) {
  const [activePrompt, setActivePrompt] = useState<TeachingPromptRow | null>(null)
  const [responses, setResponses] = useState<TeachingPromptResponseRow[]>([])
  const [myResponse, setMyResponse] = useState<TeachingPromptResponseRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const promptChannelRef = useRef<RealtimeChannel | null>(null)
  const responseChannelRef = useRef<RealtimeChannel | null>(null)
  const roleRef = useRef(role)

  useEffect(() => { roleRef.current = role }, [role])

  const refresh = async () => {
    if (!sessionId || role === 'standalone') {
      setActivePrompt(null)
      setResponses([])
      setMyResponse(null)
      return
    }
    try {
      const prompt = await fetchActivePrompt(sessionId)
      setActivePrompt(prompt)
      if (!prompt) {
        setResponses([])
        setMyResponse(null)
        return
      }
      const nextResponses = await fetchPromptResponses(prompt.id)
      if (roleRef.current === 'instructor') {
        setResponses(nextResponses)
        setMyResponse(null)
      } else {
        setResponses([])
        setMyResponse(nextResponses[0] ?? null)
      }
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load teaching prompt.')
    }
  }

  useEffect(() => {
    void supabase.removeChannel(promptChannelRef.current as RealtimeChannel).catch(() => undefined)
    void supabase.removeChannel(responseChannelRef.current as RealtimeChannel).catch(() => undefined)
    promptChannelRef.current = null
    responseChannelRef.current = null

    if (!sessionId || role === 'standalone') {
      setActivePrompt(null)
      setResponses([])
      setMyResponse(null)
      return
    }

    void refresh()
    const instanceId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())
    promptChannelRef.current = supabase
      .channel(`eduvent-prompts-${sessionId}-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teaching_prompts', filter: `session_id=eq.${sessionId}` }, () => void refresh())
      .subscribe()
    responseChannelRef.current = supabase
      .channel(`eduvent-prompt-responses-${sessionId}-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teaching_prompt_responses', filter: `session_id=eq.${sessionId}` }, () => void refresh())
      .subscribe()

    return () => {
      if (promptChannelRef.current) void supabase.removeChannel(promptChannelRef.current)
      if (responseChannelRef.current) void supabase.removeChannel(responseChannelRef.current)
      promptChannelRef.current = null
      responseChannelRef.current = null
    }
  }, [role, sessionId])

  const presentPrompt = async (input: PresentTeachingPromptInput) => {
    if (role !== 'instructor' || !sessionId) return
    setBusy(true)
    setError(null)
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      const userId = authData.user?.id
      if (!userId) throw new Error('Instructor session is not authenticated.')
      const { error: closeError } = await supabase
        .from('teaching_prompts')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('session_id', sessionId)
        .eq('status', 'active')
      if (closeError) throw closeError
      const options = (input.options ?? []).map((option) => ({ id: option.id, text: option.text.trim() })).filter((option) => option.text)
      const { error: insertError } = await supabase.from('teaching_prompts').insert({
        session_id: sessionId,
        instructor_id: userId,
        kind: input.kind,
        title: input.title?.trim() || null,
        body: input.body.trim(),
        options,
        status: 'active',
      })
      if (insertError) throw insertError
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to present teaching prompt.')
    } finally {
      setBusy(false)
    }
  }

  const closePrompt = async () => {
    if (role !== 'instructor' || !activePrompt) return
    setBusy(true)
    setError(null)
    try {
      const { error: updateError } = await supabase
        .from('teaching_prompts')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', activePrompt.id)
      if (updateError) throw updateError
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to close teaching prompt.')
    } finally {
      setBusy(false)
    }
  }

  const submitResponse = async (optionId: string) => {
    if (role !== 'candidate' || !sessionId || !activePrompt || myResponse) return
    setBusy(true)
    setError(null)
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      const userId = authData.user?.id
      if (!userId) throw new Error('Candidate session is not authenticated.')
      const { error: insertError } = await supabase.from('teaching_prompt_responses').insert({
        prompt_id: activePrompt.id,
        session_id: sessionId,
        user_id: userId,
        option_id: optionId,
      })
      if (insertError) throw insertError
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to submit response.')
    } finally {
      setBusy(false)
    }
  }

  return { activePrompt, responses, myResponse, busy, error, presentPrompt, closePrompt, submitResponse }
}

function PromptPreview({ prompt }: { prompt: TeachingPromptRow }) {
  return (
    <div className="teaching-prompt-preview">
      <span className="teaching-prompt-kind">{prompt.kind === 'message' ? 'Information' : prompt.kind === 'mcq' ? 'MCQ · unmarked' : 'Poll'}</span>
      {prompt.title && <h4>{prompt.title}</h4>}
      <p>{prompt.body}</p>
      {prompt.options.length > 0 && (
        <div className="teaching-prompt-preview-options">
          {prompt.options.map((option, index) => <div key={option.id}><strong>{String.fromCharCode(65 + index)}.</strong> {option.text}</div>)}
        </div>
      )}
    </div>
  )
}

export function TeachingPromptInstructorPanel({
  role,
  activePrompt,
  responses,
  candidateCount,
  busy,
  error,
  onPresent,
  onClose,
}: {
  role: SessionRole
  activePrompt: TeachingPromptRow | null
  responses: TeachingPromptResponseRow[]
  candidateCount: number
  busy: boolean
  error: string | null
  onPresent: (input: PresentTeachingPromptInput) => Promise<void>
  onClose: () => Promise<void>
}) {
  const [kind, setKind] = useState<TeachingPromptKind>('mcq')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [options, setOptions] = useState(['', '', '', ''])
  if (role !== 'instructor') return null

  const counts = useMemo(() => {
    const result = new Map<string, number>()
    for (const response of responses) result.set(response.option_id, (result.get(response.option_id) ?? 0) + 1)
    return result
  }, [responses])

  const submit = async () => {
    const trimmedBody = body.trim()
    if (!trimmedBody) return
    const normalizedOptions = options.map((text, index) => ({ id: `opt-${index + 1}`, text: text.trim() })).filter((option) => option.text)
    if (kind !== 'message' && normalizedOptions.length < 2) return
    await onPresent({ kind, title, body: trimmedBody, options: kind === 'message' ? [] : normalizedOptions })
    setTitle('')
    setBody('')
    setOptions(['', '', '', ''])
  }

  return (
    <section className="teaching-prompt-instructor" aria-label="Teaching prompt">
      <div className="teaching-prompt-section-heading">
        <div><span className="session-kicker">Teaching interaction</span><h3>Question / poll</h3></div>
        {activePrompt && <span className="teaching-prompt-live-badge">LIVE</span>}
      </div>
      {activePrompt ? (
        <>
          <PromptPreview prompt={activePrompt} />
          {activePrompt.kind !== 'message' && (
            <div className="teaching-prompt-results">
              <div className="teaching-prompt-response-summary"><strong>{responses.length}</strong> / {candidateCount} responses</div>
              {activePrompt.options.map((option, index) => {
                const count = counts.get(option.id) ?? 0
                const denominator = Math.max(1, responses.length)
                const percent = Math.round((count / denominator) * 100)
                return (
                  <div className="teaching-prompt-result-row" key={option.id}>
                    <span>{String.fromCharCode(65 + index)}</span>
                    <div><div className="teaching-prompt-result-track"><i style={{ width: `${percent}%` }} /></div><small>{option.text}</small></div>
                    <strong>{count}</strong>
                  </div>
                )
              })}
            </div>
          )}
          <button className="teaching-prompt-close" type="button" disabled={busy} onClick={() => void onClose()}>Close prompt</button>
        </>
      ) : (
        <div className="teaching-prompt-composer">
          <label>Type<select value={kind} onChange={(event) => setKind(event.target.value as TeachingPromptKind)}><option value="mcq">MCQ · unmarked</option><option value="poll">Poll</option><option value="message">Information</option></select></label>
          <label>Title <span>(optional)</span><input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. AutoPEEP recognition" /></label>
          <label>Prompt<textarea value={body} maxLength={4000} rows={4} onChange={(event) => setBody(event.target.value)} placeholder="Present the case, instruction or question…" /></label>
          {kind !== 'message' && (
            <div className="teaching-prompt-option-editor">
              {options.map((option, index) => (
                <label key={index}><span>{String.fromCharCode(65 + index)}</span><input value={option} maxLength={500} onChange={(event) => setOptions((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} placeholder={`Option ${String.fromCharCode(65 + index)}`} /></label>
              ))}
              {options.length < 6 && <button type="button" onClick={() => setOptions((current) => [...current, ''])}>+ option</button>}
              {options.length > 2 && <button type="button" onClick={() => setOptions((current) => current.slice(0, -1))}>− option</button>}
            </div>
          )}
          <button className="teaching-prompt-present" type="button" disabled={busy || !body.trim() || (kind !== 'message' && options.filter((value) => value.trim()).length < 2)} onClick={() => void submit()}>Present to candidates</button>
        </div>
      )}
      {error && <div className="teaching-prompt-error">{error}</div>}
    </section>
  )
}

export function TeachingPromptOverlay({
  role,
  prompt,
  myResponse,
  busy,
  error,
  onSubmit,
}: {
  role: SessionRole
  prompt: TeachingPromptRow | null
  myResponse: TeachingPromptResponseRow | null
  busy: boolean
  error: string | null
  onSubmit: (optionId: string) => Promise<void>
}) {
  const [selectedOptionId, setSelectedOptionId] = useState('')
  const [dismissedPromptId, setDismissedPromptId] = useState<string | null>(null)

  useEffect(() => {
    setSelectedOptionId('')
    setDismissedPromptId(null)
  }, [prompt?.id])

  if (role !== 'candidate' || !prompt || dismissedPromptId === prompt.id) return null
  const hasSubmitted = Boolean(myResponse)

  return (
    <div className="teaching-prompt-overlay" role="presentation">
      <section className="teaching-prompt-modal" role="dialog" aria-modal="true" aria-labelledby="teaching-prompt-title">
        <span className="teaching-prompt-kind">{prompt.kind === 'message' ? 'Instructor information' : prompt.kind === 'mcq' ? 'Question' : 'Poll'}</span>
        <h2 id="teaching-prompt-title">{prompt.title || (prompt.kind === 'message' ? 'Teaching point' : 'Your response')}</h2>
        <p className="teaching-prompt-body">{prompt.body}</p>
        {prompt.kind !== 'message' && (
          <div className="teaching-prompt-candidate-options">
            {prompt.options.map((option, index) => {
              const selected = selectedOptionId === option.id || myResponse?.option_id === option.id
              return (
                <button key={option.id} type="button" className={selected ? 'selected' : ''} disabled={hasSubmitted || busy} onClick={() => setSelectedOptionId(option.id)}>
                  <strong>{String.fromCharCode(65 + index)}</strong><span>{option.text}</span>
                </button>
              )
            })}
          </div>
        )}
        {prompt.kind === 'message' ? (
          <button className="teaching-prompt-primary" type="button" onClick={() => setDismissedPromptId(prompt.id)}>Continue</button>
        ) : hasSubmitted ? (
          <div className="teaching-prompt-submitted"><strong>Response submitted</strong><span>Your answer has been sent to the instructor.</span><button type="button" onClick={() => setDismissedPromptId(prompt.id)}>Return to simulator</button></div>
        ) : (
          <button className="teaching-prompt-primary" type="button" disabled={!selectedOptionId || busy} onClick={() => void onSubmit(selectedOptionId)}>Submit response</button>
        )}
        {error && <div className="teaching-prompt-error">{error}</div>}
      </section>
    </div>
  )
}
