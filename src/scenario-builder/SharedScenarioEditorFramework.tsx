import { useEffect, useMemo, useRef, useState } from 'react'
import { createSelfDirectedAssignment, selfDirectedAssignmentUrl } from '../selfDirectedAssignments'
import {
  authoringId,
  createAuthoringStage,
  defaultAuthoringTrigger,
  type SharedScenarioAuthoringBranch,
  type SharedScenarioAuthoringDocument,
  type SharedScenarioAuthoringStage,
  type SharedScenarioAuthoringTrigger,
  type SharedScenarioEditorAdapter,
  type SharedScenarioQuestionContent,
  type SharedScenarioTransition,
} from '../teaching/scenario/authoringTypes'
import { useProductScenarioLibrary } from '../teaching/scenario/useProductScenarioLibrary'
import type { ProductScenarioRow } from '../teaching/scenario/productLibrary'

interface SharedScenarioEditorFrameworkProps<TScenario, TSnapshot> {
  adapter: SharedScenarioEditorAdapter<TScenario, TSnapshot>
  enabled?: boolean
  onStartScenario?: (row: ProductScenarioRow<TScenario>) => void
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function questionDefault(): SharedScenarioQuestionContent {
  return {
    kind: 'mcq',
    title: null,
    body: '',
    options: [
      { id: authoringId('option'), text: 'Option 1' },
      { id: authoringId('option'), text: 'Option 2' },
    ],
    correctOptionId: null,
    explanation: null,
  }
}

function triggerLabel(trigger: SharedScenarioAuthoringTrigger) {
  if (trigger.type === 'manual') return 'Instructor choice'
  if (trigger.type === 'time') return `Time ≥ ${trigger.seconds}s`
  if (trigger.type === 'condition') return `${trigger.metric || 'Metric'} ${trigger.operator === 'lt' ? '<' : trigger.operator === 'gt' ? '>' : '='} ${trigger.value}`
  if (trigger.type === 'action') return `${trigger.actor}: ${trigger.parameter || 'action'}`
  if (trigger.type === 'question-any') return 'Any answer submitted'
  return 'Correct answer submitted'
}

function pathTriggers(branch: SharedScenarioAuthoringBranch) {
  return branch.triggers?.length ? branch.triggers : [branch.trigger]
}

function TriggerEditor({
  trigger,
  adapter,
  onChange,
  onDelete,
}: {
  trigger: SharedScenarioAuthoringTrigger
  adapter: SharedScenarioEditorAdapter<unknown, unknown>
  onChange: (trigger: SharedScenarioAuthoringTrigger) => void
  onDelete?: () => void
}) {
  const setType = (type: SharedScenarioAuthoringTrigger['type']) => {
    if (type === 'manual') onChange({ id: trigger.id, type })
    else if (type === 'time') onChange({ id: trigger.id, type, seconds: 30 })
    else if (type === 'condition') onChange({ id: trigger.id, type, metric: adapter.conditionMetrics[0]?.id ?? '', operator: 'gt', value: 0 })
    else if (type === 'action') onChange({ id: trigger.id, type, parameter: adapter.actionParameters[0]?.id ?? '', actor: 'candidate' })
    else onChange({ id: trigger.id, type })
  }

  return <div className="shared-scenario-trigger-editor">
    <select value={trigger.type} onChange={(event) => setType(event.target.value as SharedScenarioAuthoringTrigger['type'])}>
      <option value="manual">Manual</option>
      <option value="time">Time passed</option>
      <option value="condition">Physiological condition</option>
      <option value="action">Candidate / instructor action</option>
      <option value="question-any">Any question answer</option>
      <option value="question-correct">Correct question answer</option>
    </select>
    {trigger.type === 'time' && <label><span>Seconds</span><input type="number" min={0} value={trigger.seconds} onChange={(event) => onChange({ ...trigger, seconds: Math.max(0, Number(event.target.value) || 0) })} /></label>}
    {trigger.type === 'condition' && <>
      <select value={trigger.metric} onChange={(event) => onChange({ ...trigger, metric: event.target.value })}>{adapter.conditionMetrics.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <select value={trigger.operator} onChange={(event) => onChange({ ...trigger, operator: event.target.value as 'lt' | 'eq' | 'gt' })}><option value="lt">&lt;</option><option value="eq">=</option><option value="gt">&gt;</option></select>
      <input type="number" value={trigger.value} onChange={(event) => onChange({ ...trigger, value: Number(event.target.value) || 0 })} />
    </>}
    {trigger.type === 'action' && <>
      <select value={trigger.parameter} onChange={(event) => onChange({ ...trigger, parameter: event.target.value })}>{adapter.actionParameters.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <select value={trigger.actor} onChange={(event) => onChange({ ...trigger, actor: event.target.value as 'candidate' | 'instructor' | 'either' })}><option value="candidate">Candidate</option><option value="instructor">Instructor</option><option value="either">Either</option></select>
    </>}
    {onDelete && <button type="button" className="scenario-builder-danger shared-scenario-trash-button" onClick={onDelete} aria-label="Remove condition" title="Remove condition"><TrashIcon /></button>}
  </div>
}

function StageTransitionEditor<TScenario, TSnapshot>({
  stage,
  stageIndex,
  adapter,
  onChange,
}: {
  stage: SharedScenarioAuthoringStage<TSnapshot>
  stageIndex: number
  adapter: SharedScenarioEditorAdapter<TScenario, TSnapshot>
  onChange: (patch: Partial<SharedScenarioAuthoringStage<TSnapshot>>) => void
}) {
  if (!adapter.transitionVariables) return null
  const transition = stage.transition ?? { mode: 'immediate' as const }
  const allVariables = adapter.transitionVariables(stage.snapshot)
  const applied = stage.appliedVariableIds ? new Set(stage.appliedVariableIds) : null
  const variables = applied ? allVariables.filter((variable) => applied.has(variable.id)) : allVariables
  const overrides = stage.transitionOverrides ?? {}

  const setDefaultMode = (mode: SharedScenarioTransition['mode']) => {
    onChange({ transition: mode === 'linear' ? { mode, durationSeconds: transition.mode === 'linear' ? Math.max(0.1, transition.durationSeconds) : 30 } : { mode } })
  }
  const setOverride = (id: string, value: 'inherit' | SharedScenarioTransition['mode']) => {
    const next = { ...overrides }
    if (value === 'inherit') delete next[id]
    else if (value === 'linear') {
      const current = overrides[id]
      next[id] = { mode: 'linear', durationSeconds: current?.mode === 'linear' ? Math.max(0.1, current.durationSeconds) : (transition.mode === 'linear' ? transition.durationSeconds : 30) }
    } else next[id] = { mode: 'immediate' }
    onChange({ transitionOverrides: next })
  }
  const setOverrideDuration = (id: string, seconds: number) => {
    onChange({ transitionOverrides: { ...overrides, [id]: { mode: 'linear', durationSeconds: Math.max(0.1, seconds || 0.1) } } })
  }

  if (stageIndex === 0) return <section className="shared-scenario-transition-card initial"><div><span>Transition into this stage</span><strong>Immediate</strong><small>Stage 1 establishes the starting state, so it is applied immediately.</small></div></section>

  return <section className="shared-scenario-transition-card">
    <div className="shared-scenario-transition-heading">
      <div><span>Transition into this stage</span><strong>Stage transition</strong><small>Numeric values inherit this transition unless overridden below. Discrete settings always change immediately.</small></div>
      <label><span>Transition</span><select value={transition.mode} onChange={(event) => setDefaultMode(event.target.value as SharedScenarioTransition['mode'])}><option value="immediate">Immediate</option><option value="linear">Linear</option></select></label>
      {transition.mode === 'linear' && <label className="compact"><span>Duration</span><div className="shared-scenario-duration-input"><input type="number" min={0.1} step={0.5} value={transition.durationSeconds} onChange={(event) => onChange({ transition: { mode: 'linear', durationSeconds: Math.max(0.1, Number(event.target.value) || 0.1) } })} /><em>s</em></div></label>}
    </div>
    {!!variables.length && <details className="shared-scenario-transition-advanced">
      <summary>Advanced transitions <small>Override individual applied numeric parameters</small></summary>
      <div className="shared-scenario-transition-overrides">
        {variables.map((variable) => {
          const override = overrides[variable.id]
          const choice = override?.mode ?? 'inherit'
          return <div key={variable.id} className="shared-scenario-transition-override-row">
            <span>{variable.label}</span>
            <select value={choice} onChange={(event) => setOverride(variable.id, event.target.value as 'inherit' | SharedScenarioTransition['mode'])}><option value="inherit">Inherit stage</option><option value="immediate">Immediate</option><option value="linear">Linear</option></select>
            {override?.mode === 'linear' ? <div className="shared-scenario-duration-input"><input type="number" min={0.1} step={0.5} value={override.durationSeconds} onChange={(event) => setOverrideDuration(variable.id, Number(event.target.value))} /><em>s</em></div> : <span className="shared-scenario-transition-effective">{!override ? (transition.mode === 'linear' ? `${transition.durationSeconds}s` : 'Immediate') : 'Immediate'}</span>}
          </div>
        })}
      </div>
    </details>}
  </section>
}

export function SharedScenarioEditorFramework<TScenario, TSnapshot>({ adapter, enabled = true, onStartScenario }: SharedScenarioEditorFrameworkProps<TScenario, TSnapshot>) {
  const library = useProductScenarioLibrary<TScenario>(adapter.product, enabled)
  const [selectedId, setSelectedId] = useState('')
  const [document, setDocument] = useState<SharedScenarioAuthoringDocument<TSnapshot>>(() => {
    const snapshot = adapter.emptySnapshot()
    const stage = createAuthoringStage('Stage 1', snapshot)
    stage.appliedVariableIds = adapter.defaultAppliedVariableIds?.(snapshot)
    return {
      schemaVersion: 1,
      product: adapter.product,
      name: 'New scenario',
      description: '',
      stages: [stage],
      branches: [],
    }
  })
  const [selectedStageId, setSelectedStageId] = useState(document.stages[0].id)
  const [message, setMessage] = useState<string | null>(null)
  const [expiryDays, setExpiryDays] = useState(30)
  const [publication, setPublication] = useState<{ code: string; url: string; expiresAt: string } | null>(null)
  const importRef = useRef<HTMLInputElement | null>(null)

  const selectedRow = library.items.find((row) => row.id === selectedId) ?? null
  const selectedStage = document.stages.find((stage) => stage.id === selectedStageId) ?? document.stages[0]

  useEffect(() => {
    if (selectedId && !library.items.some((row) => row.id === selectedId)) setSelectedId('')
  }, [library.items, selectedId])

  const newScenario = () => {
    const snapshot = adapter.emptySnapshot()
    const stage = createAuthoringStage('Stage 1', snapshot)
    stage.appliedVariableIds = adapter.defaultAppliedVariableIds?.(snapshot)
    setSelectedId('')
    setDocument({ schemaVersion: 1, product: adapter.product, name: 'New scenario', description: '', stages: [stage], branches: [] })
    setSelectedStageId(stage.id)
    setPublication(null)
    setMessage(null)
  }

  const openRow = (row: ProductScenarioRow<TScenario>) => {
    const next = adapter.toDocument(row.name, row.scenario)
    setSelectedId(row.id)
    setDocument(next)
    setSelectedStageId(next.stages[0]?.id ?? '')
    setPublication(null)
    setMessage(null)
  }

  const save = async () => {
    if (!document.name.trim()) return setMessage('Enter a scenario name.')
    if (!document.stages.length) return setMessage('Add at least one stage.')
    setMessage(null)
    try {
      const scenario = adapter.fromDocument(document)
      if (selectedRow) {
        await library.update(selectedRow.id, { name: document.name.trim(), scenario })
        setMessage('Scenario updated.')
      } else {
        const created = await library.create(document.name.trim(), scenario)
        setSelectedId(created.id)
        setMessage('Scenario saved.')
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unable to save scenario.')
    }
  }

  const remove = async () => {
    if (!selectedRow) return
    if (!window.confirm(`Delete “${selectedRow.name}”?`)) return
    await library.remove(selectedRow.id)
    newScenario()
  }

  const updateStage = (patch: Partial<SharedScenarioAuthoringStage<TSnapshot>>) => {
    setDocument((current) => ({ ...current, stages: current.stages.map((stage) => stage.id === selectedStage.id ? { ...stage, ...patch } : stage) }))
  }

  const addStage = () => {
    const source = selectedStage?.snapshot ?? adapter.emptySnapshot()
    const stage = createAuthoringStage(`Stage ${document.stages.length + 1}`, clone(source))
    // New state stages inherit the visible values for authoring convenience but change nothing until explicitly enabled.
    stage.appliedVariableIds = []
    const trigger = defaultAuthoringTrigger()
    const path: SharedScenarioAuthoringBranch = { id: authoringId('path'), fromStageId: selectedStage.id, toStageId: stage.id, trigger, triggers: [trigger], triggerMode: 'any', priority: document.branches.filter((branch) => branch.fromStageId === selectedStage.id).length, label: 'Continue', enabled: true }
    setDocument((current) => ({ ...current, stages: [...current.stages, stage], branches: [...current.branches, path] }))
    setSelectedStageId(stage.id)
  }

  const duplicateStage = () => {
    if (!selectedStage) return
    const stage = clone(selectedStage)
    stage.id = authoringId('stage')
    stage.name = `${selectedStage.name} copy`
    stage.triggers = []
    setDocument((current) => ({ ...current, stages: [...current.stages, stage] }))
    setSelectedStageId(stage.id)
  }

  const deleteStage = () => {
    if (!selectedStage || document.stages.length <= 1) return
    const stages = document.stages.filter((stage) => stage.id !== selectedStage.id)
    setDocument((current) => ({
      ...current,
      stages,
      branches: current.branches.filter((branch) => branch.fromStageId !== selectedStage.id && branch.toStageId !== selectedStage.id),
    }))
    setSelectedStageId(stages[0]?.id ?? '')
  }

  const addBranch = () => {
    if (document.stages.length < 2) return
    const fromStageId = selectedStage.id
    const toStageId = document.stages.find((stage) => stage.id !== fromStageId)?.id ?? fromStageId
    const trigger = defaultAuthoringTrigger()
    const branch: SharedScenarioAuthoringBranch = { id: authoringId('path'), fromStageId, toStageId, trigger, triggers: [trigger], triggerMode: 'any', priority: document.branches.filter((item) => item.fromStageId === fromStageId).length, label: '', enabled: true }
    setDocument((current) => ({ ...current, branches: [...current.branches, branch] }))
  }

  const updateBranch = (id: string, patch: Partial<SharedScenarioAuthoringBranch>) => setDocument((current) => ({ ...current, branches: current.branches.map((branch) => branch.id === id ? { ...branch, ...patch } : branch) }))
  const deleteBranch = (id: string) => setDocument((current) => ({ ...current, branches: current.branches.filter((branch) => branch.id !== id) }))
  const addPathCondition = (branch: SharedScenarioAuthoringBranch) => {
    const next = [...pathTriggers(branch), defaultAuthoringTrigger()]
    updateBranch(branch.id, { trigger: next[0], triggers: next })
  }
  const updatePathCondition = (branch: SharedScenarioAuthoringBranch, triggerId: string, nextTrigger: SharedScenarioAuthoringTrigger) => {
    const next = pathTriggers(branch).map((trigger) => trigger.id === triggerId ? nextTrigger : trigger)
    updateBranch(branch.id, { trigger: next[0] ?? nextTrigger, triggers: next })
  }
  const removePathCondition = (branch: SharedScenarioAuthoringBranch, triggerId: string) => {
    const next = pathTriggers(branch).filter((trigger) => trigger.id !== triggerId)
    if (!next.length) return
    updateBranch(branch.id, { trigger: next[0], triggers: next })
  }

  const exportScenario = () => {
    const blob = new Blob([JSON.stringify({ format: 'edusim-scenario', schemaVersion: 1, document }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = `${document.name.trim().replace(/[^a-z0-9-_]+/gi, '-') || 'scenario'}.edusim.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importScenario = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as { format?: string; document?: SharedScenarioAuthoringDocument<TSnapshot> } | SharedScenarioAuthoringDocument<TSnapshot>
      const imported = 'document' in parsed && parsed.document ? parsed.document : parsed as SharedScenarioAuthoringDocument<TSnapshot>
      if (!imported || imported.product !== adapter.product || !Array.isArray(imported.stages) || !imported.stages.length) throw new Error(`This file is not a ${adapter.productLabel} EDUSIM scenario.`)
      setSelectedId('')
      setDocument({ ...imported, schemaVersion: 1, product: adapter.product })
      setSelectedStageId(imported.stages[0].id)
      setPublication(null)
      setMessage('Scenario imported. Save it to add it to your library.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unable to import scenario.')
    }
  }

  const publish = async () => {
    try {
      const scenario = adapter.fromDocument(document)
      const created = await createSelfDirectedAssignment(document.name, scenario, expiryDays, adapter.product)
      setPublication({ code: created.accessCode, url: selfDirectedAssignmentUrl(created.accessCode, adapter.product), expiresAt: created.expiresAt })
      setMessage('Self-directed assignment published.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unable to publish self-directed assignment.')
    }
  }

  const stageBranches = useMemo(() => document.branches.filter((branch) => branch.fromStageId === selectedStage?.id), [document.branches, selectedStage?.id])

  return <div className="shared-scenario-editor">
    <aside className="shared-scenario-library">
      <div className="shared-scenario-library-heading"><strong>{adapter.productLabel} scenarios</strong><button type="button" onClick={newScenario}>New</button></div>
      {library.busy && <small>Loading…</small>}
      {library.message && <small>{library.message}</small>}
      <div className="shared-scenario-library-list">
        {library.items.map((row) => <button key={row.id} type="button" className={selectedId === row.id ? 'selected' : ''} onClick={() => openRow(row)}><strong>{row.name}</strong><small>{new Date(row.updated_at).toLocaleString()}</small></button>)}
        {!library.busy && !library.items.length && <small>No saved scenarios yet.</small>}
      </div>
    </aside>

    <section className="shared-scenario-authoring">
      <header className="shared-scenario-authoring-header">
        <div><span>Shared EDUSIM scenario framework</span><h2>{document.name || 'Untitled scenario'}</h2></div>
        <div className="scenario-builder-editor-actions">
          <button type="button" onClick={() => importRef.current?.click()}>Import</button>
          <button type="button" onClick={exportScenario}>Export</button>
          <button type="button" onClick={() => void save()}>{selectedRow ? 'Save changes' : 'Save scenario'}</button>
          {onStartScenario && selectedRow && <button type="button" className="scenario-builder-primary" onClick={() => onStartScenario(selectedRow)}>Open in simulator</button>}
          {selectedRow && <button type="button" className="scenario-builder-danger" onClick={() => void remove()}>Delete</button>}
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importScenario(file); event.currentTarget.value = '' }} />
        </div>
      </header>

      <div className="shared-scenario-meta-grid">
        <label><span>Name</span><input value={document.name} onChange={(event) => setDocument((current) => ({ ...current, name: event.target.value }))} /></label>
        <label className="wide"><span>Description / learning objective</span><textarea rows={2} value={document.description} onChange={(event) => setDocument((current) => ({ ...current, description: event.target.value }))} /></label>
      </div>

      <div className="shared-scenario-stage-layout">
        <nav className="shared-scenario-stage-list">
          <div className="shared-scenario-stage-list-heading"><strong>Stages</strong><button type="button" onClick={addStage}>+ Add</button></div>
          {document.stages.map((stage, index) => {
            const outgoing = document.branches.filter((branch) => branch.fromStageId === stage.id && branch.enabled !== false)
            return <button key={stage.id} type="button" className={stage.id === selectedStageId ? 'selected' : ''} onClick={() => setSelectedStageId(stage.id)}><small>{index + 1} · {stage.kind}</small><strong>{stage.name}</strong><em>{outgoing.length ? `${outgoing.length} path${outgoing.length === 1 ? '' : 's'}` : 'End stage'}</em></button>
          })}
        </nav>

        {selectedStage && <div className="shared-scenario-stage-editor">
          <div className="shared-scenario-stage-toolbar">
            <label><span>Stage name</span><input value={selectedStage.name} onChange={(event) => updateStage({ name: event.target.value })} /></label>
            <label><span>Stage type</span><select value={selectedStage.kind} onChange={(event) => {
              const kind = event.target.value as SharedScenarioAuthoringStage<TSnapshot>['kind']
              updateStage({ kind, media: kind === 'media' ? (selectedStage.media ?? { title: '', mediaKind: 'image', storagePath: '', mimeType: 'image/*' }) : selectedStage.media, question: kind === 'question' ? (selectedStage.question ?? questionDefault()) : selectedStage.question })
            }}><option value="state">State / controls</option><option value="media">Media</option><option value="question">Question / poll</option></select></label>
            <button type="button" onClick={duplicateStage}>Duplicate</button>
            <button type="button" disabled={document.stages.length <= 1} className="scenario-builder-danger" onClick={deleteStage}>Delete stage</button>
          </div>
          <label className="shared-scenario-notes"><span>Instructor notes</span><textarea rows={2} value={selectedStage.notes} onChange={(event) => updateStage({ notes: event.target.value })} /></label>

          {selectedStage.kind === 'state' && <StageTransitionEditor stage={selectedStage} stageIndex={document.stages.findIndex((stage) => stage.id === selectedStage.id)} adapter={adapter} onChange={updateStage} />}

          {selectedStage.kind === 'state' && <div className="shared-scenario-snapshot-editor">{adapter.renderSnapshotEditor(
            selectedStage.snapshot,
            (snapshot) => updateStage({ snapshot }),
            {
              appliedVariableIds: selectedStage.appliedVariableIds,
              onAppliedVariableIdsChange: (appliedVariableIds) => updateStage({ appliedVariableIds }),
            },
          )}</div>}

          {selectedStage.kind === 'media' && selectedStage.media && <div className="shared-scenario-content-card">
            <h3>Media stage</h3>
            <div className="shared-scenario-meta-grid">
              <label><span>Title</span><input value={selectedStage.media.title} onChange={(event) => updateStage({ media: { ...selectedStage.media!, title: event.target.value } })} /></label>
              <label><span>Media kind</span><select value={selectedStage.media.mediaKind} onChange={(event) => updateStage({ media: { ...selectedStage.media!, mediaKind: event.target.value as 'image' | 'video' } })}><option value="image">Image</option><option value="video">Video</option></select></label>
              <label className="wide"><span>Library media ID or storage path</span><input value={selectedStage.media.storagePath} onChange={(event) => updateStage({ media: { ...selectedStage.media!, storagePath: event.target.value } })} placeholder="Teaching media library item / storage path" /></label>
              <label><span>MIME type</span><input value={selectedStage.media.mimeType} onChange={(event) => updateStage({ media: { ...selectedStage.media!, mimeType: event.target.value } })} /></label>
            </div>
          </div>}

          {selectedStage.kind === 'question' && selectedStage.question && <div className="shared-scenario-content-card">
            <h3>Question / poll stage</h3>
            <div className="shared-scenario-meta-grid">
              <label><span>Kind</span><select value={selectedStage.question.kind} onChange={(event) => updateStage({ question: { ...selectedStage.question!, kind: event.target.value as 'mcq' | 'poll', correctOptionId: event.target.value === 'poll' ? null : selectedStage.question!.correctOptionId } })}><option value="mcq">MCQ</option><option value="poll">Poll</option></select></label>
              <label><span>Title</span><input value={selectedStage.question.title ?? ''} onChange={(event) => updateStage({ question: { ...selectedStage.question!, title: event.target.value || null } })} /></label>
              <label className="wide"><span>Question</span><textarea rows={3} value={selectedStage.question.body} onChange={(event) => updateStage({ question: { ...selectedStage.question!, body: event.target.value } })} /></label>
            </div>
            <div className="shared-scenario-question-options">
              {selectedStage.question.options.map((option, index) => <div key={option.id}><input type="radio" disabled={selectedStage.question?.kind !== 'mcq'} checked={selectedStage.question!.correctOptionId === option.id} onChange={() => updateStage({ question: { ...selectedStage.question!, correctOptionId: option.id } })} /><input value={option.text} onChange={(event) => updateStage({ question: { ...selectedStage.question!, options: selectedStage.question!.options.map((item) => item.id === option.id ? { ...item, text: event.target.value } : item) } })} /><button type="button" onClick={() => updateStage({ question: { ...selectedStage.question!, options: selectedStage.question!.options.filter((item) => item.id !== option.id), correctOptionId: selectedStage.question!.correctOptionId === option.id ? null : selectedStage.question!.correctOptionId } })}>×</button><small>{index + 1}</small></div>)}
              <button type="button" onClick={() => updateStage({ question: { ...selectedStage.question!, options: [...selectedStage.question!.options, { id: authoringId('option'), text: `Option ${selectedStage.question!.options.length + 1}` }] } })}>+ Add option</button>
            </div>
            <label><span>Explanation</span><textarea rows={2} value={selectedStage.question.explanation ?? ''} onChange={(event) => updateStage({ question: { ...selectedStage.question!, explanation: event.target.value || null } })} /></label>
          </div>}

          <section className="shared-scenario-paths">
            <div className="shared-scenario-section-heading"><div><span>Scenario flow</span><strong>Paths from this stage</strong><small>Each path has a destination and one or more conditions.</small></div><button type="button" disabled={document.stages.length < 2} onClick={addBranch}>+ Path</button></div>
            {stageBranches.sort((a, b) => a.priority - b.priority).map((branch) => {
              const conditions = pathTriggers(branch)
              return <div key={branch.id} className="shared-scenario-path-card">
                <div className="shared-scenario-path-header">
                  <label><span>Path name</span><input value={branch.label ?? ''} onChange={(event) => updateBranch(branch.id, { label: event.target.value })} placeholder="e.g. Continue, Deteriorates, Responds" /></label>
                  <label><span>Go to</span><select value={branch.toStageId} onChange={(event) => updateBranch(branch.id, { toStageId: event.target.value })}>{document.stages.filter((stage) => stage.id !== branch.fromStageId).map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
                  <label className="compact"><span>Priority</span><input type="number" min={0} value={branch.priority} onChange={(event) => updateBranch(branch.id, { priority: Number(event.target.value) || 0 })} /></label>
                  <label className="compact"><span>Match</span><select value={branch.triggerMode === 'all' ? 'all' : 'any'} onChange={(event) => updateBranch(branch.id, { triggerMode: event.target.value as 'any' | 'all' })}><option value="any">ANY</option><option value="all">ALL</option></select></label>
                  <label className="shared-scenario-check"><input type="checkbox" checked={branch.enabled !== false} onChange={(event) => updateBranch(branch.id, { enabled: event.target.checked })} /> Enabled</label>
                  <button type="button" className="scenario-builder-danger shared-scenario-trash-button" onClick={() => deleteBranch(branch.id)} aria-label="Remove path" title="Remove path"><TrashIcon /></button>
                </div>
                <div className="shared-scenario-path-conditions">
                  {conditions.map((trigger, conditionIndex) => <div className="shared-scenario-path-condition" key={trigger.id}>
                    {conditionIndex > 0 && <span className="shared-scenario-path-join">{branch.triggerMode === 'all' ? 'AND' : 'OR'}</span>}
                    <TriggerEditor trigger={trigger} adapter={adapter as SharedScenarioEditorAdapter<unknown, unknown>} onChange={(next) => updatePathCondition(branch, trigger.id, next)} onDelete={conditions.length > 1 ? () => removePathCondition(branch, trigger.id) : undefined} />
                  </div>)}
                  <button type="button" className="shared-scenario-add-condition" onClick={() => addPathCondition(branch)}>+ Condition</button>
                </div>
              </div>
            })}
            {!stageBranches.length && <div className="shared-scenario-end-stage"><strong>End stage</strong><span>No outgoing paths. Reaching this stage completes the scenario.</span></div>}
          </section>
        </div>}
      </div>

      <section className="shared-scenario-publish">
        <div><span>Self-directed assignment</span><strong>Publish an immutable product-aware copy</strong><small>Candidates entering the code will be routed to {adapter.productLabel} automatically.</small></div>
        <label><span>Expires after</span><input type="number" min={1} max={365} value={expiryDays} onChange={(event) => setExpiryDays(Math.max(1, Math.min(365, Number(event.target.value) || 1)))} /> days</label>
        <button type="button" className="scenario-builder-primary" onClick={() => void publish()}>Publish</button>
        {publication && <div className="shared-scenario-publication-result"><strong>{publication.code}</strong><input readOnly value={publication.url} /><button type="button" onClick={() => void navigator.clipboard.writeText(publication.url)}>Copy link</button><small>Expires {new Date(publication.expiresAt).toLocaleString()}</small></div>}
      </section>

      {message && <div className="scenario-builder-message">{message}</div>}
    </section>
  </div>
}
