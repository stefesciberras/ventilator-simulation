import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { getInstructorAccount, subscribeToInstructorAccount } from '../teaching/account/InstructorAccountService'
import { activateAction, getActiveEffects, getActionRuntimeSimulationTime, setActionIntensity } from '../edusim/actions/ActionRuntime'
import { listEdusimActions, type EdusimActionDefinition, type EdusimActionEnvironment } from './actionLibrary'
import './edumon-actions.css'

export type EdumonActionSectionId = 'drugs' | 'events'
type ActionLevel = 'low' | 'medium' | 'high'
type DrugClass = 'anaesthesia' | 'cardiovascular'
type EventClass = 'anaesthesia' | 'cardiovascular' | 'respiratory'

const LEVEL_STEPS: Record<ActionLevel, { label: string; scale: number; bars: number }> = {
  low: { label: 'Low', scale: 0.65, bars: 1 },
  medium: { label: 'Medium', scale: 1, bars: 2 },
  high: { label: 'High', scale: 1.35, bars: 3 },
}

// Retain the instructor's chosen level across ACTIONS panel remounts. Running toggle
// truth still comes from ActionRuntime; this map only remembers the next selected level
// when an adjustable action is not currently running.
const ACTION_LEVEL_SELECTIONS = new Map<string, ActionLevel>()

const CARDIOVASCULAR_DRUG_IDS = new Set(['atropine', 'ephedrine', 'phenylephrine', 'noradrenaline', 'adrenaline'])
const CARDIOVASCULAR_EVENT_IDS = new Set(['hypertension', 'hypotension', 'tachycardia', 'bradycardia', 'hypovolaemia', 'bleeding', 'beta-blocker'])
const RESPIRATORY_EVENT_IDS = new Set(['apnoea', 'diaphragm-return', 'bronchospasm'])

