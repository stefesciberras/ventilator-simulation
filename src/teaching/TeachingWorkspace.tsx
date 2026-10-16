import { useEffect, useMemo, useState } from 'react'
import type {
  TeachingHostAdapter,
  TeachingLibraryDraft,
  TeachingLibraryItem,
  TeachingPromptDraft,
  TeachingPromptResponseRow,
  TeachingPromptRow,
  TeachingPromptKind,
  TeachingRole,
} from './types'
import './teaching.css'

function normaliseOptions(values: string[]) {
  return values
    .map((text, index) => ({ id: `opt-${index + 1}`, text: text.trim() }))
    .filter((option) => option.text)
}

function draftFromLibrary(item: TeachingLibraryItem) {
  return {
    kind: item.kind,
    title: item.title ?? '',
    body: item.body,
    options: item.options.map((option) => option.text),
    module: item.module,
    tags: item.tags.join(', '),
  }
}

function PromptPreview({ prompt }: { prompt: TeachingPromptRow | TeachingLibraryItem }) {
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

export function TeachingInstructorWorkspace({
  role,
  host,
  activePrompt,
  responses,
  candidateCount,
  promptBusy,
  promptError,
  libraryItems,
  libraryAvailable,
  libraryBusy,
  libraryError,
  laserEnabled = false,
  laserAvailable = false,
  onLaserEnabledChange,
  onPresent,
  onClose,
  onSaveLibrary,
}: {
  role: TeachingRole
  host: TeachingHostAdapter
  activePrompt: TeachingPromptRow | null
  responses: TeachingPromptResponseRow[]
  candidateCount: number
  promptBusy: boolean
  promptError: string | null
  libraryItems: TeachingLibraryItem[]
  libraryAvailable: boolean
  libraryBusy: boolean
  libraryError: string | null
  laserEnabled?: boolean
  laserAvailable?: boolean
  onLaserEnabledChange?: (enabled: boolean) => void
  onPresent: (input: TeachingPromptDraft) => Promise<void>
  onClose: () => Promise<void>
  onSaveLibrary: (draft: TeachingLibraryDraft, existingId?: string | null) => Promise<TeachingLibraryItem>
}) {
  const [view, setView] = useState<'compose' | 'library'>('compose')
  const [kind, setKind] = useState<TeachingPromptKind>('mcq')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [options, setOptions] = useState(['', '', '', ''])
  const [module, setModule] = useState(host.defaultModule)
  const [tags, setTags] = useState('')
  const [editingLibraryId, setEditingLibraryId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const counts = useMemo(() => {
    const result = new Map<string, number>()
    for (const response of responses) result.set(response.option_id, (result.get(response.option_id) ?? 0) + 1)
    return result
  }, [responses])

  const filteredLibrary = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return libraryItems
    return libraryItems.filter((item) => [item.title ?? '', item.body, item.module, ...item.tags].join(' ').toLowerCase().includes(needle))
  }, [libraryItems, search])

  if (role === 'candidate') return null

  const resetComposer = () => {
    setKind('mcq')
    setTitle('')
    setBody('')
    setOptions(['', '', '', ''])
    setModule(host.defaultModule)
    setTags('')
    setEditingLibraryId(null)
    setMessage(null)
  }

  const loadLibraryItem = (item: TeachingLibraryItem) => {
    const draft = draftFromLibrary(item)
    setKind(draft.kind)
    setTitle(draft.title)
    setBody(draft.body)
    setOptions([...draft.options, '', '', '', '', '', ''].slice(0, Math.max(2, Math.min(6, draft.options.length || 4))))
    setModule(draft.module)
    setTags(draft.tags)
    setEditingLibraryId(item.id)
    setView('compose')
    setMessage(`Loaded “${item.title || 'Untitled'}” from the library.`)
  }

  const promptDraft = (): TeachingPromptDraft => ({
    kind,
    title,
    body: body.trim(),
    options: kind === 'message' ? [] : normaliseOptions(options),
  })

  const valid = Boolean(body.trim()) && (kind === 'message' || normaliseOptions(options).length >= 2)

  const present = async () => {
    if (role !== 'instructor' || !valid) return
    setMessage(null)
    try {
      await onPresent(promptDraft())
      resetComposer()
    } catch {
      // surfaced by promptError
    }
  }

  const save = async () => {
    if (!valid) return
    setMessage(null)
    const draft: TeachingLibraryDraft = {
      ...promptDraft(),
      module: module.trim() || host.defaultModule,
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    }
    try {
      const saved = await onSaveLibrary(draft, editingLibraryId)
      setEditingLibraryId(saved.id)
      setMessage(editingLibraryId ? 'Library question updated.' : 'Question saved to library.')
    } catch {
      // surfaced by libraryError
    }
  }

  return (
    <section className="teaching-prompt-instructor" aria-label="Teaching interaction workspace">
      <div className="teaching-prompt-section-heading">
        <div><span className="session-kicker">Reusable teaching module</span><h3>Teaching workspace</h3><small>{host.appName}</small></div>
        {activePrompt && <span className="teaching-prompt-live-badge">LIVE</span>}
      </div>

      {onLaserEnabledChange && (
        <div className="teaching-laser-control-row">
          <button
            type="button"
            className={`teaching-laser-toggle ${laserEnabled ? 'active' : ''}`}
            disabled={!laserAvailable}
            aria-pressed={laserEnabled}
            onClick={() => onLaserEnabledChange(!laserEnabled)}
          ><span className="teaching-laser-button-dot" />{laserEnabled ? 'Laser pointer on' : 'Laser pointer'}</button>
          <small>{laserAvailable ? (laserEnabled ? 'Move over the simulator display to point. Use Exit on the display or press here again to stop.' : 'Show a live pointer on candidate simulator displays.') : 'Start an instructor session to use the laser pointer.'}</small>
        </div>
      )}

      {activePrompt && role === 'instructor' ? (
        <>
          <PromptPreview prompt={activePrompt} />
          {activePrompt.kind !== 'message' && (
            <div className="teaching-prompt-results">
              <div className="teaching-prompt-response-summary"><strong>{responses.length}</strong> / {candidateCount} responses</div>
              {activePrompt.options.map((option, index) => {
                const count = counts.get(option.id) ?? 0
                const percent = Math.round((count / Math.max(1, responses.length)) * 100)
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
          <button className="teaching-prompt-close" type="button" disabled={promptBusy} onClick={() => void onClose()}>Close prompt</button>
        </>
      ) : (
        <>
          <div className="teaching-workspace-tabs">
            <button type="button" className={view === 'compose' ? 'active' : ''} onClick={() => setView('compose')}>Compose</button>
            <button type="button" className={view === 'library' ? 'active' : ''} onClick={() => setView('library')}>Question library <span>{libraryItems.length}</span></button>
          </div>

          {view === 'compose' ? (
            <div className="teaching-prompt-composer">
              <div className="teaching-composer-toolbar"><button type="button" onClick={resetComposer}>New</button>{editingLibraryId && <span>Editing saved question</span>}</div>
              <label>Type<select value={kind} onChange={(event) => setKind(event.target.value as TeachingPromptKind)}><option value="mcq">MCQ · unmarked</option><option value="poll">Poll</option><option value="message">Information</option></select></label>
              <label>Module<input value={module} maxLength={120} onChange={(event) => setModule(event.target.value)} placeholder="e.g. Ventilation, Anaesthesia, Airway" /></label>
              <label>Tags <span>(comma separated)</span><input value={tags} maxLength={300} onChange={(event) => setTags(event.target.value)} placeholder="e.g. COPD, AutoPEEP, waveforms" /></label>
              <label>Title <span>(optional)</span><input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} /></label>
              <label>Prompt<textarea value={body} maxLength={4000} rows={4} onChange={(event) => setBody(event.target.value)} placeholder="Present the case, instruction or question…" /></label>
              {kind !== 'message' && (
                <div className="teaching-prompt-option-editor">
                  {options.map((option, index) => (
                    <label key={index}><span>{String.fromCharCode(65 + index)}</span><input value={option} maxLength={500} onChange={(event) => setOptions((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} /></label>
                  ))}
                  <div className="teaching-option-actions">
                    {options.length < 6 && <button type="button" onClick={() => setOptions((current) => [...current, ''])}>+ option</button>}
                    {options.length > 2 && <button type="button" onClick={() => setOptions((current) => current.slice(0, -1))}>− option</button>}
                  </div>
                </div>
              )}
              <div className="teaching-composer-actions">
                <button className="teaching-library-save" type="button" disabled={!valid || libraryBusy || !libraryAvailable} onClick={() => void save()}>{editingLibraryId ? 'Update library question' : 'Save to library'}</button>
                <button className="teaching-prompt-present" type="button" disabled={!valid || promptBusy || role !== 'instructor'} onClick={() => void present()}>Present to candidates</button>
              </div>
              {!libraryAvailable && <small className="teaching-library-hint">Sign in to a permanent instructor account to prepare and save reusable questions.</small>}
              {role !== 'instructor' && <small className="teaching-library-hint">You can prepare questions now. Start an instructor session when you want to present them.</small>}
              {message && <div className="teaching-library-success">{message}</div>}
            </div>
          ) : (
            <div className="teaching-library">
              {!libraryAvailable ? (
                <div className="teaching-library-empty">Sign in to an instructor account to use your reusable question library.</div>
              ) : (
                <>
                  <input className="teaching-library-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, text, module or tags…" />
                  {filteredLibrary.length ? (
                    <div className="teaching-library-list">
                      {filteredLibrary.map((item) => (
                        <article key={item.id} className="teaching-library-card">
                          <div className="teaching-library-card-heading"><div><span>{item.module}</span><strong>{item.title || 'Untitled'}</strong></div><em>{item.kind === 'message' ? 'Info' : item.kind.toUpperCase()}</em></div>
                          <p>{item.body}</p>
                          {item.tags.length > 0 && <div className="teaching-library-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
                          <div className="teaching-library-card-actions">
                            <button type="button" onClick={() => loadLibraryItem(item)}>Edit / use</button>
                            {role === 'instructor' && <button type="button" className="primary" disabled={promptBusy} onClick={() => { void onPresent({ kind: item.kind, title: item.title ?? '', body: item.body, options: item.options }).catch(() => undefined) }}>Present</button>}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : <div className="teaching-library-empty">No saved questions match this search.</div>}
                </>
              )}
            </div>
          )}
        </>
      )}
      {(promptError || libraryError) && <div className="teaching-prompt-error">{promptError || libraryError}</div>}
    </section>
  )
}

export function TeachingCandidateOverlay({
  role,
  prompt,
  myResponse,
  busy,
  error,
  onSubmit,
}: {
  role: TeachingRole
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
              return <button key={option.id} type="button" className={selected ? 'selected' : ''} disabled={hasSubmitted || busy} onClick={() => setSelectedOptionId(option.id)}><strong>{String.fromCharCode(65 + index)}</strong><span>{option.text}</span></button>
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
