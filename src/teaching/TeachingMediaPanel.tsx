import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createCaseMediaSignedUrl,
  deleteCaseMedia,
  listInstructorCaseMedia,
  listSessionCaseMedia,
  releaseSessionCaseMedia,
  uploadCaseMedia,
  withdrawSessionCaseMedia,
  type CaseMediaRow,
} from '../caseMedia'
import type { TeachingRole } from './types'
import { useTeachingMediaPresentation } from './TeachingMediaPresentation'
import { TeachingMediaLaserInstructorModal } from './TeachingMediaLaser'
import './TeachingMediaPanel.css'

interface TeachingMediaInstructorPanelProps {
  role: TeachingRole
  instructorAuthenticated: boolean
  sessionId: string | null
  scenarioMediaIds: string[]
  onScenarioMediaIdsChange: (ids: string[]) => void
}

function fileSizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 7h15M9 7V4.8h6V7M7.2 7l.7 12h8.2l.7-12M10 10.3v5.8M14 10.3v5.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function TeachingMediaInstructorPanel({ role, instructorAuthenticated, sessionId, scenarioMediaIds, onScenarioMediaIdsChange }: TeachingMediaInstructorPanelProps) {
  const [collapsed, setCollapsed] = useState(true)
  const [library, setLibrary] = useState<CaseMediaRow[]>([])
  const [releasedIds, setReleasedIds] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [uploadTitle, setUploadTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [mediaLaserOpen, setMediaLaserOpen] = useState(false)
  const liveMedia = useTeachingMediaPresentation(role, sessionId)

  const scenarioIds = useMemo(() => new Set(scenarioMediaIds), [scenarioMediaIds])
  const activeMediaId = liveMedia.activePresentation?.media_id ?? null
  const selected = library.find((item) => item.id === selectedId) ?? library[0] ?? null
  const previewUrl = selected ? signedUrls[selected.id] : undefined
  const working = busy || liveMedia.busy
  const selectedLive = Boolean(selected && activeMediaId === selected.id)
  const selectedAvailable = Boolean(selected && releasedIds.has(selected.id))
  const selectedInScenario = Boolean(selected && scenarioIds.has(selected.id))

  const refresh = useCallback(async () => {
    if (role === 'candidate' || !instructorAuthenticated) {
      setLibrary([])
      setReleasedIds(new Set())
      setError(null)
      return
    }
    try {
      const media = await listInstructorCaseMedia()
      setLibrary(media)
      if (!selectedId && media.length) setSelectedId(media[0].id)
      if (sessionId) {
        const sessionMedia = await listSessionCaseMedia(sessionId)
        setReleasedIds(new Set(sessionMedia.filter((row) => row.released).map((row) => row.media_id)))
      } else {
        setReleasedIds(new Set())
      }
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load media library.')
    }
  }, [role, instructorAuthenticated, selectedId, sessionId])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (!selected || signedUrls[selected.id]) return
    void createCaseMediaSignedUrl(selected.storage_path)
      .then((url) => setSignedUrls((current) => ({ ...current, [selected.id]: url })))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to preview media.'))
  }, [selected, signedUrls])

  useEffect(() => {
    if (!selectedLive) setMediaLaserOpen(false)
  }, [selectedLive])

  if (role === 'candidate') return null
  if (!instructorAuthenticated) return (
    <section className="teaching-media-panel teaching-account-required" aria-label="Media">
      <div className="teaching-media-heading teaching-media-heading-static"><span><strong>Media</strong></span></div>
      <div className="teaching-account-required-message"><strong>Instructor sign-in required</strong><span>Sign in to your instructor account to use the media library and present media to candidates.</span></div>
    </section>
  )

  const upload = async (file: File | null) => {
    if (!file) return
    setBusy(true); setError(null); setMessage(null)
    try {
      const media = await uploadCaseMedia(file, uploadTitle)
      setUploadTitle('')
      setSelectedId(media.id)
      setMessage(`Uploaded “${media.title}”.`)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to upload media.')
    } finally { setBusy(false) }
  }

  const present = async (media: CaseMediaRow) => {
    if (role !== 'instructor' || !sessionId) return
    setError(null); setMessage(null)
    try {
      await liveMedia.present(media.id)
      setMessage(`Presenting “${media.title}” to candidates.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to present media.')
    }
  }

  const stopPresenting = async () => {
    setError(null); setMessage(null)
    setMediaLaserOpen(false)
    try {
      await liveMedia.close()
      setMessage('Live media presentation stopped.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to stop presentation.')
    }
  }

  const toggleAvailable = async (media: CaseMediaRow) => {
    if (!sessionId || role !== 'instructor') return
    setBusy(true); setError(null); setMessage(null)
    try {
      if (releasedIds.has(media.id)) {
        await withdrawSessionCaseMedia(sessionId, media.id)
        setMessage(`“${media.title}” is no longer available in candidate Case media.`)
      } else {
        await releaseSessionCaseMedia(sessionId, media.id, releasedIds.size)
        setMessage(`“${media.title}” is now available in candidate Case media.`)
      }
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to change candidate media availability.')
    } finally { setBusy(false) }
  }

  const toggleScenario = (mediaId: string) => {
    onScenarioMediaIdsChange(scenarioIds.has(mediaId)
      ? scenarioMediaIds.filter((id) => id !== mediaId)
      : [...scenarioMediaIds, mediaId])
  }

  const remove = async (media: CaseMediaRow) => {
    if (!window.confirm(`Delete “${media.title}” from your media library?`)) return
    setBusy(true); setError(null); setMessage(null)
    try {
      if (activeMediaId === media.id) await liveMedia.close()
      await deleteCaseMedia(media)
      onScenarioMediaIdsChange(scenarioMediaIds.filter((id) => id !== media.id))
      setSelectedId(null)
      setMessage(`Deleted “${media.title}”.`)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete media.')
    } finally { setBusy(false) }
  }

  return (
    <section className="teaching-media-panel" aria-label="Media">
      <div className="teaching-prompt-section-heading teaching-media-section-heading">
        <div><h3>Media</h3></div>
        <div className="teaching-prompt-heading-actions">
          {activeMediaId && <span className="teaching-prompt-live-badge">LIVE</span>}
          <button
            type="button"
            className={`teaching-workspace-collapse ${collapsed ? 'collapsed' : 'expanded'}`}
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand Media' : 'Collapse Media'}
          ><span className="teaching-collapse-caret" aria-hidden="true" /></button>
        </div>
      </div>

      {!collapsed && (
        <div className="teaching-media-body">
          <div className="teaching-media-upload-row">
            <input value={uploadTitle} maxLength={120} onChange={(event) => setUploadTitle(event.target.value)} placeholder="Optional media title" aria-label="Optional media title" />
            <label className={`teaching-media-upload ${working ? 'disabled' : ''}`}>
              <span>{working ? 'Working…' : '+ Add media'}</span>
              <input type="file" disabled={working} accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={(event) => {
                const input = event.currentTarget
                const file = input.files?.[0] ?? null
                void upload(file).finally(() => { input.value = '' })
              }} />
            </label>
          </div>

          {!sessionId && <small className="teaching-media-session-note">Start an instructor session to present media or make it available to candidates.</small>}

          <div className="teaching-media-library">
            <div className="teaching-media-list" role="listbox" aria-label="Media library">
              {library.length ? library.map((media) => {
                const live = activeMediaId === media.id
                const available = releasedIds.has(media.id)
                const inScenario = scenarioIds.has(media.id)
                return (
                  <button
                    key={media.id}
                    type="button"
                    role="option"
                    aria-selected={selected?.id === media.id}
                    className={`teaching-media-list-item ${selected?.id === media.id ? 'selected' : ''}`}
                    onClick={() => setSelectedId(media.id)}
                  >
                    <span className="teaching-media-kind">{media.media_kind === 'video' ? '▶' : '▣'}</span>
                    <span className="teaching-media-list-copy">
                      <strong>{media.title}</strong>
                      <small>{media.media_kind === 'video' ? 'Video' : 'Image'} · {fileSizeLabel(media.size_bytes)}</small>
                      {(live || available || inScenario) && (
                        <span className="teaching-media-badges">
                          {live && <em className="live">LIVE</em>}
                          {available && <em>Available</em>}
                          {inScenario && <em>Scenario</em>}
                        </span>
                      )}
                    </span>
                  </button>
                )
              }) : <div className="teaching-media-empty">No media in your library yet.</div>}
            </div>

            <div className="teaching-media-preview">
              {selected ? (
                <>
                  <div className="teaching-media-preview-heading">
                    <strong>{selected.title}</strong>
                    <small>{selected.media_kind === 'video' ? 'Video' : 'Image'} · {fileSizeLabel(selected.size_bytes)}</small>
                  </div>
                  <div className="teaching-media-preview-stage">
                    {!previewUrl ? <span>Loading media…</span> : selected.media_kind === 'video'
                      ? <video key={previewUrl} src={previewUrl} controls playsInline preload="metadata" />
                      : <img src={previewUrl} alt={selected.title} />}
                  </div>
                </>
              ) : <span>Select a media item to preview it.</span>}
            </div>
          </div>

          {selected && (
            <div className="teaching-media-actions" aria-label={`Actions for ${selected.title}`}>
              {selectedLive
                ? <button type="button" className="danger" disabled={working} onClick={() => void stopPresenting()}>Stop presenting</button>
                : <button type="button" className="primary" disabled={working || role !== 'instructor' || !sessionId} onClick={() => void present(selected)}>Present</button>}
              {selectedLive && (
                <button type="button" disabled={working || !previewUrl || !sessionId} onClick={() => setMediaLaserOpen(true)}>Laser pointer</button>
              )}
              <button type="button" disabled={working || role !== 'instructor' || !sessionId} onClick={() => void toggleAvailable(selected)}>{selectedAvailable ? 'Remove availability' : 'Make available'}</button>
              <button type="button" disabled={working} onClick={() => toggleScenario(selected.id)}>{selectedInScenario ? 'Remove from scenario' : 'Add to scenario'}</button>
              <button type="button" className="delete-icon" disabled={working || selectedAvailable} onClick={() => void remove(selected)} aria-label={`Delete ${selected.title}`} title="Delete from media library"><TrashIcon /></button>
            </div>
          )}

          {message && <div className="teaching-media-message">{message}</div>}
          {(error || liveMedia.error) && <div className="teaching-media-error" role="alert">{error || liveMedia.error}</div>}
        </div>
      )}

      {mediaLaserOpen && selected && selectedLive && previewUrl && sessionId && (
        <TeachingMediaLaserInstructorModal
          sessionId={sessionId}
          media={selected}
          mediaUrl={previewUrl}
          onClose={() => setMediaLaserOpen(false)}
        />
      )}
    </section>
  )
}