const FALLBACK_ANA_ACTIONS: EdusimActionDefinition[] = [
  { id: 'propofol', kind: 'drug', name: 'Propofol', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: 'Generic Propofol bolus: increases hypnotic effect, depresses spontaneous respiratory drive and lowers mean arterial pressure.', setting: 'ana', environments: ['edumon-ana'], effects: [
    { id: 'propofol-hypnotic-effect', target: 'anaesthesia.hypnoticEffect', operation: 'offset', value: 0.65, onsetSeconds: 25, durationSeconds: 180, recoverySeconds: 240 },
    { id: 'propofol-respiratory-drive', target: 'respiration.drive', operation: 'multiplier', value: 0.4, onsetSeconds: 20, durationSeconds: 150, recoverySeconds: 180 },
    { id: 'propofol-map', target: 'haemodynamics.meanArterialPressure', operation: 'offset', value: -15, onsetSeconds: 20, durationSeconds: 180, recoverySeconds: 180 },
  ], sort_order: 10, created_at: '', updated_at: '' },
  { id: 'fentanyl', kind: 'drug', name: 'Fentanyl', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: 'Opioid action with modest bradycardic and respiratory-depressant effects plus attenuation of nociceptive response.', setting: 'ana', environments: ['edumon-ana'], effects: [
    { id: 'fentanyl-heart-rate', target: 'haemodynamics.heartRate', operation: 'offset', value: -6, onsetSeconds: 15, durationSeconds: 180, recoverySeconds: 120 },
    { id: 'fentanyl-respiratory-drive', target: 'respiration.drive', operation: 'multiplier', value: 0.75, onsetSeconds: 20, durationSeconds: 240, recoverySeconds: 180 },
    { id: 'fentanyl-nociceptive-response', target: 'anaesthesia.nociceptiveResponse', operation: 'multiplier', value: 0.55, onsetSeconds: 15, durationSeconds: 300, recoverySeconds: 180 },
  ], sort_order: 20, created_at: '', updated_at: '' },
  { id: 'remifentanil', kind: 'drug', name: 'Remifentanil infusion', short_press_action: 'toggle', long_press_action: 'dose-levels', duration_seconds: 0, description: 'Toggle Remifentanil infusion. Long press selects low, medium or high infusion intensity.', setting: 'ana', environments: ['edumon-ana'], effects: [
    { id: 'remifentanil-nociceptive-response', target: 'anaesthesia.nociceptiveResponse', operation: 'multiplier', value: 0.35, onsetSeconds: 45, durationSeconds: 0, recoverySeconds: 90 },
    { id: 'remifentanil-respiratory-drive', target: 'respiration.drive', operation: 'multiplier', value: 0.65, onsetSeconds: 45, durationSeconds: 0, recoverySeconds: 90 },
    { id: 'remifentanil-heart-rate', target: 'haemodynamics.heartRate', operation: 'offset', value: -5, onsetSeconds: 45, durationSeconds: 0, recoverySeconds: 90 },
  ], sort_order: 30, created_at: '', updated_at: '' },
  { id: 'relaxant', kind: 'drug', name: 'Relaxant', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: 'Generic non-depolarising neuromuscular blocker.', setting: 'ana', environments: ['edumon-ana'], effects: [{ id: 'relaxant-neuromuscular-block', target: 'neuromuscular.block', operation: 'target', value: 1, onsetSeconds: 120, durationSeconds: 1200, recoverySeconds: 600 }], sort_order: 40, created_at: '', updated_at: '' },
  { id: 'neostigmine', kind: 'drug', name: 'Neostigmine', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: 'Slower, incomplete generic neuromuscular-block reversal.', setting: 'ana', environments: ['edumon-ana'], effects: [{ id: 'neostigmine-neuromuscular-reversal', target: 'neuromuscular.block', operation: 'target', value: 0.2, onsetSeconds: 180, durationSeconds: 7200, recoverySeconds: 0 }], sort_order: 45, created_at: '', updated_at: '' },
  { id: 'sugammadex', kind: 'drug', name: 'Sugammadex', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: 'Rapid generic neuromuscular-block reversal. Current model does not yet distinguish relaxant class.', setting: 'ana', environments: ['edumon-ana'], effects: [{ id: 'sugammadex-neuromuscular-reversal', target: 'neuromuscular.block', operation: 'target', value: 0, onsetSeconds: 60, durationSeconds: 7200, recoverySeconds: 0 }], sort_order: 47, created_at: '', updated_at: '' },
  { id: 'tiva', kind: 'drug', name: 'TIVA (Propofol TCI)', short_press_action: 'toggle', long_press_action: 'dose-levels', duration_seconds: 0, description: 'Toggle Propofol TCI-style infusion. Long press selects target intensity.', setting: 'ana', environments: ['edumon-ana'], effects: [
    { id: 'tiva-hypnotic-effect', target: 'anaesthesia.hypnoticEffect', operation: 'offset', value: 0.85, onsetSeconds: 60, durationSeconds: 0, recoverySeconds: 300 },
    { id: 'tiva-respiratory-drive', target: 'respiration.drive', operation: 'multiplier', value: 0.55, onsetSeconds: 60, durationSeconds: 0, recoverySeconds: 240 },
    { id: 'tiva-map', target: 'haemodynamics.meanArterialPressure', operation: 'offset', value: -12, onsetSeconds: 60, durationSeconds: 0, recoverySeconds: 240 },
  ], sort_order: 50, created_at: '', updated_at: '' },
  { id: 'atropine', kind: 'drug', name: 'Atropine', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: 'Cardiovascular rescue bolus with predominantly chronotropic effect.', setting: 'ana', environments: ['edumon-ana'], effects: [{ id: 'atropine-heart-rate', target: 'haemodynamics.heartRate', operation: 'offset', value: 25, onsetSeconds: 20, durationSeconds: 300, recoverySeconds: 300 }], sort_order: 110, created_at: '', updated_at: '' },
  { id: 'ephedrine', kind: 'drug', name: 'Ephedrine', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: 'Mixed cardiovascular vasopressor bolus.', setting: 'ana', environments: ['edumon-ana'], effects: [
    { id: 'ephedrine-heart-rate', target: 'haemodynamics.heartRate', operation: 'offset', value: 12, onsetSeconds: 15, durationSeconds: 240, recoverySeconds: 240 },
    { id: 'ephedrine-map', target: 'haemodynamics.meanArterialPressure', operation: 'offset', value: 15, onsetSeconds: 15, durationSeconds: 240, recoverySeconds: 240 },
  ], sort_order: 120, created_at: '', updated_at: '' },
  { id: 'phenylephrine', kind: 'drug', name: 'Phenylephrine', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: 'Vasopressor bolus with modest reflex bradycardia.', setting: 'ana', environments: ['edumon-ana'], effects: [
    { id: 'phenylephrine-map', target: 'haemodynamics.meanArterialPressure', operation: 'offset', value: 25, onsetSeconds: 15, durationSeconds: 180, recoverySeconds: 180 },
    { id: 'phenylephrine-heart-rate', target: 'haemodynamics.heartRate', operation: 'offset', value: -8, onsetSeconds: 20, durationSeconds: 180, recoverySeconds: 180 },
  ], sort_order: 130, created_at: '', updated_at: '' },
  { id: 'noradrenaline', kind: 'drug', name: 'Noradrenaline infusion', short_press_action: 'toggle', long_press_action: 'dose-levels', duration_seconds: 0, description: 'Toggle noradrenaline infusion. Long press selects infusion intensity.', setting: 'ana', environments: ['edumon-ana'], effects: [
    { id: 'noradrenaline-map', target: 'haemodynamics.meanArterialPressure', operation: 'offset', value: 20, onsetSeconds: 30, durationSeconds: 0, recoverySeconds: 60 },
    { id: 'noradrenaline-heart-rate', target: 'haemodynamics.heartRate', operation: 'offset', value: -3, onsetSeconds: 30, durationSeconds: 0, recoverySeconds: 60 },
  ], sort_order: 140, created_at: '', updated_at: '' },
  { id: 'adrenaline', kind: 'drug', name: 'Adrenaline infusion', short_press_action: 'toggle', long_press_action: 'dose-levels', duration_seconds: 0, description: 'Toggle adrenaline infusion. Long press selects infusion intensity.', setting: 'ana', environments: ['edumon-ana'], effects: [
    { id: 'adrenaline-map', target: 'haemodynamics.meanArterialPressure', operation: 'offset', value: 15, onsetSeconds: 20, durationSeconds: 0, recoverySeconds: 45 },
    { id: 'adrenaline-heart-rate', target: 'haemodynamics.heartRate', operation: 'offset', value: 15, onsetSeconds: 20, durationSeconds: 0, recoverySeconds: 45 },
  ], sort_order: 150, created_at: '', updated_at: '' },

  { id: 'induction', kind: 'event', name: 'Induction', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: '', setting: 'ana', environments: ['edumon-ana'], effects: [], sort_order: 10, created_at: '', updated_at: '' },
  { id: 'maintenance', kind: 'event', name: 'Maintenance', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: '', setting: 'ana', environments: ['edumon-ana'], effects: [], sort_order: 20, created_at: '', updated_at: '' },
  { id: 'awakening', kind: 'event', name: 'Awakening', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: '', setting: 'ana', environments: ['edumon-ana'], effects: [], sort_order: 30, created_at: '', updated_at: '' },
  { id: 'laryngoscopy', kind: 'event', name: 'Laryngoscopy', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: 'Brief intense sympathetic/nociceptive stimulus.', setting: 'ana', environments: ['edumon-ana'], effects: [{ id: 'laryngoscopy-sympathetic-stimulus', target: 'stimulus.sympathetic', operation: 'offset', value: 1, onsetSeconds: 2, durationSeconds: 30, recoverySeconds: 30 }], sort_order: 40, created_at: '', updated_at: '' },
  { id: 'pain', kind: 'event', name: 'Pain', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: 'Moderate nociceptive stimulus.', setting: 'ana', environments: ['edumon-ana'], effects: [{ id: 'pain-sympathetic-stimulus', target: 'stimulus.sympathetic', operation: 'offset', value: 0.55, onsetSeconds: 3, durationSeconds: 120, recoverySeconds: 60 }], sort_order: 50, created_at: '', updated_at: '' },
  { id: 'surgery', kind: 'event', name: 'Surgery', short_press_action: 'toggle', long_press_action: null, duration_seconds: 0, description: 'Toggle sustained operative nociceptive stimulus.', setting: 'ana', environments: ['edumon-ana'], effects: [{ id: 'surgery-sympathetic-stimulus', target: 'stimulus.sympathetic', operation: 'offset', value: 0.75, onsetSeconds: 5, durationSeconds: 0, recoverySeconds: 30 }], sort_order: 60, created_at: '', updated_at: '' },

  { id: 'hypertension', kind: 'event', name: 'Hypertension', short_press_action: 'toggle', long_press_action: null, duration_seconds: 0, description: 'Toggle sustained hypertension.', setting: 'ana', environments: ['edumon-ana'], effects: [{ id: 'hypertension-map', target: 'haemodynamics.meanArterialPressure', operation: 'offset', value: 30, onsetSeconds: 15, durationSeconds: 0, recoverySeconds: 30 }], sort_order: 110, created_at: '', updated_at: '' },
  { id: 'hypotension', kind: 'event', name: 'Hypotension', short_press_action: 'toggle', long_press_action: null, duration_seconds: 0, description: 'Toggle sustained hypotension.', setting: 'ana', environments: ['edumon-ana'], effects: [{ id: 'hypotension-map', target: 'haemodynamics.meanArterialPressure', operation: 'offset', value: -30, onsetSeconds: 15, durationSeconds: 0, recoverySeconds: 30 }], sort_order: 120, created_at: '', updated_at: '' },
  { id: 'tachycardia', kind: 'event', name: 'Tachycardia', short_press_action: 'toggle', long_press_action: null, duration_seconds: 0, description: 'Toggle sustained tachycardia.', setting: 'ana', environments: ['edumon-ana'], effects: [{ id: 'tachycardia-heart-rate', target: 'haemodynamics.heartRate', operation: 'offset', value: 40, onsetSeconds: 10, durationSeconds: 0, recoverySeconds: 20 }], sort_order: 130, created_at: '', updated_at: '' },
  { id: 'bradycardia', kind: 'event', name: 'Bradycardia', short_press_action: 'toggle', long_press_action: null, duration_seconds: 0, description: 'Toggle sustained bradycardia.', setting: 'ana', environments: ['edumon-ana'], effects: [{ id: 'bradycardia-heart-rate', target: 'haemodynamics.heartRate', operation: 'offset', value: -35, onsetSeconds: 10, durationSeconds: 0, recoverySeconds: 20 }], sort_order: 140, created_at: '', updated_at: '' },
  { id: 'hypovolaemia', kind: 'event', name: 'Hypovolaemia', short_press_action: 'toggle', long_press_action: 'severity-levels', duration_seconds: 0, description: 'Toggle hypovolaemia. Long press selects low, medium or high severity.', setting: 'ana', environments: ['edumon-ana'], effects: [
    { id: 'hypovolaemia-map', target: 'haemodynamics.meanArterialPressure', operation: 'offset', value: -20, onsetSeconds: 30, durationSeconds: 0, recoverySeconds: 90, releaseBehaviour: 'persist' },
    { id: 'hypovolaemia-heart-rate', target: 'haemodynamics.heartRate', operation: 'offset', value: 15, onsetSeconds: 30, durationSeconds: 0, recoverySeconds: 90, releaseBehaviour: 'persist' },
  ], sort_order: 150, created_at: '', updated_at: '' },
  { id: 'bleeding', kind: 'event', name: 'Bleeding', short_press_action: 'toggle', long_press_action: 'severity-levels', duration_seconds: 0, description: 'Toggle active bleeding. Long press selects low, medium or high severity.', setting: 'ana', environments: ['edumon-ana'], effects: [
    { id: 'bleeding-map', target: 'haemodynamics.meanArterialPressure', operation: 'offset', value: -25, onsetSeconds: 20, durationSeconds: 0, recoverySeconds: 120, releaseBehaviour: 'persist' },
    { id: 'bleeding-heart-rate', target: 'haemodynamics.heartRate', operation: 'offset', value: 20, onsetSeconds: 20, durationSeconds: 0, recoverySeconds: 120, releaseBehaviour: 'persist' },
  ], sort_order: 160, created_at: '', updated_at: '' },
  { id: 'beta-blocker', kind: 'event', name: 'Beta blocker', short_press_action: 'toggle', long_press_action: null, duration_seconds: 0, description: 'Simulate clinically significant beta blockade: suppresses positive chronotropic responses from lower-priority effects while leaving other targets intact.', setting: 'all', environments: ['edumon-ana', 'edumon-icu'], effects: [
    { id: 'beta-blocker-positive-chronotropy', target: 'haemodynamics.heartRate', operation: 'constraint', constraint: 'block-increase', value: 0, onsetSeconds: 10, durationSeconds: 0, recoverySeconds: 30 },
  ], priority: 70, sort_order: 170, created_at: '', updated_at: '' },

  { id: 'apnoea', kind: 'event', name: 'Apnoea', short_press_action: 'toggle', long_press_action: null, duration_seconds: 0, description: 'Toggle absent spontaneous respiratory drive.', setting: 'ana', environments: ['edumon-ana'], effects: [{ id: 'apnoea-respiratory-drive', target: 'respiration.drive', operation: 'set', value: 0, onsetSeconds: 2, durationSeconds: 0, recoverySeconds: 5 }], sort_order: 210, created_at: '', updated_at: '' },
  { id: 'diaphragm-return', kind: 'event', name: 'Return of diaphragm breathing', short_press_action: 'momentary', long_press_action: null, duration_seconds: 0, description: 'Return of spontaneous diaphragmatic effort after reversal; also guarantees at least one TOF response.', setting: 'ana', environments: ['edumon-ana'], effects: [
    { id: 'diaphragm-return-drive', target: 'respiration.drive', operation: 'target', value: 1, onsetSeconds: 10, durationSeconds: 900, recoverySeconds: 60 },
    { id: 'diaphragm-return-tof', target: 'neuromuscular.tofMinimumCount', operation: 'target', value: 1, onsetSeconds: 5, durationSeconds: 900, recoverySeconds: 60 },
  ], sort_order: 220, created_at: '', updated_at: '' },
  { id: 'bronchospasm', kind: 'event', name: 'Bronchospasm', short_press_action: 'toggle', long_press_action: 'severity-levels', duration_seconds: 0, description: 'Toggle bronchospasm. Long press selects low, medium or high severity.', setting: 'ana', environments: ['edumon-ana'], effects: [{ id: 'bronchospasm-airway-obstruction', target: 'respiration.airwayObstruction', operation: 'offset', value: 0.55, onsetSeconds: 10, durationSeconds: 0, recoverySeconds: 45 }], sort_order: 230, created_at: '', updated_at: '' },
]

