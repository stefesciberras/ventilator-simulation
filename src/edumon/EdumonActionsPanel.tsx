import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getInstructorAccount, subscribeToInstructorAccount } from '../teaching/account/InstructorAccountService'
import {
  listEdusimActions,
  type EdusimActionDefinition,
  type EdusimActionEnvironment,
} from './actionLibrary'
import './edumon-actions.css'

export type EdumonActionSectionId = 'drugs' | 'events'

interface EdumonActionSectionProps {
  id: EdumonActionSectionId
  title: string
  children?: ReactNode
}

interface EdumonActionButtonProps {
  definition: EdusimActionDefinition
  active: boolean
  onSelect: (definition: EdusimActionDefinition) => void
}

const FALLBACK_ANA_ACTIONS: EdusimActionDefinition[] = [
  { id: 'propofol', kind: 'drug', name: 'Propofol', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: '', setting: 'ana', environments: ['edumon-ana'], effects: [], sort_order: 10, created_at: '', updated_at: '' },
  {
    id: 'fentanyl',
    kind: 'drug',
    name: 'Fentanyl',
    short_press_action: 'momentary',
    long_press_action: null,
    duration_seconds: 0,
    description: 'Opioid action with modest bradycardic and respiratory-depressant effects plus attenuation of nociceptive response.',
    setting: 'ana',
    environments: ['edumon-ana'],
    effects: [
      { id: 'fentanyl-heart-rate', target: 'haemodynamics.heartRate', operation: 'offset', value: -6, onsetSeconds: 15, durationSeconds: 180, recoverySeconds: 120 },
      { id: 'fentanyl-respiratory-drive', target: 'respiration.drive', operation: 'multiplier', value: 0.75, onsetSeconds: 20, durationSeconds: 240, recoverySeconds: 180 },
      { id: 'fentanyl-nociceptive-response', target: 'anaesthesia.nociceptiveResponse', operation: 'multiplier', value: 0.55, onsetSeconds: 15, durationSeconds: 300, recoverySeconds: 180 },
    ],
    sort_order: 20,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'atracurium',
    kind: 'drug',
    name: 'Atracurium',
    short_press_action: 'momentary',
    long_press_action: null,
    duration_seconds: 0,
    description: 'Non-depolarising neuromuscular blocker. The drug acts on neuromuscular block rather than directly suppressing central respiratory drive.',
    setting: 'ana',
    environments: ['edumon-ana'],
    effects: [
      { id: 'atracurium-neuromuscular-block', target: 'neuromuscular.block', operation: 'target', value: 1, onsetSeconds: 120, durationSeconds: 1200, recoverySeconds: 600 },
    ],
    sort_order: 30,
    created_at: '',
    updated_at: '',
  },
  { id: 'tiva', kind: 'drug', name: 'TIVA', short_press_action: 'toggle', long_press_action: null, duration_seconds: 0, description: '', setting: 'ana', environments: ['edumon-ana'], effects: [], sort_order: 40, created_at: '', updated_at: '' },
  { id: 'induction', kind: 'event', name: 'Induction', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: '', setting: 'ana', environments: ['edumon-ana'], effects: [], sort_order: 10, created_at: '', updated_at: '' },
  { id: 'maintenance', kind: 'event', name: 'Maintenance', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: '', setting: 'ana', environments: ['edumon-ana'], effects: [], sort_order: 20, created_at: '', updated_at: '' },
  { id: 'awakening', kind: 'event', name: 'Awakening', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: '', setting: 'ana', environments: ['edumon-ana'], effects: [], sort_order: 30, created_at: '', updated_at: '' },
]

function currentEnvironment(): EdusimActionEnvironment {
  return window.location.pathname.startsWith('/edumon/icu') ? 'edumon-icu' : 'edumon-ana'
}

function EdumonActionSection({ id, title, children }: EdumonActionSectionProps) {
  const [collapsed, setCollapsed] = useState(true)

  return (
    <section className="edumon-action-section" aria-label={title} data-action-section={id}>
      <div className="edumon-action-section-heading">
        <div><h3>{title}</h3></div>
        <button
          type="button"
          className={`edumon-action-collapse ${collapsed ? 'collapsed' : 'expanded'}`}
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        >
          <span className="edumon-action-collapse-caret" aria-hidden="true" />
        </button>
      </div>

      {!collapsed && <div className="edumon-action-section-body">{children}</div>}
    </section>
  )
}

