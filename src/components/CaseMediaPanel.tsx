import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessionRole } from '../session/useTeachingSession'
import {
  closeCaseMediaChannel,
  createCaseMediaSignedUrl,
  deleteCaseMedia,
  listInstructorCaseMedia,
  listSessionCaseMedia,
  releaseSessionCaseMedia,
  subscribeToSessionCaseMedia,
  uploadCaseMedia,
  withdrawSessionCaseMedia,
  type CaseMediaRow,
  type SessionCaseMediaRow,
} from '../caseMedia'
import '../case-media.css'

interface CaseMediaPanelProps {
  role: SessionRole
  sessionId: string | null
  scenarioMediaIds: string[]
  onScenarioMediaIdsChange: (ids: string[]) => void
}

function MediaIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <path d="m6.5 17 4.3-4.2 2.7 2.5 2.2-2 2.8 3.7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon() {
  return <span aria-hidden="true">×</span>
}

function fileSizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function mediaLabel(media: CaseMediaRow) {
  return `${media.media_kind === 'video' ? 'Video' : 'Image'} · ${fileSizeLabel(media.size_bytes)}`
}

export function CaseMediaPanel({ role, sessionId, scenarioMediaIds, onScenarioMediaIdsChange }: CaseMediaPanelProps) {
  const [open, setOpen] = useState(false)
  const [library, setLibrary] = useState<CaseMediaRow[]>([])
  const [sessionMedia, setSessionMedia] = useState<SessionCaseMediaRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [uploadTitle, setUploadTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const previousReleasedRef = useRef<Set<string>>(new Set())
  const firstSessionRefreshRef = useRef(true)

  const releasedRows = useMemo(() => sessionMedia.filter((row) => row.released), [sessionMedia])
  const releasedIds = useMemo(() => new Set(releasedRows.map((row) => row.media_id)), [releasedRows])
  const scenarioIds = useMemo(() => new Set(scenarioMediaIds), [scenarioMediaIds])

  const availableMedia = useMemo(() => {
    if (role === 'candidate') return releasedRows.map((row) => row.media)
    const attached = library.filter((media) => scenarioIds.has(media.id))
    const others = library.filter((media) => !scenarioIds.has(media.id))
    return [...attached, ...others]
  }, [library, releasedRows, role, scenarioIds])

  const selectedMedia = useMemo(
    () => availableMedia.find((media) => media.id === selectedId) ?? availableMedia[0] ?? null,
    [availableMedia, selectedId],
  )

  const ensureSignedUrl = useCallback(async (media: CaseMediaRow) => {
    if (signedUrls[media.id]) return signedUrls[media.id]
    const signedUrl = await createCaseMediaSignedUrl(media.storage_path)
    setSignedUrls((current) => ({ ...current, [media.id]: signedUrl }))
    return signedUrl
  }, [signedUrls])

  const refreshLibrary = useCallback(async () => {
    if (role === 'candidate') return
    try {
      const rows = await listInstructorCaseMedia()
      setLibrary(rows)
    } catch (cause) {
      setLibrary([])
      setError(cause instanceof Error ? cause.message : 'Unable to load case media.')
    }
  }, [role])

  const refreshSessionMedia = useCallback(async () => {
    if (!sessionId) {
      setSessionMedia([])
      previousReleasedRef.current = new Set()
      firstSessionRefreshRef.current = true
      return
    }
    try {
      const rows = await listSessionCaseMedia(sessionId)
      setSessionMedia(rows)
      const nextReleased = new Set(rows.filter((row) => row.released).map((row) => row.media_id))
      if (role === 'candidate') {
        const previous = previousReleasedRef.current
        const hasNewRelease = [...nextReleased].some((id) => !previous.has(id))
        if ((firstSessionRefreshRef.current && nextReleased.size > 0) || hasNewRelease) setOpen(true)
      }
      previousReleasedRef.current = nextReleased
      firstSessionRefreshRef.current = false
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load released case media.')
    }
  }, [role, sessionId])

  useEffect(() => {
    if (!sessionId) return
    void refreshSessionMedia()
    const channel = subscribeToSessionCaseMedia(sessionId, () => { void refreshSessionMedia() })
    return () => { void closeCaseMediaChannel(channel) }
  }, [refreshSessionMedia, sessionId])

  useEffect(() => {
    if (!open) return
    setError(null)
    setMessage(null)
    if (role !== 'candidate') void refreshLibrary()
    if (sessionId) void refreshSessionMedia()
  }, [open, refreshLibrary, refreshSessionMedia, role, sessionId])

  useEffect(() => {
    if (!open || !selectedMedia) return
    void ensureSignedUrl(selectedMedia).catch((cause) => {
      setError(cause instanceof Error ? cause.message : 'Unable to open this media item.')
    })
  }, [ensureSignedUrl, open, selectedMedia])

  useEffect(() => {
    if (!availableMedia.length) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !availableMedia.some((media) => media.id === selectedId)) {
      setSelectedId(availableMedia[0].id)
    }
  }, [availableMedia, selectedId])

  const toggleScenarioMedia = (mediaId: string) => {
    if (scenarioIds.has(mediaId)) {
      onScenarioMediaIdsChange(scenarioMediaIds.filter((id) => id !== mediaId))
    } else {
      onScenarioMediaIdsChange([...scenarioMediaIds, mediaId])
    }
  }

  const upload = async (file: File | null) => {
    if (!file) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const media = await uploadCaseMedia(file, uploadTitle)
      setUploadTitle('')
      setMessage(`Uploaded “${media.title}”. It remains hidden until you release it.`)
      await refreshLibrary()
      setSelectedId(media.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to upload case media.')
    } finally {
      setBusy(false)
    }
  }

  const release = async (media: CaseMediaRow) => {
    if (!sessionId) return
    setBusy(true)
    setError(null)
    try {
      await releaseSessionCaseMedia(sessionId, media.id, releasedRows.length)
      setMessage(`Released “${media.title}” to candidates.`)
      await refreshSessionMedia()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to release case media.')
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async (media: CaseMediaRow) => {
    if (!sessionId) return
    setBusy(true)
    setError(null)
    try {
      await withdrawSessionCaseMedia(sessionId, media.id)
      setMessage(`Withdrew “${media.title}” from candidates.`)
      await refreshSessionMedia()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to withdraw case media.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (media: CaseMediaRow) => {
    if (!window.confirm(`Delete “${media.title}” from your media library? Scenarios that reference it will no longer be able to display it.`)) return
    setBusy(true)
    setError(null)
    try {
      await deleteCaseMedia(media)
      onScenarioMediaIdsChange(scenarioMediaIds.filter((id) => id !== media.id))
      setSignedUrls((current) => {
        const next = { ...current }
        delete next[media.id]
        return next
      })
      setMessage(`Deleted “${media.title}”.`)
      await refreshLibrary()
      if (sessionId) await refreshSessionMedia()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete case media.')
    } finally {
      setBusy(false)
    }
  }

  const badgeCount = role === 'candidate' ? releasedRows.length : (role === 'instructor' ? releasedRows.length : scenarioMediaIds.length)
  const previewUrl = selectedMedia ? signedUrls[selectedMedia.id] : undefined

  return (
    <>
      <button
        type="button"
        className={`top-account-button case-media-top-button ${badgeCount ? 'has-media' : ''}`}
        title="Case media"
        aria-label={`Open case media${badgeCount ? ` (${badgeCount})` : ''}`}
        onClick={() => setOpen(true)}
      >
        <MediaIcon />
        {badgeCount > 0 && <span className="case-media-badge">{badgeCount > 9 ? '9+' : badgeCount}</span>}
      </button>

      {open && (
        <div className="case-media-backdrop" onMouseDown={() => setOpen(false)}>
          <section className="case-media-dialog" role="dialog" aria-modal="true" aria-label="Case media" onMouseDown={(event) => event.stopPropagation()}>
            <div className="case-media-heading">
              <div>
                <span>{role === 'candidate' ? 'Case information' : 'Instructor case media'}</span>
                <h2>Case media</h2>
              </div>
              <button type="button" className="case-media-close" onClick={() => setOpen(false)} aria-label="Close case media"><CloseIcon /></button>
            </div>

            {role !== 'candidate' && (
              <div className="case-media-upload">
                <div>
                  <strong>Media library</strong>
                  <small>Images and short video clips · maximum 25 MB per file</small>
                </div>
                <input value={uploadTitle} maxLength={120} onChange={(event) => setUploadTitle(event.target.value)} placeholder="Optional title, e.g. Admission CXR" aria-label="Media title" />
                <label className={`case-media-upload-button ${busy ? 'disabled' : ''}`}>
                  <span>{busy ? 'Working…' : 'Upload media'}</span>
                  <input
                    type="file"
                    disabled={busy}
                    accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                    onChange={(event) => {
                      const input = event.currentTarget
                      const file = input.files?.[0] ?? null
                      void upload(file).finally(() => { input.value = '' })
                    }}
                  />
                </label>
              </div>
            )}

            <div className="case-media-layout">
              <div className="case-media-list" role="list">
                {availableMedia.length ? availableMedia.map((media) => {
                  const attached = scenarioIds.has(media.id)
                  const released = releasedIds.has(media.id)
                  return (
                    <article key={media.id} className={`case-media-item ${selectedMedia?.id === media.id ? 'selected' : ''}`} role="listitem">
                      <button type="button" className="case-media-item-main" onClick={() => setSelectedId(media.id)}>
                        <span className="case-media-kind">{media.media_kind === 'video' ? '▶' : '▣'}</span>
                        <span><strong>{media.title}</strong><small>{mediaLabel(media)}</small></span>
                      </button>
                      {role !== 'candidate' && (
                        <div className="case-media-item-tags">
                          {attached && <em>Scenario</em>}
                          {released && <em className="released">Released</em>}
                        </div>
                      )}
                      {role !== 'candidate' && (
                        <div className="case-media-item-actions">
                          <button type="button" disabled={busy} onClick={() => toggleScenarioMedia(media.id)}>{attached ? 'Remove from scenario' : 'Add to scenario'}</button>
                          {role === 'instructor' && sessionId && (
                            released
                              ? <button type="button" disabled={busy} onClick={() => void withdraw(media)}>Withdraw</button>
                              : <button type="button" className="release" disabled={busy} onClick={() => void release(media)}>Release</button>
                          )}
                          <button type="button" className="delete" disabled={busy || released} onClick={() => void remove(media)}>Delete</button>
                        </div>
                      )}
                    </article>
                  )
                }) : (
                  <div className="case-media-empty">
                    {role === 'candidate'
                      ? 'The instructor has not released any case media yet.'
                      : 'No media in your library yet. Upload a CXR, CT image, ultrasound clip, ABG photo or other case material.'}
                  </div>
                )}
              </div>

              <div className="case-media-preview">
                {selectedMedia ? (
                  <>
                    <div className="case-media-preview-title">
                      <div><span>{selectedMedia.media_kind === 'video' ? 'Video' : 'Image'}</span><strong>{selectedMedia.title}</strong></div>
                      <small>{selectedMedia.file_name}</small>
                    </div>
                    <div className="case-media-preview-stage">
                      {!previewUrl ? (
                        <div className="case-media-loading">Loading media…</div>
                      ) : selectedMedia.media_kind === 'video' ? (
                        <video key={previewUrl} src={previewUrl} controls playsInline preload="metadata" />
                      ) : (
                        <img src={previewUrl} alt={selectedMedia.title} />
                      )}
                    </div>
                    {role === 'instructor' && sessionId && (
                      <button type="button" className={releasedIds.has(selectedMedia.id) ? 'case-media-withdraw-main' : 'case-media-release-main'} disabled={busy} onClick={() => void (releasedIds.has(selectedMedia.id) ? withdraw(selectedMedia) : release(selectedMedia))}>
                        {releasedIds.has(selectedMedia.id) ? 'Withdraw from candidates' : 'Release to candidates'}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="case-media-preview-placeholder">Select a media item to preview it.</div>
                )}
              </div>
            </div>

            {role !== 'candidate' && scenarioMediaIds.length > 0 && (
              <div className="case-media-scenario-note">{scenarioMediaIds.length} media item{scenarioMediaIds.length === 1 ? '' : 's'} attached to the current scenario state. Saving or updating a scenario preserves these references.</div>
            )}
            {message && <div className="case-media-message">{message}</div>}
            {error && <div className="case-media-error" role="alert">{error}</div>}
          </section>
        </div>
      )}
    </>
  )
}