function currentEnvironment(): EdusimActionEnvironment {
  return window.location.pathname.startsWith('/edumon/icu') ? 'edumon-icu' : 'edumon-ana'
}

function drugClass(definition: EdusimActionDefinition): DrugClass {
  return CARDIOVASCULAR_DRUG_IDS.has(definition.id) ? 'cardiovascular' : 'anaesthesia'
}

function eventClass(definition: EdusimActionDefinition): EventClass {
  if (CARDIOVASCULAR_EVENT_IDS.has(definition.id)) return 'cardiovascular'
  if (RESPIRATORY_EVENT_IDS.has(definition.id)) return 'respiratory'
  return 'anaesthesia'
}

function supportsLevel(definition: EdusimActionDefinition): boolean {
  return definition.long_press_action === 'dose-levels' || definition.long_press_action === 'severity-levels'
}

function levelFromIntensity(intensity: number): ActionLevel {
  return (Object.keys(LEVEL_STEPS) as ActionLevel[]).reduce((closest, candidate) =>
    Math.abs(LEVEL_STEPS[candidate].scale - intensity) < Math.abs(LEVEL_STEPS[closest].scale - intensity) ? candidate : closest,
  'medium')
}

function EdumonActionSection({ id, title, children }: { id: EdumonActionSectionId; title: string; children?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(true)
  return (
    <section className="edumon-action-section" aria-label={title} data-action-section={id}>
      <div className="edumon-action-section-heading">
        <h3>{title}</h3>
        <button type="button" className={`edumon-action-collapse ${collapsed ? 'collapsed' : 'expanded'}`} onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed} aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}>
          <span className="edumon-action-collapse-caret" aria-hidden="true" />
        </button>
      </div>
      {!collapsed && <div className="edumon-action-section-body">{children}</div>}
    </section>
  )
}

