from pathlib import Path


def replace(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:140]!r}')
    p.write_text(text.replace(old, new))

# --- Shared authoring model: retain per-stage product variable apply selections. ---
replace('src/teaching/scenario/authoringTypes.ts', '''  snapshot: TSnapshot\n  triggers: SharedScenarioAuthoringTrigger[]\n  media?: SharedScenarioMediaContent''', '''  snapshot: TSnapshot\n  /** Product variable IDs explicitly applied when this state stage is entered. */\n  appliedVariableIds?: string[]\n  triggers: SharedScenarioAuthoringTrigger[]\n  media?: SharedScenarioMediaContent''')
replace('src/teaching/scenario/authoringTypes.ts', '''  renderSnapshotEditor: (snapshot: TSnapshot, onChange: (snapshot: TSnapshot) => void) => ReactNode\n  conditionMetrics:''', '''  renderSnapshotEditor: (\n    snapshot: TSnapshot,\n    onChange: (snapshot: TSnapshot) => void,\n    options?: { appliedVariableIds?: string[]; onAppliedVariableIdsChange?: (ids: string[]) => void },\n  ) => ReactNode\n  defaultAppliedVariableIds?: (snapshot: TSnapshot) => string[]\n  conditionMetrics:''')

# --- Shared editor: initialize Stage 1 applies, new stages apply nothing, use trash icons. ---
p = Path('src/scenario-builder/SharedScenarioEditorFramework.tsx')
t = p.read_text()
insert_after = '''function clone<T>(value: T): T {\n  return JSON.parse(JSON.stringify(value)) as T\n}\n'''
trash = '''\nfunction TrashIcon() {\n  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>\n}\n'''
if trash.strip() not in t:
    if insert_after not in t:
        raise SystemExit('clone insertion point missing')
    t = t.replace(insert_after, insert_after + trash)

t = t.replace('''    {onDelete && <button type="button" className="scenario-builder-danger" onClick={onDelete}>Remove</button>}''', '''    {onDelete && <button type="button" className="scenario-builder-danger shared-scenario-trash-button" onClick={onDelete} aria-label="Remove condition" title="Remove condition"><TrashIcon /></button>}''')

old_init = '''  const [document, setDocument] = useState<SharedScenarioAuthoringDocument<TSnapshot>>(() => ({\n    schemaVersion: 1,\n    product: adapter.product,\n    name: 'New scenario',\n    description: '',\n    stages: [createAuthoringStage('Stage 1', adapter.emptySnapshot())],\n    branches: [],\n  }))'''
new_init = '''  const [document, setDocument] = useState<SharedScenarioAuthoringDocument<TSnapshot>>(() => {\n    const snapshot = adapter.emptySnapshot()\n    const stage = createAuthoringStage('Stage 1', snapshot)\n    stage.appliedVariableIds = adapter.defaultAppliedVariableIds?.(snapshot)\n    return {\n      schemaVersion: 1,\n      product: adapter.product,\n      name: 'New scenario',\n      description: '',\n      stages: [stage],\n      branches: [],\n    }\n  })'''
if old_init not in t:
    raise SystemExit('document init pattern missing')
t = t.replace(old_init, new_init)

old_new = '''  const newScenario = () => {\n    const stage = createAuthoringStage('Stage 1', adapter.emptySnapshot())\n    setSelectedId('')'''
new_new = '''  const newScenario = () => {\n    const snapshot = adapter.emptySnapshot()\n    const stage = createAuthoringStage('Stage 1', snapshot)\n    stage.appliedVariableIds = adapter.defaultAppliedVariableIds?.(snapshot)\n    setSelectedId('')'''
if old_new not in t:
    raise SystemExit('newScenario pattern missing')
t = t.replace(old_new, new_new)

old_add = '''    const stage = createAuthoringStage(`Stage ${document.stages.length + 1}`, clone(source))\n    const trigger = defaultAuthoringTrigger()'''
new_add = '''    const stage = createAuthoringStage(`Stage ${document.stages.length + 1}`, clone(source))\n    // New state stages inherit the visible values for authoring convenience but change nothing until explicitly enabled.\n    stage.appliedVariableIds = []\n    const trigger = defaultAuthoringTrigger()'''
if old_add not in t:
    raise SystemExit('addStage pattern missing')
