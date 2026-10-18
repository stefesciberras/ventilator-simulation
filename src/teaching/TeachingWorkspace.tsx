import { useEffect, useMemo, useRef, useState } from 'react'
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
    correctOptionId: item.correct_option_id,
    explanation: item.explanation ?? '',
  }
}

function PromptPreview({ prompt }: { prompt: TeachingPromptRow | TeachingLibraryItem }) {
  return (
    <div className="teaching-prompt-preview">
      <span className="teaching-prompt-kind">{prompt.kind === 'message' ? 'Information' : prompt.kind === 'mcq' ? 'MCQ' : 'Poll'}</span>
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
  instructorAuthenticated,
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
  onPresent,
  onClose,
  onReleaseAnswer,
  onSaveLibrary,
}: {
  role: TeachingRole
  instructorAuthenticated: boolean
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
  onPresent: (input: TeachingPromptDraft) => Promise<void>
  onClose: () => Promise<void>
  onReleaseAnswer: () => Promise<void>
  onSaveLibrary: (draft: TeachingLibraryDraft, existingId?: string | null) => Promise<TeachingLibraryItem>
}) {
  const [view, setView] = useState<'compose' | 'library'>('compose')
  const [kind, setKind] = useState<TeachingPromptKind>('mcq')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [options, setOptions] = useState(['', '', '', ''])
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(null)
  const [explanation, setExplanation] = useState('')
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(true)
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
    return libraryItems.filter((item) => [item.title ?? '', item.body, ...item.tags].join(' ').toLowerCase().includes(needle))
  }, [libraryItems, search])

  if (role === 'candidate') return null
  if (!instructorAuthenticated) return (
    <section className="teaching-prompt-instructor teaching-account-required" aria-label="Questions and Polls">
      <div className="teaching-prompt-section-heading"><div><h3>Questions and Polls</h3></div></div>
      <div className="teaching-account-required-message"><strong>Instructor sign-in required</strong><span>Sign in to your instructor account to prepare, save and present questions or polls.</span></div>
    </section>
  )

  const resetComposer = () => {
    setKind('mcq')
    setTitle('')
    setBody('')
    setOptions(['', '', '', ''])
    setCorrectOptionId(null)
    setExplanation('')
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
    setCorrectOptionId(draft.correctOptionId)
    setExplanation(draft.explanation)
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
    correctOptionId: kind === 'mcq' ? correctOptionId : null,
    explanation: kind === 'mcq' ? explanation : null,
  })

  const normalisedOptions = normaliseOptions(options)
  const markedCorrectAnswerIsValid = kind !== 'mcq' || Boolean(correctOptionId && normalisedOptions.some((option) => option.id === correctOptionId))
  const valid = Boolean(body.trim()) && (kind === 'message' || normalisedOptions.length >= 2) && markedCorrectAnswerIsValid

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
      correctOptionId: kind === 'mcq' ? correctOptionId : null,
      explanation: kind === 'mcq' ? explanation : null,
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
        <div><h3>Questions and Polls</h3></div>
        <div className="teaching-prompt-heading-actions">
          {activePrompt && <span className="teaching-prompt-live-badge">LIVE</span>}
          <button type="button" className={`teaching-workspace-collapse ${workspaceCollapsed ? 'collapsed' : 'expanded'}`} onClick={() => setWorkspaceCollapsed((collapsed) => !collapsed)} aria-expanded={!workspaceCollapsed} aria-label={workspaceCollapsed ? 'Expand Questions and Polls' : 'Collapse Questions and Polls'}><span className="teaching-collapse-caret" aria-hidden="true" /></button>
        </div>
      </div>

      {!workspaceCollapsed && <>
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
          <div className="teaching-live-actions">
            {activePrompt.kind === 'mcq' && (
              <button className="teaching-answer-release" type="button" disabled={promptBusy || Boolean(activePrompt.answer_released_at)} onClick={() => void onReleaseAnswer()}>
                {activePrompt.answer_released_at ? 'Answer released' : 'Release correct answer'}
              </button>
            )}
            <button className="teaching-prompt-close" type="button" disabled={promptBusy} onClick={() => void onClose()}>Close prompt</button>
          </div>
        </>
      ) : (
        <>
          <div className="teaching-workspace-navigation">
            <button
              type="button"
              className={`teaching-add-question ${view === 'compose' ? 'active' : ''}`}
              onClick={() => { resetComposer(); setView('compose') }}
            >
              <span className="teaching-add-question-icon" aria-hidden="true">+</span>
              <span>Add new Question / Poll</span>
            </button>
            <button
              type="button"
              className={`teaching-library-navigation ${view === 'library' ? 'active' : ''}`}
              onClick={() => setView('library')}
            >
              <span>Question library</span>
              <span className="teaching-library-count">{libraryItems.length}</span>
            </button>
          </div>

          {view === 'compose' ? (
            <div className="teaching-prompt-composer">
              {editingLibraryId && <div className="teaching-composer-toolbar"><span>Editing saved question</span></div>}
              <label>Type<select value={kind} onChange={(event) => setKind(event.target.value as TeachingPromptKind)}><option value="mcq">MCQ</option><option value="poll">Poll</option><option value="message">Information</option></select></label>
              <label>Tags <span>(optional)</span><input value={tags} maxLength={300} onChange={(event) => setTags(event.target.value)} placeholder="e.g. COPD, AutoPEEP, waveforms" /></label>
              <label>Title <span>(optional)</span><input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} /></label>
              <label>Prompt<textarea value={body} maxLength={4000} rows={4} onChange={(event) => setBody(event.target.value)} placeholder="Present the case, instruction or question…" /></label>
              {kind !== 'message' && (
                <div className="teaching-prompt-option-editor">
                  {kind === 'mcq' && <div className="teaching-correct-answer-hint">Mark the correct answer</div>}
                  {options.map((option, index) => {
                    const optionId = `opt-${index + 1}`
                    const markedCorrect = correctOptionId === optionId
                    return (
                      <label key={index} className={markedCorrect ? 'correct-answer-marked' : ''}>
                        <span>{String.fromCharCode(65 + index)}</span>
                        <input value={option} maxLength={500} onChange={(event) => setOptions((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} />
                        {kind === 'mcq' && <button type="button" className={`teaching-mark-correct ${markedCorrect ? 'selected' : ''}`} onClick={() => setCorrectOptionId(optionId)} aria-pressed={markedCorrect} title={`Mark option ${String.fromCharCode(65 + index)} as correct`} aria-label={`Mark option ${String.fromCharCode(65 + index)} as correct`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
                      </label>
                    )
                  })}
                  <div className="teaching-option-actions">
                    {options.length < 6 && <button type="button" onClick={() => setOptions((current) => [...current, ''])}>+ option</button>}
                    {options.length > 2 && <button type="button" onClick={() => setOptions((current) => current.slice(0, -1))}>− option</button>}
                  </div>
                </div>
              )}
              <div className="teaching-composer-actions">
                <button className="teaching-library-save" type="button" disabled={!valid || libraryBusy || !libraryAvailable} onClick={() => void save()}>{editingLibraryId ? 'Update saved question' : 'Save to library'}</button>
                <button className="teaching-prompt-present" type="button" disabled={!valid || promptBusy || role !== 'instructor'} onClick={() => void present()}>Present to candidates</button>
              </div>
              {!libraryAvailable && <small className="teaching-library-hint">Sign in to a permanent instructor account to prepare and save reusable questions.</small>}
              {message && <div className="teaching-library-success">{message}</div>}
            </div>
          ) : (
            <div className="teaching-library">
              {!libraryAvailable ? (
                <div className="teaching-library-empty">Sign in to an instructor account to use your reusable question library.</div>
              ) : (
                <>
                  <input className="teaching-library-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search questions, polls or tags…" />
                  {filteredLibrary.length ? (
                    <div className="teaching-library-list">
                      {filteredLibrary.map((item) => (
                        <article key={item.id} className="teaching-library-card">
                          <div className="teaching-library-card-heading"><div><strong>{item.title || 'Untitled'}</strong></div><em>{item.kind === 'message' ? 'Info' : item.kind.toUpperCase()}</em></div>
                          <p>{item.body}</p>
                          {item.tags.length > 0 && <div className="teaching-library-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
                          <div className="teaching-library-card-actions">
                            <button type="button" onClick={() => loadLibraryItem(item)}>Edit / use</button>
                            {role === 'instructor' && <button type="button" className="primary" disabled={promptBusy || (item.kind === 'mcq' && !item.correct_option_id)} title={item.kind === 'mcq' && !item.correct_option_id ? 'Edit this saved MCQ and mark the correct answer before presenting it.' : undefined} onClick={() => { void onPresent({ kind: item.kind, title: item.title ?? '', body: item.body, options: item.options, correctOptionId: item.correct_option_id, explanation: item.explanation }).catch(() => undefined) }}>Present</button>}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : <div className="teaching-library-empty">{search.trim() ? 'No saved questions or polls match this search.' : 'No saved questions or polls yet.'}</div>}
                </>
              )}
            </div>
          )}
        </>
      )}
      {(promptError || libraryError) && <div className="teaching-prompt-error">{promptError || libraryError}</div>}
      </>}
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
  const [collapsed, setCollapsed] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; baseLeft: number; baseTop: number; width: number; height: number } | null>(null)

  useEffect(() => {
    setSelectedOptionId('')
    setDismissedPromptId(null)
    setCollapsed(false)
    setPosition({ x: 0, y: 0 })
    dragRef.current = null
  }, [prompt?.id])

  useEffect(() => {
    if (!prompt?.answer_released_at || !myResponse) return
    setDismissedPromptId(null)
    setCollapsed(false)
  }, [prompt?.answer_released_at, myResponse?.id])

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (window.innerWidth < 900 || (event.target as HTMLElement).closest('button')) return
    const panel = event.currentTarget.closest('.teaching-prompt-modal') as HTMLElement | null
    if (!panel) return
    event.preventDefault()
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
  }

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || window.innerWidth < 900) return
    event.preventDefault()
    const proposedX = drag.originX + event.clientX - drag.startX
    const proposedY = drag.originY + event.clientY - drag.startY
    const margin = 12
    const minX = margin - drag.baseLeft
    const maxX = window.innerWidth - margin - (drag.baseLeft + drag.width)
    const minY = margin - drag.baseTop
    const maxY = window.innerHeight - margin - (drag.baseTop + drag.height)
    setPosition({
      x: Math.max(minX, Math.min(maxX, proposedX)),
      y: Math.max(minY, Math.min(maxY, proposedY)),
    })
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  if (role !== 'candidate' || !prompt || dismissedPromptId === prompt.id) return null
  const hasSubmitted = Boolean(myResponse)

  if (collapsed) {
    return (
      <button type="button" className="teaching-prompt-reopen" onClick={() => setCollapsed(false)} aria-label="Show current teaching question">
        <span>{prompt.kind === 'message' ? 'Teaching point' : prompt.kind === 'poll' ? 'Poll' : 'Question'}</span><strong>Show</strong>
      </button>
    )
  }

  return (
    <div className="teaching-prompt-overlay" role="presentation">
      <section
        className="teaching-prompt-modal"
        role="dialog"
        aria-modal="false"
        aria-labelledby="teaching-prompt-title"
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      >
        <div
          className="teaching-prompt-dock-header"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title="Drag to move this question on wide screens"
        >
          <span className="teaching-prompt-kind">{prompt.kind === 'message' ? 'Instructor information' : prompt.kind === 'mcq' ? 'Question' : 'Poll'}</span>
          <button type="button" onClick={() => setCollapsed(true)} aria-label="Temporarily hide question">Hide</button>
        </div>
        <h2 id="teaching-prompt-title">{prompt.title || (prompt.kind === 'message' ? 'Teaching point' : 'Your response')}</h2>
        <p className="teaching-prompt-body">{prompt.body}</p>
        {prompt.kind !== 'message' && (
          <div className="teaching-prompt-candidate-options">
            {prompt.options.map((option, index) => {
              const selected = selectedOptionId === option.id || myResponse?.option_id === option.id
              const answerReleased = Boolean(prompt.answer_released_at && prompt.released_correct_option_id)
              const correct = answerReleased && prompt.released_correct_option_id === option.id
              const selectedWrong = answerReleased && myResponse?.option_id === option.id && !correct
              return <button key={option.id} type="button" className={`${selected ? 'selected' : ''} ${correct ? 'answer-correct' : ''} ${selectedWrong ? 'answer-incorrect' : ''}`} disabled={hasSubmitted || busy} onClick={() => setSelectedOptionId(option.id)}><strong>{String.fromCharCode(65 + index)}</strong><span>{option.text}</span></button>
            })}
          </div>
        )}
        {prompt.kind === 'message' ? (
          <button className="teaching-prompt-primary" type="button" onClick={() => setDismissedPromptId(prompt.id)}>Continue</button>
        ) : hasSubmitted ? (
          <div className={`teaching-prompt-submitted ${prompt.answer_released_at ? 'answer-released' : ''}`}>
            {prompt.answer_released_at && prompt.released_correct_option_id ? (
              <>
                <strong>{myResponse?.option_id === prompt.released_correct_option_id ? 'Correct' : 'Not correct'}</strong>
                <span>{myResponse?.option_id === prompt.released_correct_option_id ? 'Your response is correct.' : `Correct answer: ${String.fromCharCode(65 + Math.max(0, prompt.options.findIndex((option) => option.id === prompt.released_correct_option_id)))}. ${prompt.options.find((option) => option.id === prompt.released_correct_option_id)?.text ?? ''}`}</span>
              </>
            ) : (
              <>
                <strong>Response submitted</strong>
                <span>Your answer has been sent to the instructor. The correct answer will be released by the instructor.</span>
              </>
            )}
            <button type="button" onClick={() => setDismissedPromptId(prompt.id)}>Return to simulator</button>
          </div>
        ) : (
          <button className="teaching-prompt-primary" type="button" disabled={!selectedOptionId || busy} onClick={() => void onSubmit(selectedOptionId)}>Submit response</button>
        )}
        {error && <div className="teaching-prompt-error">{error}</div>}
      </section>
    </div>
  )
}