function EdumonActionButton({ definition, active, level, menuOpen, onSelect, onLongPress, onLevelSelect }: {
  definition: EdusimActionDefinition
  active: boolean
  level: ActionLevel
  menuOpen: boolean
  onSelect: (definition: EdusimActionDefinition) => void
  onLongPress: (definition: EdusimActionDefinition) => void
  onLevelSelect: (definition: EdusimActionDefinition, level: ActionLevel) => void
}) {
  const longPressTimer = useRef<number | null>(null)
  const suppressClick = useRef(false)
  const hasLevelMenu = supportsLevel(definition)
  const severity = definition.long_press_action === 'severity-levels'
  const clearLongPress = () => { if (longPressTimer.current != null) window.clearTimeout(longPressTimer.current); longPressTimer.current = null }
  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!hasLevelMenu || event.button !== 0) return
    suppressClick.current = false
    clearLongPress()
    longPressTimer.current = window.setTimeout(() => { suppressClick.current = true; onLongPress(definition) }, 550)
  }
  const click = () => {
    clearLongPress()
    if (suppressClick.current) { suppressClick.current = false; return }
    onSelect(definition)
  }
  const detail = [definition.description, hasLevelMenu ? `Long press: ${severity ? 'severity' : 'dose'} level` : ''].filter(Boolean).join(' · ')
  return (
    <div className="edumon-action-button-wrap">
      <button type="button" className={`edumon-action-button ${definition.short_press_action} ${active ? 'active' : ''}`.trim()} aria-pressed={definition.short_press_action === 'toggle' ? active : undefined} onPointerDown={pointerDown} onPointerUp={clearLongPress} onPointerCancel={clearLongPress} onPointerLeave={clearLongPress} onClick={click} title={detail || undefined}>
        <span>{definition.name}</span>
        {hasLevelMenu && <small className="edumon-action-dose-badge">{level === 'low' ? 'L' : level === 'high' ? 'H' : 'M'}</small>}
      </button>
      {menuOpen && (
        <div className="edumon-dose-menu" role="menu" aria-label={`${definition.name} ${severity ? 'severity' : 'dose'} level`}>
          {(Object.keys(LEVEL_STEPS) as ActionLevel[]).map((candidate) => {
            const step = LEVEL_STEPS[candidate]
            return <button key={candidate} type="button" className={level === candidate ? 'selected' : ''} onClick={() => onLevelSelect(definition, candidate)} role="menuitemradio" aria-checked={level === candidate}>
              <span className="edumon-dose-bars" aria-hidden="true">{[1, 2, 3].map((bar) => <i key={bar} className={bar <= step.bars ? 'on' : ''} />)}</span>
              <span>{step.label}</span>
            </button>
          })}
        </div>
      )}
    </div>
  )
}

