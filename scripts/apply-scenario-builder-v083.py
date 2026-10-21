from pathlib import Path


def replace(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:160]!r}')
    p.write_text(text.replace(old, new))

# Shared authoring model: expose product-neutral stage transition metadata.
replace('src/teaching/scenario/authoringTypes.ts',
"export type SharedScenarioOperator = 'lt' | 'eq' | 'gt'\n",
"export type SharedScenarioOperator = 'lt' | 'eq' | 'gt'\n\nexport type SharedScenarioTransition =\n  | { mode: 'immediate' }\n  | { mode: 'linear'; durationSeconds: number }\n")
replace('src/teaching/scenario/authoringTypes.ts',
"  /** Product variable IDs explicitly applied when this state stage is entered. */\n  appliedVariableIds?: string[]\n  triggers: SharedScenarioAuthoringTrigger[]\n",
"  /** Product variable IDs explicitly applied when this state stage is entered. */\n  appliedVariableIds?: string[]\n  /** Default transition inherited by numeric values applied on stage entry. */\n  transition?: SharedScenarioTransition\n  /** Optional product-variable transition overrides, keyed by product variable ID. */\n  transitionOverrides?: Record<string, SharedScenarioTransition>\n  triggers: SharedScenarioAuthoringTrigger[]\n")
replace('src/teaching/scenario/authoringTypes.ts',
"  defaultAppliedVariableIds?: (snapshot: TSnapshot) => string[]\n  conditionMetrics: readonly SharedScenarioTriggerChoice[]\n",
"  defaultAppliedVariableIds?: (snapshot: TSnapshot) => string[]\n  /** Numeric variables eligible for gradual stage transitions. Omit for products without transition runtime support. */\n  transitionVariables?: (snapshot: TSnapshot) => readonly SharedScenarioTriggerChoice[]\n  conditionMetrics: readonly SharedScenarioTriggerChoice[]\n")

# Shared editor: add general + advanced transition controls for products that support them.
p = Path('src/scenario-builder/SharedScenarioEditorFramework.tsx')
t = p.read_text()
t = t.replace(
"  type SharedScenarioEditorAdapter,\n  type SharedScenarioQuestionContent,\n",
"  type SharedScenarioEditorAdapter,\n  type SharedScenarioQuestionContent,\n  type SharedScenarioTransition,\n")
insert_before = "export function SharedScenarioEditorFramework<TScenario, TSnapshot>({ adapter, enabled = true, onStartScenario }: SharedScenarioEditorFrameworkProps<TScenario, TSnapshot>) {"
component = r'''function StageTransitionEditor<TScenario, TSnapshot>({
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
            {override?.mode === 'linear' ? <div className="shared-scenario-duration-input"><input type="number" min={0.1} step={0.5} value={override.durationSeconds} onChange={(event) => setOverrideDuration(variable.id, Number(event.target.value))} /><em>s</em></div> : <span className="shared-scenario-transition-effective">{choice === 'inherit' ? (transition.mode === 'linear' ? `${transition.durationSeconds}s` : 'Immediate') : 'Immediate'}</span>}
          </div>
        })}
      </div>
    </details>}
  </section>
}

'''
if component.strip() not in t:
    if insert_before not in t:
        raise SystemExit('SharedScenarioEditorFramework insertion point missing')
    t = t.replace(insert_before, component + insert_before)

needle = "          {selectedStage.kind === 'state' && <div className=\"shared-scenario-snapshot-editor\">{adapter.renderSnapshotEditor("
transition_ui = "          {selectedStage.kind === 'state' && <StageTransitionEditor stage={selectedStage} stageIndex={document.stages.findIndex((stage) => stage.id === selectedStage.id)} adapter={adapter} onChange={updateStage} />}\n\n"
if transition_ui.strip() not in t:
    if needle not in t:
        raise SystemExit('state editor insertion point missing')
    t = t.replace(needle, transition_ui + needle)
p.write_text(t)

