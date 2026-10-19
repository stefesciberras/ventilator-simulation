import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../session/supabase'
import { createCaseMediaSignedUrl, type CaseMediaRow } from '../caseMedia'
import type { TeachingRole } from './types'
import { TeachingMediaLaserCandidateLayer } from './TeachingMediaLaser'
import { sendTeachingBroadcast, subscribeTeachingBroadcast } from './teachingRealtimeBus'
import './teaching.css'
import './TeachingMediaPresentation.css'

const PRESENTATION_EVENT = 'teaching-media-presentation-state'

export interface TeachingMediaPresentationRow {
  id: string
  session_id: string
  instructor_id: string
  media_id: string
  status: 'active' | 'closed'
  created_at: string
  closed_at: string | null
  media: CaseMediaRow
}

async function fetchActivePresentation(sessionId: string): Promise<TeachingMediaPresentationRow | null> {
  const { data, error } = await supabase
    .from('teaching_media_presentations')
    .select('id, session_id, instructor_id, media_id, status, created_at, closed_at, media:case_media(*)')
    .eq('session_id', sessionId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as unknown as TeachingMediaPresentationRow | null
}

export function useTeachingMediaPresentation(role: TeachingRole, sessionId: string | null) {
  const [activePresentation, setActivePresentation] = useState<TeachingMediaPresentationRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!sessionId || role === 'standalone') {
      setActivePresentation(null)
      return
    }
    try {
      setActivePresentation(await fetchActivePresentation(sessionId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load live media.')
    }
  }, [role, sessionId])

  useEffect(() => {
    void refresh()
    if (!sessionId || role === 'standalone') return

    const unsubscribe = subscribeTeachingBroadcast(sessionId, PRESENTATION_EVENT, (payload) => {
      if (role !== 'candidate' || !payload || typeof payload !== 'object') return
      const state = payload as { active?: unknown }
      if (state.active === false) setActivePresentation(null)
      else if (state.active === true) void refresh()
    })

    const poll = role === 'candidate' ? window.setInterval(() => { void refresh() }, 1200) : null
    return () => {
      unsubscribe()
      if (poll != null) window.clearInterval(poll)
    }
  }, [refresh, role, sessionId])

  const present = useCallback(async (mediaId: string) => {
    if (role !== 'instructor' || !sessionId) return
    setBusy(true)
    setError(null)
    try {
      await supabase.from('teaching_media_presentations')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('session_id', sessionId)
        .eq('status', 'active')
      const { error: insertError } = await supabase.from('teaching_media_presentations').insert({
        session_id: sessionId,
        media_id: mediaId,
        status: 'active',
      })
      if (insertError) throw insertError
      await refresh()
      void sendTeachingBroadcast(sessionId, PRESENTATION_EVENT, { active: true, sentAt: Date.now() })
      window.setTimeout(() => { void sendTeachingBroadcast(sessionId, PRESENTATION_EVENT, { active: true, sentAt: Date.now() }) }, 180)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to present media.')
      throw cause
    } finally {
      setBusy(false)
    }
  }, [refresh, role, sessionId])

  const close = useCallback(async () => {
    if (role !== 'instructor' || !activePresentation || !sessionId) return
    setBusy(true)
    setError(null)
    try {
      const { error: updateError } = await supabase.from('teaching_media_presentations')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', activePresentation.id)
      if (updateError) throw updateError
      setActivePresentation(null)
      void sendTeachingBroadcast(sessionId, PRESENTATION_EVENT, { active: false, sentAt: Date.now() })
      window.setTimeout(() => { void sendTeachingBroadcast(sessionId, PRESENTATION_EVENT, { active: false, sentAt: Date.now() }) }, 150)
      window.setTimeout(() => { void sendTeachingBroadcast(sessionId, PRESENTATION_EVENT, { active: false, sentAt: Date.now() }) }, 450)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to close media presentation.')
      throw cause
    } finally {
      setBusy(false)
    }
  }, [activePresentation, refresh, role, sessionId])

  return { activePresentation, busy, error, present, close, refresh }
}

export function TeachingMediaCandidateOverlay({
  role,
  presentation,
}: {
  role: TeachingRole
  presentation: TeachingMediaPresentationRow | null
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [error, setError] = useState<string | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; baseLeft: number; baseTop: number; width: number; height: number } | null>(null)

  useEffect(() => {
    setUrl(null)
    setCollapsed(false)
    setPosition({ x: 0, y: 0 })
    setError(null)
    if (!presentation) return
    void createCaseMediaSignedUrl(presentation.media.storage_path, 3600)
      .then(setUrl)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to open media.'))
  }, [presentation?.id])

  if (role !== 'candidate' || !presentation) return null

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (window.innerWidth < 900 || (event.target as HTMLElement).closest('button, video, input')) return
    const panel = event.currentTarget.closest('.teaching-media-modal') as HTMLElement | null
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      baseLeft: rect.left - position.x,
      baseTop: rect.top - position.y,
      width: rect.width,
      height: rect.height,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || window.innerWidth < 900) return
    event.preventDefault()
    const margin = 12
    const x = drag.originX + event.clientX - drag.startX
    const y = drag.originY + event.clientY - drag.startY
    setPosition({
      x: Math.max(margin - drag.baseLeft, Math.min(window.innerWidth - margin - drag.baseLeft - drag.width, x)),
      y: Math.max(margin - drag.baseTop, Math.min(window.innerHeight - margin - drag.baseTop - drag.height, y)),
    })
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  if (collapsed) {
    return (
      <button type="button" className="teaching-prompt-reopen teaching-media-reopen" onClick={() => setCollapsed(false)}>
        <span>{presentation.media.media_kind === 'video' ? 'Video' : 'Image'}</span><strong>Show</strong>
      </button>
    )
  }

  return (
    <div className="teaching-media-overlay" role="presentation">
      <section className="teaching-media-modal" role="dialog" aria-modal="false" aria-label={presentation.media.title} style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
        <div className="teaching-media-header" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} title="Drag to move on wide screens">
          <div><span>Instructor media</span><strong>{presentation.media.title}</strong></div>
          <button type="button" onClick={() => setCollapsed(true)}>Hide</button>
        </div>
        <div className="teaching-media-stage">
          {!url && !error && <div className="teaching-media-loading">Loading media…</div>}
          {error && <div className="teaching-prompt-error">{error}</div>}
          {url && (
            <TeachingMediaLaserCandidateLayer
              sessionId={presentation.session_id}
              mediaId={presentation.media_id}
              mediaUrl={url}
              mediaKind={presentation.media.media_kind}
              title={presentation.media.title}
            />
          )}
        </div>
      </section>
    </div>
  )
}