function EdumonActionButton({ definition, active, onSelect }: EdumonActionButtonProps) {
  const detail = [
    definition.description,
    definition.duration_seconds > 0 ? `Duration ${definition.duration_seconds}s` : '',
    definition.long_press_action ? `Long press: ${definition.long_press_action}` : '',
  ].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      className={`edumon-action-button ${definition.short_press_action} ${active ? 'active' : ''}`.trim()}
      aria-pressed={definition.short_press_action === 'toggle' ? active : undefined}
      onClick={() => onSelect(definition)}
      title={detail || undefined}
    >
      {definition.name}
    </button>
  )
}

export function EdumonActionsPanel() {
  const environment = currentEnvironment()
  const fallback = environment === 'edumon-ana' ? FALLBACK_ANA_ACTIONS : []
  const [definitions, setDefinitions] = useState<EdusimActionDefinition[]>(fallback)
  const [toggleStates, setToggleStates] = useState<Set<string>>(new Set())
  const [flashing, setFlashing] = useState<Set<string>>(new Set())
  const [canEdit, setCanEdit] = useState(false)
  const timersRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    let active = true
    void listEdusimActions(environment)
      .then((rows) => { if (active) setDefinitions(rows) })
      .catch(() => { if (active) setDefinitions(fallback) })
    return () => { active = false }
  }, [environment])

  useEffect(() => {
    let active = true
    void getInstructorAccount().then((user) => { if (active) setCanEdit(Boolean(user)) }).catch(() => { if (active) setCanEdit(false) })
    const unsubscribe = subscribeToInstructorAccount((user) => { if (active) setCanEdit(Boolean(user)) })
    return () => { active = false; unsubscribe() }
  }, [])

  useEffect(() => () => {
    for (const timer of timersRef.current.values()) window.clearTimeout(timer)
    timersRef.current.clear()
  }, [])

  const trigger = (definition: EdusimActionDefinition) => {
    if (definition.short_press_action === 'toggle') {
      setToggleStates((current) => {
        const next = new Set(current)
        if (next.has(definition.id)) next.delete(definition.id)
        else next.add(definition.id)
        return next
      })
      return
    }

    setFlashing((current) => new Set(current).add(definition.id))
    const existing = timersRef.current.get(definition.id)
    if (existing != null) window.clearTimeout(existing)
    const timer = window.setTimeout(() => {
      timersRef.current.delete(definition.id)
      setFlashing((current) => {
        const next = new Set(current)
        next.delete(definition.id)
        return next
      })
    }, 1000)
    timersRef.current.set(definition.id, timer)
  }

  const isActive = (definition: EdusimActionDefinition) => definition.short_press_action === 'toggle'
    ? toggleStates.has(definition.id)
    : flashing.has(definition.id)

  const drugs = definitions.filter((definition) => definition.kind === 'drug')
  const events = definitions.filter((definition) => definition.kind === 'event')

  const renderGroup = (items: EdusimActionDefinition[], label: string) => items.length ? (
    <div className="edumon-action-grid" role="group" aria-label={label}>
      {items.map((definition) => (
        <EdumonActionButton key={definition.id} definition={definition} active={isActive(definition)} onSelect={trigger} />
      ))}
    </div>
  ) : <div className="edumon-action-empty">No actions are currently available for this monitor.</div>

  return (
    <div className="edumon-actions-panel" aria-label="Clinical actions">
      {canEdit && (
        <div className="edumon-action-library-tools">
          <button type="button" onClick={() => window.location.assign('/actions')}>Edit action library</button>
        </div>
      )}
      <EdumonActionSection id="drugs" title="Drugs">{renderGroup(drugs, 'Drug actions')}</EdumonActionSection>
      <EdumonActionSection id="events" title="Events">{renderGroup(events, 'Event actions')}</EdumonActionSection>
    </div>
  )
}