# EDUVENT adapter: round-trip stage transition metadata and expose eligible numeric parameters.
p = Path('src/scenario-builder/modules/ventilator/authoringAdapter.tsx')
t = p.read_text()
t = t.replace(
"  type SharedScenarioEditorAdapter,\n} from '../../../teaching/scenario/authoringTypes'",
"  type SharedScenarioEditorAdapter,\n  type SharedScenarioTransition,\n} from '../../../teaching/scenario/authoringTypes'")
helper_marker = "function applyMaskFromVariableIds(snapshot: InstructorScenarioSnapshot, ids: readonly string[]) {"
helpers = r'''function sharedTransitionOverrides(stage: { transitionOverrides?: { ventilator?: Record<string, import('../../../instructorAccount').DynamicScenarioTransition>; patient?: Record<string, import('../../../instructorAccount').DynamicScenarioTransition> } }) {
  const overrides: Record<string, SharedScenarioTransition> = {}
  Object.entries(stage.transitionOverrides?.ventilator ?? {}).forEach(([key, value]) => { overrides[`ventilator.${key}`] = value })
  Object.entries(stage.transitionOverrides?.patient ?? {}).forEach(([key, value]) => { overrides[`patient.${key}`] = value })
  return overrides
}

function dynamicTransitionOverrides(overrides: Record<string, SharedScenarioTransition> | undefined) {
  const ventilator: Record<string, SharedScenarioTransition> = {}
  const patient: Record<string, SharedScenarioTransition> = {}
  Object.entries(overrides ?? {}).forEach(([id, value]) => {
    if (id.startsWith('ventilator.')) ventilator[id.slice('ventilator.'.length)] = value
    if (id.startsWith('patient.')) patient[id.slice('patient.'.length)] = value
  })
  return { ventilator, patient }
}

'''
if helpers.strip() not in t:
    if helper_marker not in t:
        raise SystemExit('ventilator helper insertion point missing')
    t = t.replace(helper_marker, helpers + helper_marker)

t = t.replace(
"    defaultAppliedVariableIds: () => allWritableVariableIds(),\n    renderSnapshotEditor:",
"    defaultAppliedVariableIds: () => allWritableVariableIds(),\n    transitionVariables: (snapshot) => writable.filter((variable) => variable.type === 'number' && isVentilatorVariableRelevant(variable, snapshot)).map((variable) => ({ id: variable.id, label: variable.label })),\n    renderSnapshotEditor:")
t = t.replace(
"        appliedVariableIds: variableIdsFromApplyMask(stage),\n        triggers: [] as SharedScenarioAuthoringTrigger[],",
"        appliedVariableIds: variableIdsFromApplyMask(stage),\n        transition: stage.transition ?? { mode: 'immediate' as const },\n        transitionOverrides: sharedTransitionOverrides(stage),\n        triggers: [] as SharedScenarioAuthoringTrigger[],")
t = t.replace(
"          transition: { mode: 'immediate' },\n          transitionOverrides: {},",
"          transition: stage.transition ?? { mode: 'immediate' },\n          transitionOverrides: dynamicTransitionOverrides(stage.transitionOverrides),")
p.write_text(t)

# EDUMON shared adapter (ANA + ICU): replace numeric boxes with the current slider presentation.
p = Path('src/scenario-builder/modules/edumon/authoringAdapter.tsx')
t = p.read_text()
start = t.index('function SnapshotEditor(')
end = t.index('\nfunction toSharedTrigger', start)
replacement = r'''function EdumonSlider({ label, value, min, max, step = 1, displayValue, onChange }: { label: string; value: number; min: number; max: number; step?: number; displayValue?: string; onChange: (value: number) => void }) {
  return <div className="shared-scenario-variable-row slider">
    <div className="shared-scenario-variable-heading"><span>{label}</span><strong>{displayValue ?? value}</strong></div>
    <input className="shared-scenario-control-slider" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </div>
}

function EdumonSelect({ label, value, children, onChange }: { label: string; value: string | number; children: ReactNode; onChange: (value: string) => void }) {
  return <div className="shared-scenario-variable-row"><div className="shared-scenario-variable-heading"><span>{label}</span></div><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></div>
}

function SnapshotEditor({ snapshot, onChange }: { snapshot: EdumonScenarioSnapshot; onChange: (snapshot: EdumonScenarioSnapshot) => void }) {
  const patient = snapshot.patient
  const setPatient = (patch: Partial<typeof patient>) => onChange({ ...snapshot, patient: { ...patient, ...patch } })
  return <div className="shared-scenario-eduvent-snapshot shared-scenario-edumon-snapshot">
    <section className="shared-scenario-control-group monitor">
      <h3>Monitor patient state</h3>
      <div className="shared-scenario-slider-grid">
        <EdumonSelect label="Rhythm" value={patient.rhythm} onChange={(value) => setPatient({ rhythm: value as CardiacRhythm })}>{RHYTHMS.map((rhythm) => <option key={rhythm} value={rhythm}>{RHYTHM_LABELS[rhythm]}</option>)}</EdumonSelect>
        <EdumonSlider label="Heart rate" value={patient.heartRate} min={0} max={250} displayValue={`${patient.heartRate} /min`} onChange={(heartRate) => setPatient({ heartRate })} />
        <EdumonSlider label="Systolic pressure" value={patient.systolicPressure} min={0} max={260} displayValue={`${patient.systolicPressure} mmHg`} onChange={(systolicPressure) => setPatient({ systolicPressure })} />
        <EdumonSlider label="Diastolic pressure" value={patient.diastolicPressure} min={0} max={180} displayValue={`${patient.diastolicPressure} mmHg`} onChange={(diastolicPressure) => setPatient({ diastolicPressure })} />
        <EdumonSlider label="SpO₂" value={patient.spo2} min={0} max={100} displayValue={`${patient.spo2}%`} onChange={(spo2) => setPatient({ spo2 })} />
        <EdumonSlider label="Peripheral perfusion" value={patient.peripheralPerfusion} min={0} max={2} step={0.05} displayValue={patient.peripheralPerfusion.toFixed(2)} onChange={(peripheralPerfusion) => setPatient({ peripheralPerfusion })} />
        <EdumonSelect label="Simulation" value={snapshot.simulationPaused ? 'paused' : 'running'} onChange={(value) => onChange({ ...snapshot, simulationPaused: value === 'paused' })}><option value="running">Running</option><option value="paused">Paused</option></EdumonSelect>
        <EdumonSelect label="Speed" value={snapshot.simulationSpeed} onChange={(value) => onChange({ ...snapshot, simulationSpeed: Number(value) as EdumonScenarioSnapshot['simulationSpeed'] })}><option value={0.5}>×0.5</option><option value={1}>×1</option><option value={1.5}>×1.5</option><option value={2}>×2</option><option value={4}>×4</option></EdumonSelect>
      </div>
    </section>
  </div>
}'''
t = t[:start] + replacement + t[end:]
p.write_text(t)

