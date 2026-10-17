import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel, User } from '@supabase/supabase-js'
import {
  closeSessionPrompt,
  closeTeachingChannel,
  createTeachingLibraryItem,
  fetchActivePrompt,
  fetchPromptResponses,
  getPermanentTeachingAuthor,
  listTeachingLibraryItems,
  presentSessionPrompt,
  releaseSessionPromptAnswer,
  submitSessionPromptResponse,
  subscribeTeachingAuth,
  subscribeToTeachingPrompts,
  updateTeachingLibraryItem,
} from './repository'
import type {
  TeachingHostAdapter,
  TeachingLibraryDraft,
  TeachingLibraryItem,
  TeachingPromptDraft,
  TeachingPromptResponseRow,
  TeachingPromptRow,
  TeachingRole,
} from './types'

export function useTeachingPrompts(role: TeachingRole, sessionId: string | null, host?: TeachingHostAdapter) {
  const [activePrompt, setActivePrompt] = useState<TeachingPromptRow | null>(null)
  const [responses, setResponses] = useState<TeachingPromptResponseRow[]>([])
  const [myResponse, setMyResponse] = useState<TeachingPromptResponseRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const roleRef = useRef(role)

  useEffect(() => { roleRef.current = role }, [role])

  const refresh = async () => {
    if (!sessionId || roleRef.current === 'standalone') {
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
    void closeTeachingChannel(channelRef.current)
    channelRef.current = null

    if (!sessionId || role === 'standalone') {
      setActivePrompt(null)
      setResponses([])
      setMyResponse(null)
      return
    }

    void refresh()
    channelRef.current = subscribeToTeachingPrompts(sessionId, () => void refresh())
    return () => {
      void closeTeachingChannel(channelRef.current)
      channelRef.current = null
    }
  }, [role, sessionId])

  const presentPrompt = async (draft: TeachingPromptDraft) => {
    if (role !== 'instructor' || !sessionId) throw new Error('Start an instructor teaching session before presenting a prompt.')
    setBusy(true)
    setError(null)
    try {
      await presentSessionPrompt(sessionId, draft)
      host?.onPromptPresented?.(draft)
      await refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to present teaching prompt.'
      setError(message)
      throw cause
    } finally {
      setBusy(false)
    }
  }

  const closePrompt = async () => {
    if (role !== 'instructor' || !activePrompt) return
    setBusy(true)
    setError(null)
    try {
      await closeSessionPrompt(activePrompt.id)
      host?.onPromptClosed?.()
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to close teaching prompt.')
    } finally {
      setBusy(false)
    }
  }

  const releaseAnswer = async () => {
    if (role !== 'instructor' || !activePrompt || activePrompt.kind !== 'mcq' || activePrompt.answer_released_at) return
    setBusy(true)
    setError(null)
    try {
      await releaseSessionPromptAnswer(activePrompt.id)
      await refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to release the correct answer.'
      setError(message)
      throw cause
    } finally {
      setBusy(false)
    }
  }

  const submitResponse = async (optionId: string) => {
    if (role !== 'candidate' || !activePrompt || myResponse) return
    setBusy(true)
    setError(null)
    try {
      await submitSessionPromptResponse(activePrompt, optionId)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to submit response.')
    } finally {
      setBusy(false)
    }
  }

  return { activePrompt, responses, myResponse, busy, error, presentPrompt, closePrompt, releaseAnswer, submitResponse }
}

export function useTeachingQuestionLibrary(host: TeachingHostAdapter) {
  const [author, setAuthor] = useState<User | null>(null)
  const [items, setItems] = useState<TeachingLibraryItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const user = await getPermanentTeachingAuthor()
      setAuthor(user)
      if (!user) {
        setItems([])
        setError(null)
        return
      }
      setItems(await listTeachingLibraryItems())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load question library.')
    }
  }

  useEffect(() => {
    void refresh()
    return subscribeTeachingAuth(() => void refresh())
  }, [])

  const save = async (draft: TeachingLibraryDraft, existingId?: string | null) => {
    setBusy(true)
    setError(null)
    try {
      const item = existingId
        ? await updateTeachingLibraryItem(existingId, host.appId, draft)
        : await createTeachingLibraryItem(host.appId, draft)
      await refresh()
      return item
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to save question.'
      setError(message)
      throw cause
    } finally {
      setBusy(false)
    }
  }

  return { author, items, busy, error, refresh, save }
}
