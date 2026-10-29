import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  getInstructorAccount,
  signInInstructor,
  signOutInstructor,
  subscribeToInstructorAccount,
} from '../instructorAccount'
import { SimulationAboutDialog } from '../components/SimulationAboutDialog'
import {
  deleteEdusimAction,
  listEdusimActions,
  saveEdusimAction,
  type EdusimActionDefinition,
  type EdusimActionDraft,
  type EdusimActionKind,
  type EdusimActionSetting,
  type EdusimCandidateActionAccess,
  type EdusimShortPressAction,
} from '../edumon/actionLibrary'
import {
  DEFAULT_EDUSIM_ACTION_PRIORITY,
  EDUSIM_ACTION_EFFECT_CONSTRAINTS,
  EDUSIM_ACTION_EFFECT_TARGETS,
  getEdusimActionEffectTargetDefinition,
  type EdusimActionEffect,
  type EdusimActionEffectConstraint,
  type EdusimActionEffectOperation,
  type EdusimActionEffectTarget,
} from '../edusim/actions/ActionEffect'
import './actionEditor.css'

const ACTION_EDITOR_SELECTION_KEY = 'loppjusim.actionEditor.selectedId'

const emptyDraft = (): EdusimActionDraft => ({
  id: '',
  kind: 'drug',
  name: '',
  short_press_action: 'momentary',
  long_press_action: null,
  duration_seconds: 0,
  description: '',
  setting: 'ana',
  effects: [],
  candidate_access: 'allowed',
  priority: DEFAULT_EDUSIM_ACTION_PRIORITY,
  sort_order: 0,
})

function toDraft(action: EdusimActionDefinition): EdusimActionDraft {
  return {
    id: action.id,
    kind: action.kind,
    name: action.name,
    short_press_action: action.short_press_action,
    long_press_action: action.long_press_action,
    duration_seconds: action.duration_seconds,
    description: action.description,
    setting: action.setting,
    effects: action.effects.map((effect) => ({ ...effect })),
    candidate_access: action.candidate_access ?? 'instructor-only',
    priority: action.priority ?? DEFAULT_EDUSIM_ACTION_PRIORITY,
    sort_order: action.sort_order,
  }
}