export function EdumonActionsPanel() {
  const environment = currentEnvironment()
  const fallback = environment === 'edumon-ana' ? FALLBACK_ANA_ACTIONS : []
  const [definitions, setDefinitions] = useState<EdusimActionDefinition[]>(fallback)
  const [flashing, setFlashing] = useState<Set<string>>(new Set())
  const [levelMenuActionId, setLevelMenuActionId] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [, setRuntimeRevision] = useState(0)
  const timersRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    let active = true
    void listEdusimActions(environment).then((rows) => { if (active) setDefinitions(rows) }).catch(() => { if (active) setDefinitions(fallback) })
    return () => { active = false }
  }, [environment])

  useEffect(() => {
    let active = true
    void getInstructorAccount().then((user) => { if (active) setCanEdit(Boolean(user)) }).catch(() => { if (active) setCanEdit(false) })
    const unsubscribe = subscribeToInstructorAccount((user) => { if (active) setCanEdit(Boolean(user)) })
    return () => { active = false; unsubscribe() }
  }, [])

  useEffect(() => () => { for (const timer of timersRef.current.values()) window.clearTimeout(timer); timersRef.current.clear() }, [])

  const runningToggleEffects = (actionId: string) => getActiveEffects(getActionRuntimeSimulationTime())
    .filter((active) => active.actionId === actionId && active.mode === 'toggle' && active.stoppedAtSimulationTime == null)

  const isRunningToggle = (actionId: string) => runningToggleEffects(actionId).length > 0

  const currentLevel = (definition: EdusimActionDefinition): ActionLevel => {
    const running = runningToggleEffects(definition.id)[0]
    if (running) return levelFromIntensity(running.intensity)
    return ACTION_LEVEL_SELECTIONS.get(definition.id) ?? 'medium'
  }

  const trigger = (definition: EdusimActionDefinition) => {
    const intensity = LEVEL_STEPS[currentLevel(definition)].scale
    activateAction(definition, getActionRuntimeSimulationTime(), supportsLevel(definition) ? intensity : 1)
    setRuntimeRevision((value) => value + 1)
    setLevelMenuActionId(null)
    if (definition.short_press_action === 'toggle') return

    setFlashing((current) => new Set(current).add(definition.id))
    const existing = timersRef.current.get(definition.id)
    if (existing != null) window.clearTimeout(existing)
    const timer = window.setTimeout(() => { timersRef.current.delete(definition.id); setFlashing((current) => { const next = new Set(current); next.delete(definition.id); return next }) }, 1000)
    timersRef.current.set(definition.id, timer)
  }

  const selectLevel = (definition: EdusimActionDefinition, level: ActionLevel) => {
    ACTION_LEVEL_SELECTIONS.set(definition.id, level)
    if (isRunningToggle(definition.id)) setActionIntensity(definition.id, LEVEL_STEPS[level].scale)
    setRuntimeRevision((value) => value + 1)
    setLevelMenuActionId(null)
  }

  const isActive = (definition: EdusimActionDefinition) => definition.short_press_action === 'toggle' ? isRunningToggle(definition.id) : flashing.has(definition.id)
  const drugs = definitions.filter((definition) => definition.kind === 'drug')
  const events = definitions.filter((definition) => definition.kind === 'event')

  const renderGroup = (items: EdusimActionDefinition[], label: string) => items.length ? (
    <div className="edumon-action-grid" role="group" aria-label={label}>
      {items.map((definition) => <EdumonActionButton key={definition.id} definition={definition} active={isActive(definition)} level={currentLevel(definition)} menuOpen={levelMenuActionId === definition.id} onSelect={trigger} onLongPress={(action) => setLevelMenuActionId(action.id)} onLevelSelect={selectLevel} />)}
    </div>
  ) : <div className="edumon-action-empty">No actions are currently available for this group.</div>

  const renderClass = (title: string, items: EdusimActionDefinition[], noun: string) => (
    <section className="edumon-drug-class" aria-label={`${title} ${noun}`}><h4>{title}</h4>{renderGroup(items, `${title} ${noun}`)}</section>
  )

  return (
    <div className="edumon-actions-panel" aria-label="Clinical actions">
      {canEdit && <div className="edumon-action-library-tools"><button type="button" onClick={() => window.location.assign('/actions')}>Edit action library</button></div>}
      <EdumonActionSection id="drugs" title="Drugs">
        <div className="edumon-drug-classes">
          {renderClass('Anaesthesia', drugs.filter((definition) => drugClass(definition) === 'anaesthesia'), 'drugs')}
          {renderClass('Cardiovascular', drugs.filter((definition) => drugClass(definition) === 'cardiovascular'), 'drugs')}
        </div>
      </EdumonActionSection>
      <EdumonActionSection id="events" title="Events">
        <div className="edumon-drug-classes">
          {renderClass('Anaesthesia', events.filter((definition) => eventClass(definition) === 'anaesthesia'), 'events')}
          {renderClass('Cardiovascular', events.filter((definition) => eventClass(definition) === 'cardiovascular'), 'events')}
          {renderClass('Respiratory', events.filter((definition) => eventClass(definition) === 'respiratory'), 'events')}
        </div>
      </EdumonActionSection>
    </div>
  )
}