t = t.replace(old_add, new_add)

old_render = '''          {selectedStage.kind === 'state' && <div className="shared-scenario-snapshot-editor">{adapter.renderSnapshotEditor(selectedStage.snapshot, (snapshot) => updateStage({ snapshot }))}</div>}'''
new_render = '''          {selectedStage.kind === 'state' && <div className="shared-scenario-snapshot-editor">{adapter.renderSnapshotEditor(\n            selectedStage.snapshot,\n            (snapshot) => updateStage({ snapshot }),\n            {\n              appliedVariableIds: selectedStage.appliedVariableIds,\n              onAppliedVariableIdsChange: (appliedVariableIds) => updateStage({ appliedVariableIds }),\n            },\n          )}</div>}'''
if old_render not in t:
    raise SystemExit('snapshot render pattern missing')
t = t.replace(old_render, new_render)

t = t.replace('''<button type="button" className="scenario-builder-danger" onClick={() => deleteBranch(branch.id)}>Remove path</button>''', '''<button type="button" className="scenario-builder-danger shared-scenario-trash-button" onClick={() => deleteBranch(branch.id)} aria-label="Remove path" title="Remove path"><TrashIcon /></button>''')

p.write_text(t)

# --- EDUVENT adapter: mode-aware controls, uniform native sliders, and true apply masks. ---
p = Path('src/scenario-builder/modules/ventilator/authoringAdapter.tsx')
t = p.read_text()
start = t.index('function VariableInput(')
end = t.index('\nfunction triggerToShared', start)
replacement = r'''function VariableInput({ variable, value, onChange, disabled = false }: { variable: ScenarioVariableDefinition; value: unknown; onChange: (value: unknown) => void; disabled?: boolean }) {
  if (variable.type === 'boolean') return <select disabled={disabled} value={value ? 'true' : 'false'} onChange={(event) => onChange(event.target.value === 'true')}><option value="true">On</option><option value="false">Off</option></select>
  if (variable.type === 'select') return <select disabled={disabled} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>{variable.options?.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select>
  if (variable.type === 'number') {
    const isFio2 = variable.id === 'ventilator.fio2'
    const numericValue = typeof value === 'number' ? value : 0
    return <input
      className="shared-scenario-control-slider"
      type="range"
      min={isFio2 ? 21 : variable.min}
      max={isFio2 ? 100 : variable.max}
      step={isFio2 ? 1 : (variable.step ?? 1)}
      value={isFio2 ? Math.round(numericValue * 100) : numericValue}
      disabled={disabled}
      onChange={(event) => onChange(isFio2 ? Number(event.target.value) / 100 : Number(event.target.value))}
    />
  }
  return <input disabled={disabled} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />
}

function variablePalette(variable: ScenarioVariableDefinition) {
  if (variable.id.startsWith('ventilator.')) return 'vent'
  if (variable.group.toLowerCase().includes('phys')) return 'physio'
  return 'patient'
}

function displayVariableValue(variable: ScenarioVariableDefinition, value: unknown) {
  if (variable.type === 'boolean') return value ? 'On' : 'Off'
  if (variable.type === 'select') return variable.options?.find((option) => String(option.value) === String(value))?.label ?? String(value ?? '')
  if (variable.id === 'ventilator.fio2' && typeof value === 'number') return `${Math.round(value * 100)}%`
  return `${typeof value === 'number' ? Number(value.toFixed(3)) : value ?? ''}${variable.unit ? ` ${variable.unit}` : ''}`
}

function allWritableVariableIds() {
  return VENTILATOR_SCENARIO_MODULE.variables
    .filter((variable) => variable.role === 'setting' && variable.writable)
    .map((variable) => variable.id)
}

function isVentilatorVariableRelevant(variable: ScenarioVariableDefinition, snapshot: InstructorScenarioSnapshot) {
  if (!variable.id.startsWith('ventilator.')) return true
  const key = variable.id.slice('ventilator.'.length)
  const mode = snapshot.ventilator.mode
  const isSimv = mode === 'SIMV-VC' || mode === 'SIMV-PC'
  const isVolumeMandatory = mode === 'VC-AC' || mode === 'SIMV-VC'
  const isPressureMandatory = mode === 'PC-AC' || mode === 'SIMV-PC'

  if (key === 'mode' || key === 'fio2') return true
  if (mode === 'APRV') return ['pHigh', 'pLow', 'tHigh', 'tLow'].includes(key)
  if (mode === 'BIPAP') return ['pressureControl', 'peep', 'rate', 'inspiratoryTime', 'triggerType', snapshot.ventilator.triggerType === 'flow' ? 'flowTriggerSensitivity' : 'triggerSensitivity'].includes(key)

  if (['pHigh', 'pLow', 'tHigh', 'tLow'].includes(key)) return false
  if (key === 'peep') return true
  if (key === 'rate') return mode !== 'PSV'
  if (key === 'tidalVolume') return isVolumeMandatory || mode === 'VG-PC'
  if (key === 'inspiratoryTime') return mode !== 'PSV'
  if (key === 'inspiratoryFlow' || key === 'plateauPercent') return isVolumeMandatory
  if (key === 'pressureControl') return isPressureMandatory
  if (key === 'volumeGuaranteePressureLimit') return mode === 'VG-PC'
  if (key === 'pressureSupport' || key === 'terminationSensitivity') return mode === 'PSV' || isSimv
  if (key === 'simvSyncWindowPercent' || key === 'showSimvSyncWindow') return isSimv
  if (key === 'triggerType') return true
  if (key === 'triggerSensitivity') return snapshot.ventilator.triggerType !== 'flow'
  if (key === 'flowTriggerSensitivity') return snapshot.ventilator.triggerType === 'flow'
  return true
}

function variableIdsFromApplyMask(stage: { apply?: { ventilator: Array<string | number | symbol>; patient: Array<string | number | symbol> } }) {
  if (!stage.apply) return allWritableVariableIds()
  return [
    ...stage.apply.ventilator.map((key) => `ventilator.${String(key)}`),
    ...stage.apply.patient.map((key) => `patient.${String(key)}`),
  ]
}

function applyMaskFromVariableIds(snapshot: InstructorScenarioSnapshot, ids: readonly string[]) {
  const full = createFullDynamicStageApplyMask(snapshot)
  const selected = new Set(ids)
  return {
    ...full,
    ventilator: full.ventilator.filter((key) => selected.has(`ventilator.${String(key)}`)),
    patient: full.patient.filter((key) => selected.has(`patient.${String(key)}`)),
    alarmLimits: [],
    patientTransitionSeconds: false,
    waveformDisplay: false,
    mediaIds: false,
  }
}

function SnapshotEditor({ snapshot, onChange, appliedVariableIds, onAppliedVariableIdsChange }: {
  snapshot: InstructorScenarioSnapshot
  onChange: (snapshot: InstructorScenarioSnapshot) => void
  appliedVariableIds?: string[]
  onAppliedVariableIdsChange?: (ids: string[]) => void
}) {
  const writable = VENTILATOR_SCENARIO_MODULE.variables.filter((variable) => variable.role === 'setting' && variable.writable)
  const groups = [...new Set(writable.map((variable) => variable.group))]
  const selected = new Set(appliedVariableIds ?? allWritableVariableIds())
  const setApplied = (id: string, enabled: boolean) => {
    const next = new Set(selected)
    if (enabled) next.add(id)
    else next.delete(id)
    onAppliedVariableIdsChange?.([...next])
  }
  return <div className="shared-scenario-eduvent-snapshot">
    {groups.map((group) => {
      const variables = writable.filter((variable) => variable.group === group && isVentilatorVariableRelevant(variable, snapshot))
      if (!variables.length) return null
      const palette = variablePalette(variables[0])
      return <section key={group} className={`shared-scenario-control-group ${palette}`}><h3>{group}</h3><div className="shared-scenario-slider-grid">{variables.map((variable) => {
        const value = getPath(snapshot, variable.id)
        const applied = selected.has(variable.id)
        return <div className={`shared-scenario-variable-row ${variable.type === 'number' ? 'slider' : ''} ${applied ? 'applied' : 'not-applied'}`} key={variable.id}>
          <div className="shared-scenario-variable-heading">
            <label className="shared-scenario-apply-toggle" title={applied ? 'This value will be applied on stage entry' : 'This value will be left unchanged on stage entry'}>
              <input type="checkbox" checked={applied} onChange={(event) => setApplied(variable.id, event.target.checked)} />
              <span>Apply</span>
            </label>
            <span className="shared-scenario-variable-label">{variable.label}</span>
            <strong>{displayVariableValue(variable, value)}</strong>
          </div>
          <VariableInput variable={variable} value={value} disabled={!applied} onChange={(next) => onChange(setPath(snapshot, variable.id, next))} />
        </div>
      })}</div></section>
    })}
  </div>
}'''
t = t[:start] + replacement + t[end:]