# CSS for transition editor and EDUMON slider cards.
p = Path('src/scenario-builder/scenarioBuilder.css')
css = p.read_text()
css += r'''

/* Scenario Builder v0.8.3 stage transitions */
.shared-scenario-transition-card{margin:0 0 12px;padding:12px;border:1px solid rgba(97,190,221,.22);border-radius:10px;background:rgba(97,190,221,.055)}
.shared-scenario-transition-card.initial{display:flex;align-items:center;min-height:58px}
.shared-scenario-transition-card.initial>div{display:grid;gap:2px}
.shared-scenario-transition-card span,.shared-scenario-transition-card small{font-size:11px;color:var(--muted,#9fb0b7)}
.shared-scenario-transition-heading{display:flex;align-items:end;gap:10px;flex-wrap:wrap}
.shared-scenario-transition-heading>div:first-child{display:grid;gap:2px;flex:1 1 320px}
.shared-scenario-transition-heading label{display:grid;gap:4px;min-width:140px}
.shared-scenario-transition-heading label.compact{min-width:105px}
.shared-scenario-duration-input{display:flex;align-items:center;gap:5px}
.shared-scenario-duration-input input{width:78px!important}
.shared-scenario-duration-input em{font-size:11px;font-style:normal;color:var(--muted,#9fb0b7)}
.shared-scenario-transition-advanced{margin-top:10px;border-top:1px solid rgba(255,255,255,.08);padding-top:8px}
.shared-scenario-transition-advanced summary{cursor:pointer;font-size:12px;font-weight:600}
.shared-scenario-transition-advanced summary small{font-weight:400;margin-left:6px}
.shared-scenario-transition-overrides{display:grid;gap:6px;margin-top:8px}
.shared-scenario-transition-override-row{display:grid;grid-template-columns:minmax(150px,1fr) 150px 100px;align-items:center;gap:8px;padding:6px 8px;border:1px solid rgba(255,255,255,.07);border-radius:7px;background:rgba(0,0,0,.10)}
.shared-scenario-transition-effective{font-size:11px;color:var(--muted,#9fb0b7)}

/* EDUMON-Ana / EDUMON-ICU current slider presentation */
.shared-scenario-edumon-snapshot .shared-scenario-control-group.monitor{--scenario-control-accent:rgb(97,190,221);border-color:rgba(97,190,221,.24);background:rgba(97,190,221,.055)}
.shared-scenario-edumon-snapshot .shared-scenario-variable-heading{grid-template-columns:minmax(0,1fr) auto}
.shared-scenario-edumon-snapshot .shared-scenario-control-slider{accent-color:var(--scenario-control-accent);appearance:auto;-webkit-appearance:auto;display:block;width:100%;height:5px;margin:2px 0;padding:0;border:0;background:transparent;cursor:pointer;box-sizing:border-box}
.shared-scenario-edumon-snapshot .shared-scenario-variable-row>select{width:100%}
@media(max-width:720px){.shared-scenario-transition-override-row{grid-template-columns:1fr}.shared-scenario-transition-heading{align-items:stretch}}
'''
p.write_text(css)

replace('src/scenario-builder/version.ts', "export const SCENARIO_BUILDER_VERSION = '0.8.2'", "export const SCENARIO_BUILDER_VERSION = '0.8.3'")