function newEffectId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `effect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createEffect(): EdusimActionEffect {
  const target = EDUSIM_ACTION_EFFECT_TARGETS[0]
  return {
    id: newEffectId(),
    target: target.id,
    operation: target.allowedOperations[0],
    value: 0,
    onsetSeconds: 0,
    durationSeconds: 0,
    recoverySeconds: 0,
  }
}

const constraintLabel = (constraint: EdusimActionEffectConstraint): string => {
  switch (constraint) {
    case 'block-increase': return 'Block increase above reference'
    case 'block-decrease': return 'Block decrease below reference'
    case 'minimum': return 'Minimum value'
    case 'maximum': return 'Maximum value'
  }
}

export function ActionEditorApp() {
  const [account, setAccount] = useState<User | null>(null)
  const [actions, setActions] = useState<EdusimActionDefinition[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const [draft, setDraft] = useState<EdusimActionDraft>(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)

  const selected = useMemo(() => actions.find((action) => action.id === selectedId) ?? null, [actions, selectedId])

  useEffect(() => {
    selectedIdRef.current = selectedId
    try {
      if (selectedId) sessionStorage.setItem(ACTION_EDITOR_SELECTION_KEY, selectedId)
      else sessionStorage.removeItem(ACTION_EDITOR_SELECTION_KEY)
    } catch {
      // Session storage can be unavailable in restricted browser contexts.
    }
  }, [selectedId])

  const refresh = async (preferredId?: string) => {
    const rows = await listEdusimActions()
    setActions(rows)
    let storedId: string | null = null
    try { storedId = sessionStorage.getItem(ACTION_EDITOR_SELECTION_KEY) } catch { /* ignore */ }
    const requestedId = preferredId ?? selectedIdRef.current ?? storedId
    const id = requestedId && rows.some((action) => action.id === requestedId)
      ? requestedId
      : rows[0]?.id ?? null
    selectedIdRef.current = id
    setSelectedId(id)
    const row = rows.find((action) => action.id === id)
    setDraft(row ? toDraft(row) : emptyDraft())
  }

  useEffect(() => {
    let active = true
    void getInstructorAccount()
      .then(async (user) => {
        if (!active) return
        setAccount(user)
        if (user) await refresh()
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : 'Unable to open the action library.'))
      .finally(() => active && setLoading(false))

    const unsubscribe = subscribeToInstructorAccount((user) => {
      if (!active) return
      setAccount(user)
      if (user) void refresh()
      else {
        setActions([])
        selectedIdRef.current = null
        setSelectedId(null)
        setDraft(emptyDraft())
      }
    })
    return () => { active = false; unsubscribe() }
  }, [])

  useEffect(() => {
    if (selected) setDraft(toDraft(selected))
  }, [selected])

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(null); setMessage(null)
    try {
      const user = await signInInstructor(email, password)
      setAccount(user)
      setPassword('')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.')
    } finally { setBusy(false) }
  }

  const signOut = async () => {
    setBusy(true)
    try {
      await signOutInstructor()
      setAccount(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out.')
    } finally { setBusy(false) }
  }

  const beginNew = (kind: EdusimActionKind = 'drug') => {
    selectedIdRef.current = null
    setSelectedId(null)
    setDraft({
      ...emptyDraft(),
      kind,
      candidate_access: kind === 'drug' ? 'allowed' : 'instructor-only',
      sort_order: actions.filter((action) => action.kind === kind).length * 10 + 10,
    })
    setMessage(null); setError(null)
  }

  const addEffect = () => {
    setDraft((current) => ({ ...current, effects: [...current.effects, createEffect()] }))
  }

  const updateEffect = (effectId: string, patch: Partial<EdusimActionEffect>) => {
    setDraft((current) => ({
      ...current,
      effects: current.effects.map((effect) => effect.id === effectId ? { ...effect, ...patch } : effect),
    }))
  }

  const changeEffectTarget = (effect: EdusimActionEffect, target: EdusimActionEffectTarget) => {
    const targetDefinition = getEdusimActionEffectTargetDefinition(target)
    const operation = targetDefinition.allowedOperations.includes(effect.operation)
      ? effect.operation
      : targetDefinition.allowedOperations[0]
    updateEffect(effect.id, { target, operation })
  }

  const changeEffectOperation = (effect: EdusimActionEffect, operation: EdusimActionEffectOperation) => {
    updateEffect(effect.id, {
      operation,
      constraint: operation === 'constraint' ? (effect.constraint ?? 'block-increase') : undefined,
    })
  }

  const removeEffect = (effectId: string) => {
    setDraft((current) => ({ ...current, effects: current.effects.filter((effect) => effect.id !== effectId) }))
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const id = draft.id.trim().toLowerCase()
    if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      setError('ID must use lowercase letters, numbers and hyphens only.')
      return
    }
    if (!draft.name.trim()) { setError('Name is required.'); return }
    setBusy(true); setError(null); setMessage(null)
    try {
      const row = await saveEdusimAction({ ...draft, id })
      await refresh(row.id)
      setMessage(`Saved “${row.name}”.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save action.')
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!selected) return
    if (!window.confirm(`Delete “${selected.name}” from the shared action library?`)) return
    setBusy(true); setError(null); setMessage(null)
    try {
      await deleteEdusimAction(selected.id)
      selectedIdRef.current = null
      setSelectedId(null)
      await refresh()
      setMessage(`Deleted “${selected.name}”.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete action.')
    } finally { setBusy(false) }
  }

  const close = () => window.location.assign('/edumon/ana')

  return (
    <main className="action-editor-app">
      <SimulationAboutDialog
        open={aboutOpen}
        productLabel="LoppjuSIM"
        title="Drug & Event Library Editor"
        description="The shared LoppjuSIM authoring tool for maintaining drug, event and declarative-effect definitions used in educational simulation."
        onClose={() => setAboutOpen(false)}
        legalContext="authoring"
      />
      <header className="action-editor-appbar">
        <div>
          <span>LoppjuSIM shared authoring</span>
          <h1>Drug & Event Editor</h1>
          <small>Shared action definitions for LoppjuSIM-Anaesth and LoppjuSIM-ICU</small>
        </div>
        <div className="action-editor-appbar-actions">
          {account && <span>{account.email}</span>}
          {account && <button type="button" onClick={() => void signOut()} disabled={busy}>Sign out</button>}
          <button type="button" onClick={() => setAboutOpen(true)}>About</button>
          <button type="button" className="primary" onClick={close}>Return to LoppjuSIM-Anaesth</button>
        </div>
      </header>

      {loading ? <section className="action-editor-state">Loading action library…</section> : !account ? (
        <section className="action-editor-signin">
          <div><span>Instructor only</span><h2>Sign in to edit actions</h2><p>The action library is shared between permanent instructor accounts.</p></div>
          <form onSubmit={signIn}>
            <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
            <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
            <button type="submit" className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          {error && <div className="action-editor-error">{error}</div>}
        </section>
      ) : (
        <section className="action-editor-workspace">
          <aside className="action-editor-list">
            <div className="action-editor-list-actions">
              <button type="button" onClick={() => beginNew('drug')}>+ Drug</button>
              <button type="button" onClick={() => beginNew('event')}>+ Event</button>
            </div>
            {(['drug', 'event'] as const).map((kind) => (
              <div key={kind} className="action-editor-group">
                <h2>{kind === 'drug' ? 'Drugs' : 'Events'}</h2>
                {actions.filter((action) => action.kind === kind).map((action) => (
                  <button key={action.id} type="button" className={selectedId === action.id ? 'selected' : ''} onClick={() => setSelectedId(action.id)}>
                    <strong>{action.name}</strong><small>{action.id} · {action.short_press_action} · {action.setting.toUpperCase()} · {action.candidate_access ?? 'instructor-only'} · P{action.priority ?? DEFAULT_EDUSIM_ACTION_PRIORITY}</small>
                  </button>
                ))}
              </div>
            ))}
          </aside>

          <form className="action-editor-form" onSubmit={save}>
            <div className="action-editor-heading">
              <div><span>{selected ? 'Edit definition' : 'New definition'}</span><h2>{draft.name || 'Untitled action'}</h2></div>
              {selected && <button type="button" className="danger" onClick={() => void remove()} disabled={busy}>Delete</button>}
            </div>

            <div className="action-editor-grid">
              <label><span>ID</span><input value={draft.id} disabled={Boolean(selected)} onChange={(event) => setDraft({ ...draft, id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="e.g. propofol" required /></label>
              <label><span>Name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
              <label><span>Type</span><select value={draft.kind} onChange={(event) => { const kind = event.target.value as EdusimActionKind; setDraft({ ...draft, kind, candidate_access: kind === 'drug' ? 'allowed' : 'instructor-only' }) }}><option value="drug">Drug</option><option value="event">Event</option></select></label>
              <label><span>Setting</span><select value={draft.setting} onChange={(event) => setDraft({ ...draft, setting: event.target.value as EdusimActionSetting })}><option value="ana">Anaesthesia</option><option value="itu">ITU</option><option value="all">All</option></select></label>
              <label><span>Candidate access</span><select value={draft.candidate_access ?? 'instructor-only'} onChange={(event) => setDraft({ ...draft, candidate_access: event.target.value as EdusimCandidateActionAccess })}><option value="allowed">Allowed</option><option value="instructor-only">Instructor only</option><option value="scenario">Scenario controlled</option></select></label>
              <label><span>Short press</span><select value={draft.short_press_action} onChange={(event) => setDraft({ ...draft, short_press_action: event.target.value as EdusimShortPressAction })}><option value="momentary">Momentary</option><option value="toggle">Toggle</option></select></label>
              <label><span>Long press</span><input value="Not configured yet" disabled /></label>
              <label><span>Duration of action</span><div className="action-editor-number"><input type="number" min="0" step="0.1" value={draft.duration_seconds} onChange={(event) => setDraft({ ...draft, duration_seconds: Math.max(0, Number(event.target.value) || 0) })} /><small>seconds</small></div></label>
              <label><span>Priority</span><input type="number" step="1" value={draft.priority ?? DEFAULT_EDUSIM_ACTION_PRIORITY} onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) || 0 })} /><small>Higher resolves later; ordinary default is 30</small></label>
              <label><span>Order</span><input type="number" step="1" value={draft.sort_order} onChange={(event) => setDraft({ ...draft, sort_order: Number(event.target.value) || 0 })} /></label>
            </div>

            <label className="action-editor-description"><span>Description</span><textarea rows={5} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Instructor-facing description of the action and intended physiological effect." /></label>

            <section className="action-editor-effects" aria-label="Physiological effects">
              <div className="action-editor-effects-heading">
                <div>
                  <span>Effects</span>
                  <h3>Declarative physiological effects</h3>
                  <p>Effects are interpreted by the physiology engine. Priority is target-specific: an effect may inherit the action priority or override it.</p>
                </div>
                <button type="button" onClick={addEffect}>+ Add effect</button>
              </div>

              {draft.effects.length === 0 ? (
                <div className="action-editor-effects-empty">No physiological effects have been defined for this action.</div>
              ) : (
                <div className="action-editor-effects-list">
                  {draft.effects.map((effect) => {
                    const targetDefinition = getEdusimActionEffectTargetDefinition(effect.target)
                    return (
                      <div className="action-editor-effect-row" key={effect.id}>
                        <label className="effect-target"><span>Target</span><select value={effect.target} onChange={(event) => changeEffectTarget(effect, event.target.value as EdusimActionEffectTarget)}>{EDUSIM_ACTION_EFFECT_TARGETS.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select></label>
                        <div className="effect-operation-stack">
                          <label><span>Operation</span><select value={effect.operation} onChange={(event) => changeEffectOperation(effect, event.target.value as EdusimActionEffectOperation)}>{targetDefinition.allowedOperations.map((operation) => <option key={operation} value={operation}>{operation}</option>)}</select></label>
                          {effect.operation === 'constraint' && <label className="effect-constraint"><span>Constraint</span><select value={effect.constraint ?? 'block-increase'} onChange={(event) => updateEffect(effect.id, { constraint: event.target.value as EdusimActionEffectConstraint })}>{EDUSIM_ACTION_EFFECT_CONSTRAINTS.map((constraint) => <option key={constraint} value={constraint}>{constraintLabel(constraint)}</option>)}</select></label>}
                        </div>
                        <label><span>Value{targetDefinition.unit ? ` (${targetDefinition.unit})` : ''}</span><input type="number" step="any" value={effect.value} onChange={(event) => updateEffect(effect.id, { value: Number(event.target.value) || 0 })} /></label>
                        <label><span>Priority override</span><input type="number" step="1" placeholder={`inherit ${draft.priority ?? DEFAULT_EDUSIM_ACTION_PRIORITY}`} value={effect.priority ?? ''} onChange={(event) => updateEffect(effect.id, { priority: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>
                        <label><span>Onset (s)</span><input type="number" min="0" step="0.1" value={effect.onsetSeconds} onChange={(event) => updateEffect(effect.id, { onsetSeconds: Math.max(0, Number(event.target.value) || 0) })} /></label>
                        <label><span>Duration (s)</span><input type="number" min="0" step="0.1" value={effect.durationSeconds} onChange={(event) => updateEffect(effect.id, { durationSeconds: Math.max(0, Number(event.target.value) || 0) })} /></label>
                        <label><span>Recovery (s)</span><input type="number" min="0" step="0.1" value={effect.recoverySeconds} onChange={(event) => updateEffect(effect.id, { recoverySeconds: Math.max(0, Number(event.target.value) || 0) })} /></label>
                        <button type="button" className="danger action-editor-effect-remove" onClick={() => removeEffect(effect.id)} aria-label={`Remove ${targetDefinition.label} effect`}>Remove</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <div className="action-editor-footer">
              <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save action'}</button>
              {message && <span className="action-editor-message">{message}</span>}
              {error && <span className="action-editor-error">{error}</span>}
            </div>
          </form>
        </section>
      )}
    </main>
  )
}

export default ActionEditorApp