t = t.replace("    renderSnapshotEditor: (snapshot, onChange): ReactNode => <SnapshotEditor snapshot={snapshot} onChange={onChange} />,", "    defaultAppliedVariableIds: () => allWritableVariableIds(),\n    renderSnapshotEditor: (snapshot, onChange, options): ReactNode => <SnapshotEditor snapshot={snapshot} onChange={onChange} appliedVariableIds={options?.appliedVariableIds} onAppliedVariableIdsChange={options?.onAppliedVariableIdsChange} />,")

t = t.replace("        snapshot: stage.snapshot,\n        triggers: [] as SharedScenarioAuthoringTrigger[],", "        snapshot: stage.snapshot,\n        appliedVariableIds: variableIdsFromApplyMask(stage),\n        triggers: [] as SharedScenarioAuthoringTrigger[],")

t = t.replace("          apply: createFullDynamicStageApplyMask(stage.snapshot),", "          apply: applyMaskFromVariableIds(stage.snapshot, stage.appliedVariableIds ?? allWritableVariableIds()),")

p.write_text(t)

# --- CSS: force every builder range to one native 5px style; colour by semantic group; style Apply and trash controls. ---
p = Path('src/scenario-builder/scenarioBuilder.css')
css = p.read_text()
css += r'''

/* Scenario Builder v0.8.2 control consistency */
.shared-scenario-variable-row{display:block;min-width:0;padding:8px 10px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.10)}
.shared-scenario-variable-row.not-applied{opacity:.56}
.shared-scenario-variable-heading{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;margin-bottom:5px}
.shared-scenario-variable-heading>strong{font-size:12px;font-weight:600;white-space:nowrap}
.shared-scenario-variable-label{font-size:11px;min-width:0}
.shared-scenario-apply-toggle{display:inline-flex!important;align-items:center;gap:4px;cursor:pointer;user-select:none}
.shared-scenario-apply-toggle input{width:auto!important;margin:0;accent-color:currentColor}
.shared-scenario-apply-toggle span{font-size:9px!important;letter-spacing:.06em;text-transform:uppercase;color:inherit!important}
.shared-scenario-control-group.vent{--scenario-control-accent:rgb(97,190,221)}
.shared-scenario-control-group.patient{--scenario-control-accent:rgb(112,197,132)}
.shared-scenario-control-group.physio{--scenario-control-accent:rgb(166,109,221)}
.shared-scenario-control-group{border-left:3px solid var(--scenario-control-accent);padding-left:12px}
.shared-scenario-control-group h3,.shared-scenario-control-group .shared-scenario-apply-toggle,.shared-scenario-control-group .shared-scenario-variable-heading>strong{color:var(--scenario-control-accent)}
.shared-scenario-authoring input.shared-scenario-control-slider[type="range"]{
  appearance:auto!important;
  -webkit-appearance:auto!important;
  display:block!important;
  box-sizing:border-box!important;
  width:100%!important;
  height:5px!important;
  min-height:5px!important;
  margin:2px!important;
  padding:0!important;
  border:0!important;
  background:transparent!important;
  box-shadow:none!important;
  cursor:pointer!important;
  accent-color:var(--scenario-control-accent)!important;
}
.shared-scenario-authoring input.shared-scenario-control-slider[type="range"]:disabled{cursor:not-allowed!important}
.shared-scenario-trash-button{display:inline-flex!important;align-items:center;justify-content:center;width:34px!important;min-width:34px!important;height:34px!important;padding:6px!important;color:#ffc4c9!important;border-color:#78434a!important;background:#26151a!important}
.shared-scenario-trash-button svg{width:18px;height:18px;display:block}
'''
p.write_text(css)

Path('src/scenario-builder/version.ts').write_text("export const SCENARIO_BUILDER_VERSION = '0.8.2'\n")
