from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing replacement in {path}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1))

# instructorAccount: stage masks, source metadata, merge/apply helper.
p = Path('src/instructorAccount.ts')
text = p.read_text()
text = text.replace("export interface DynamicScenarioStage {\n  name: string\n  snapshot: InstructorScenarioSnapshot\n}\n", """export interface DynamicScenarioApplyMask {
  ventilator: Array<keyof VentilatorSettings>
  patient: Array<keyof PatientSettings>
  alarmLimits: Array<keyof AlarmLimits>
  patientTransitionSeconds: boolean
  waveformDisplay: boolean
  mediaIds: boolean
}

export interface DynamicScenarioStage {
  name: string
  snapshot: InstructorScenarioSnapshot
  /** Missing on v0.82.0 stages; absence means apply the complete snapshot. */
  apply?: DynamicScenarioApplyMask
  sourceName?: string
}
""")
text = text.replace("export function asDynamicScenario(\n  current: InstructorScenarioSnapshot,\n  description = current.description ?? '',\n): InstructorScenarioSnapshot {\n  const firstStageSnapshot = asStaticScenario(current, '')\n  return {\n    ...firstStageSnapshot,\n    schemaVersion: 3,\n    kind: 'dynamic',\n    description: description.trim(),\n    stages: [{ name: 'Stage 1', snapshot: firstStageSnapshot }],\n  }\n}\n", """export function createFullDynamicStageApplyMask(snapshot: InstructorScenarioSnapshot): DynamicScenarioApplyMask {
  return {
    ventilator: Object.keys(snapshot.ventilator) as Array<keyof VentilatorSettings>,
    patient: Object.keys(snapshot.patient) as Array<keyof PatientSettings>,
    alarmLimits: Object.keys(snapshot.alarmLimits) as Array<keyof AlarmLimits>,
    patientTransitionSeconds: true,
    waveformDisplay: true,
    mediaIds: true,
  }
}

function mergeSelected<T extends object>(current: T, source: T, keys: Array<keyof T> | undefined): T {
  if (keys === undefined) return { ...source }
  const next = { ...current } as Record<string, unknown>
  const sourceRecord = source as Record<string, unknown>
  for (const key of keys) next[String(key)] = sourceRecord[String(key)]
  return next as T
}

export function applyDynamicStage(current: InstructorScenarioSnapshot, stage: DynamicScenarioStage): InstructorScenarioSnapshot {
  const mask = stage.apply
  return {
    ...current,
    schemaVersion: 2,
    kind: 'static',
    description: '',
    stages: undefined,
    ventilator: mergeSelected(current.ventilator, stage.snapshot.ventilator, mask ? mask.ventilator : undefined),
    patient: mergeSelected(current.patient, stage.snapshot.patient, mask ? mask.patient : undefined),
    alarmLimits: mergeSelected(current.alarmLimits, stage.snapshot.alarmLimits, mask ? mask.alarmLimits : undefined),
    patientTransitionSeconds: mask ? (mask.patientTransitionSeconds ? stage.snapshot.patientTransitionSeconds : current.patientTransitionSeconds) : stage.snapshot.patientTransitionSeconds,
    waveformDisplay: mask ? (mask.waveformDisplay ? { ...stage.snapshot.waveformDisplay } : { ...current.waveformDisplay }) : { ...stage.snapshot.waveformDisplay },
    mediaIds: mask ? (mask.mediaIds ? [...(stage.snapshot.mediaIds ?? [])] : [...(current.mediaIds ?? [])]) : [...(stage.snapshot.mediaIds ?? [])],
  }
}

export function asDynamicScenario(
  current: InstructorScenarioSnapshot,
  description = current.description ?? '',
  apply = createFullDynamicStageApplyMask(current),
  sourceName = 'Current simulator state',
): InstructorScenarioSnapshot {
  const firstStageSnapshot = asStaticScenario(current, '')
  return {
    ...firstStageSnapshot,
    schemaVersion: 3,
    kind: 'dynamic',
    description: description.trim(),
    stages: [{ name: 'Stage 1', snapshot: firstStageSnapshot, apply, sourceName }],
  }
}
""")
text = text.replace("    stages: scenario.kind === 'dynamic' ? (scenario.stages ?? []).map((stage, index) => ({ name: stage.name || `Stage ${index + 1}`, snapshot: { ...stage.snapshot, kind: 'static', stages: undefined } })) : undefined,\n", """    stages: scenario.kind === 'dynamic' ? (scenario.stages ?? []).map((stage, index) => ({
      name: stage.name || `Stage ${index + 1}`,
      snapshot: { ...stage.snapshot, kind: 'static', stages: undefined },
      apply: stage.apply,
      sourceName: stage.sourceName,
    })) : undefined,
""")
p.write_text(text)

# Component imports and reusable parameter/source controls.
p = Path('src/components/InstructorAccountControls.tsx')
text = p.read_text()
text = text.replace("import type { SessionRole } from '../session/useTeachingSession'\n", "import type { SessionRole } from '../session/useTeachingSession'\nimport type { AlarmLimits } from '../alarmTypes'\nimport type { PatientSettings, VentilatorSettings } from '../simulation/types'\n")
text = text.replace("  asDynamicScenario,\n  asStaticScenario,\n", "  applyDynamicStage,\n  asDynamicScenario,\n  asStaticScenario,\n  createFullDynamicStageApplyMask,\n")
text = text.replace("  type InstructorPresetRow,\n", "  type DynamicScenarioApplyMask,\n  type InstructorPresetRow,\n")
marker = "function nextCopyName(baseName: string, presets: InstructorPresetRow[]) {\n"
insert = """const VENTILATOR_STAGE_FIELDS: Array<{ key: keyof VentilatorSettings; label: string }> = [
  { key: 'mode', label: 'Mode' }, { key: 'fio2', label: 'FiO₂' }, { key: 'peep', label: 'PEEP' },
  { key: 'rate', label: 'Set RR' }, { key: 'tidalVolume', label: 'Tidal volume' }, { key: 'inspiratoryTime', label: 'Tinsp' },
  { key: 'inspiratoryFlow', label: 'Inspiratory flow' }, { key: 'plateauPercent', label: 'Plateau %' },
  { key: 'pressureControl', label: 'Pressure control' }, { key: 'volumeGuaranteePressureLimit', label: 'VG pressure limit' },
  { key: 'pressureSupport', label: 'Pressure support' }, { key: 'triggerType', label: 'Trigger type' },
  { key: 'triggerSensitivity', label: 'Pressure trigger' }, { key: 'flowTriggerSensitivity', label: 'Flow trigger' },
  { key: 'terminationSensitivity', label: 'Termination sensitivity' }, { key: 'simvSyncWindowPercent', label: 'SIMV sync window' },
  { key: 'showSimvSyncWindow', label: 'Show SIMV sync window' }, { key: 'pHigh', label: 'P high' }, { key: 'pLow', label: 'P low' },
  { key: 'tHigh', label: 'T high' }, { key: 'tLow', label: 'T low' },
]

const PATIENT_STAGE_FIELDS: Array<{ key: keyof PatientSettings; label: string }> = [
  { key: 'sex', label: 'Sex' }, { key: 'heightCm', label: 'Height' }, { key: 'compliance', label: 'Compliance' },
  { key: 'resistance', label: 'Inspiratory resistance' }, { key: 'expiratoryResistance', label: 'Expiratory resistance' },
  { key: 'expiratoryFlowLimitation', label: 'Expiratory flow limitation' }, { key: 'spontaneousRate', label: 'Patient respiratory rate' },
  { key: 'effort', label: 'Effort' }, { key: 'neuralInspiratoryTime', label: 'Neural Tinsp' },
  { key: 'effortRisePercent', label: 'Effort rise' }, { key: 'effortRelaxationPercent', label: 'Effort relaxation' },
  { key: 'endExpiratoryOesophagealPressure', label: 'End-expiratory Pes' }, { key: 'oxygenConsumption', label: 'O₂ consumption' },
  { key: 'frc', label: 'FRC' }, { key: 'shuntFraction', label: 'Shunt' }, { key: 'maxSpO2', label: 'Maximum SpO₂' },
  { key: 'co2Production', label: 'CO₂ production' }, { key: 'vdVt', label: 'Vd/Vt' },
]

const ALARM_STAGE_FIELDS: Array<{ key: keyof AlarmLimits; label: string }> = [
  { key: 'pressureLimit', label: 'Pressure limitation' }, { key: 'peakPressure', label: 'Peak pressure alarm' },
  { key: 'apneaTime', label: 'Apnoea time' }, { key: 'co2Min', label: 'CO₂ minimum' }, { key: 'co2Max', label: 'CO₂ maximum' },
  { key: 'minuteVentilationMin', label: 'Min ventilation minimum' }, { key: 'minuteVentilationMax', label: 'Min ventilation maximum' },
  { key: 'tidalVolumeMin', label: 'VT minimum' }, { key: 'tidalVolumeMax', label: 'VT maximum' },
  { key: 'respiratoryRateMin', label: 'RR minimum' }, { key: 'respiratoryRateMax', label: 'RR maximum' },
]

function DynamicStageSourceSelect({ value, staticPresets, onChange }: { value: string; staticPresets: InstructorPresetRow[]; onChange: (value: string) => void }) {
  return <label className="dynamic-stage-source"><span>Stage source</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="current">Current simulator state</option>{staticPresets.length > 0 && <optgroup label="Static presets">{staticPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</optgroup>}</select></label>
}

function DynamicStageApplyEditor({ mask, onChange }: { mask: DynamicScenarioApplyMask; onChange: (mask: DynamicScenarioApplyMask) => void }) {
  const toggle = (group: 'ventilator' | 'patient' | 'alarmLimits', key: string, checked: boolean) => {
    const selected = new Set((mask[group] ?? []).map(String))
    if (checked) selected.add(key); else selected.delete(key)
    onChange({ ...mask, [group]: [...selected] } as DynamicScenarioApplyMask)
  }
  const setAll = (selected: boolean) => onChange(selected ? {
    ventilator: VENTILATOR_STAGE_FIELDS.map((item) => item.key), patient: PATIENT_STAGE_FIELDS.map((item) => item.key), alarmLimits: ALARM_STAGE_FIELDS.map((item) => item.key), patientTransitionSeconds: true, waveformDisplay: true, mediaIds: true,
  } : { ventilator: [], patient: [], alarmLimits: [], patientTransitionSeconds: false, waveformDisplay: false, mediaIds: false })
  const group = <K extends 'ventilator' | 'patient' | 'alarmLimits'>(title: string, name: K, options: Array<{ key: string; label: string }>) => <details className="dynamic-mask-group"><summary>{title}<small>{mask[name].length}/{options.length}</small></summary><div className="dynamic-mask-grid">{options.map((item) => <label key={item.key}><input type="checkbox" checked={(mask[name] as string[]).includes(item.key)} onChange={(event) => toggle(name, item.key, event.target.checked)} /><span>{item.label}</span></label>)}</div></details>
  return <div className="dynamic-stage-mask"><div className="dynamic-mask-heading"><strong>Parameters pushed at this stage</strong><div><button type="button" onClick={() => setAll(true)}>Select all</button><button type="button" onClick={() => setAll(false)}>Clear all</button></div></div>{group('Ventilator', 'ventilator', VENTILATOR_STAGE_FIELDS as Array<{ key: string; label: string }>)}{group('Patient / physiology', 'patient', PATIENT_STAGE_FIELDS as Array<{ key: string; label: string }>)}{group('Alarms', 'alarmLimits', ALARM_STAGE_FIELDS as Array<{ key: string; label: string }>)}<details className="dynamic-mask-group"><summary>Other</summary><div className="dynamic-mask-grid"><label><input type="checkbox" checked={mask.patientTransitionSeconds} onChange={(event) => onChange({ ...mask, patientTransitionSeconds: event.target.checked })} /><span>Transition time</span></label><label><input type="checkbox" checked={mask.waveformDisplay} onChange={(event) => onChange({ ...mask, waveformDisplay: event.target.checked })} /><span>Waveform display</span></label><label><input type="checkbox" checked={mask.mediaIds} onChange={(event) => onChange({ ...mask, mediaIds: event.target.checked })} /><span>Scenario media</span></label></div></details></div>
}

"""
text = text.replace(marker, insert + marker, 1)

# Builder state.
text = text.replace("  const [activeDynamicStage, setActiveDynamicStage] = useState(0)\n", """  const [activeDynamicStage, setActiveDynamicStage] = useState(0)
  const [dynamicCreateSourceId, setDynamicCreateSourceId] = useState('current')
  const [dynamicCreateMask, setDynamicCreateMask] = useState<DynamicScenarioApplyMask>(() => createFullDynamicStageApplyMask(currentScenario))
  const [stageBuilderPresetId, setStageBuilderPresetId] = useState<string | null>(null)
  const [stageBuilderSourceId, setStageBuilderSourceId] = useState('current')
  const [stageBuilderMask, setStageBuilderMask] = useState<DynamicScenarioApplyMask>(() => createFullDynamicStageApplyMask(currentScenario))
""")

# Source helpers after preset filters.
text = text.replace("  const dynamicPresets = useMemo(() => presets.filter((preset) => preset.scenario.kind === 'dynamic'), [presets])\n", """  const dynamicPresets = useMemo(() => presets.filter((preset) => preset.scenario.kind === 'dynamic'), [presets])
  const scenarioForStageSource = (sourceId: string) => sourceId === 'current' ? currentScenario : (staticPresets.find((preset) => preset.id === sourceId)?.scenario ?? currentScenario)
  const nameForStageSource = (sourceId: string) => sourceId === 'current' ? 'Current simulator state' : (staticPresets.find((preset) => preset.id === sourceId)?.name ?? 'Current simulator state')
  const resetMaskForSource = (sourceId: string, setter: (mask: DynamicScenarioApplyMask) => void) => setter(createFullDynamicStageApplyMask(scenarioForStageSource(sourceId)))
""")

# Replace saveScenario and dynamic-stage handlers.
old = """      const created = await createInstructorPreset(
        presetName,
        scenarioType === 'dynamic' ? asDynamicScenario(currentScenario, presetDescription) : asStaticScenario(currentScenario, presetDescription),
      )
"""
new = """      const dynamicSource = scenarioForStageSource(dynamicCreateSourceId)
      const created = await createInstructorPreset(
        presetName,
        scenarioType === 'dynamic'
          ? asDynamicScenario(dynamicSource, presetDescription, dynamicCreateMask, nameForStageSource(dynamicCreateSourceId))
          : asStaticScenario(currentScenario, presetDescription),
      )
"""
text = text.replace(old, new, 1)
text = text.replace("    onLoadScenario(stages[nextIndex].snapshot)\n", "    onLoadScenario(applyDynamicStage(currentScenario, stages[nextIndex]))\n", 1)
old = """  const addDynamicStageFromCurrent = async (preset: InstructorPresetRow) => {
    if (!account) return
    const stages = [...(preset.scenario.stages ?? [])]
    const stageNumber = stages.length + 1
    stages.push({ name: `Stage ${stageNumber}`, snapshot: asStaticScenario(currentScenario, '') })
    setPresetBusy(true)
    try {
      await updateInstructorPreset(preset.id, { scenario: { ...preset.scenario, schemaVersion: 3, kind: 'dynamic', stages } })
      setPresetMessage(`Added Stage ${stageNumber} to “${preset.name}”.`)
      await refreshPresets(account)
    } catch (cause) {
      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to add stage.')
    } finally { setPresetBusy(false) }
  }
"""
new = """  const addDynamicStage = async (preset: InstructorPresetRow) => {
    if (!account) return
    const stages = [...(preset.scenario.stages ?? [])]
    const stageNumber = stages.length + 1
    const source = scenarioForStageSource(stageBuilderSourceId)
    stages.push({
      name: `Stage ${stageNumber}`,
      snapshot: asStaticScenario(source, ''),
      apply: { ...stageBuilderMask, ventilator: [...stageBuilderMask.ventilator], patient: [...stageBuilderMask.patient], alarmLimits: [...stageBuilderMask.alarmLimits] },
      sourceName: nameForStageSource(stageBuilderSourceId),
    })
    setPresetBusy(true)
    try {
      await updateInstructorPreset(preset.id, { scenario: { ...preset.scenario, schemaVersion: 3, kind: 'dynamic', stages } })
      setPresetMessage(`Added Stage ${stageNumber} to “${preset.name}”.`)
      setStageBuilderPresetId(null)
      setStageBuilderSourceId('current')
      setStageBuilderMask(createFullDynamicStageApplyMask(currentScenario))
      await refreshPresets(account)
    } catch (cause) {
      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to add stage.')
    } finally { setPresetBusy(false) }
  }
"""
if old not in text: raise SystemExit('missing old dynamic add handler')
text = text.replace(old, new, 1)

# Dynamic create UI: source and mask.
text = text.replace("                    <div><span>{scenarioType === 'dynamic' ? 'New dynamic scenario' : 'New static preset'}</span><h3>{scenarioType === 'dynamic' ? 'Stage 1 uses the current simulator state' : 'Capture current simulator state'}</h3></div>\n", "                    <div><span>{scenarioType === 'dynamic' ? 'New dynamic scenario' : 'New static preset'}</span><h3>{scenarioType === 'dynamic' ? 'Configure Stage 1 source and applied parameters' : 'Capture current simulator state'}</h3></div>\n", 1)
needle = """                  </div>
                  <button type="button" className="account-primary-button scenario-save-current" disabled={presetBusy || !presetName.trim()} onClick={() => void saveScenario()}>{scenarioType === 'dynamic' ? 'Create dynamic scenario' : 'Save current state as preset'}</button>
"""
replacement = """                  </div>
                  {scenarioType === 'dynamic' && <div className="dynamic-stage-builder create"><DynamicStageSourceSelect value={dynamicCreateSourceId} staticPresets={staticPresets} onChange={(value) => { setDynamicCreateSourceId(value); resetMaskForSource(value, setDynamicCreateMask) }} /><DynamicStageApplyEditor mask={dynamicCreateMask} onChange={setDynamicCreateMask} /></div>}
                  <button type="button" className="account-primary-button scenario-save-current" disabled={presetBusy || !presetName.trim()} onClick={() => void saveScenario()}>{scenarioType === 'dynamic' ? 'Create dynamic scenario' : 'Save current state as preset'}</button>
"""
if needle not in text: raise SystemExit('missing create UI needle')
text = text.replace(needle, replacement, 1)

# Dynamic card: source info + inline builder + action button.
text = text.replace("                        {active && stages.length > 0 && <div className=\"dynamic-stage-status\"><strong>{stages[stageIndex].name}</strong><span>{stageIndex + 1} / {stages.length}</span></div>}\n", """                        {active && stages.length > 0 && <div className="dynamic-stage-status"><div><strong>{stages[stageIndex].name}</strong><small>{stages[stageIndex].sourceName ?? 'Full snapshot'}</small></div><span>{stageIndex + 1} / {stages.length}</span></div>}
                        {stageBuilderPresetId === preset.id && <div className="dynamic-stage-builder inline"><DynamicStageSourceSelect value={stageBuilderSourceId} staticPresets={staticPresets} onChange={(value) => { setStageBuilderSourceId(value); resetMaskForSource(value, setStageBuilderMask) }} /><DynamicStageApplyEditor mask={stageBuilderMask} onChange={setStageBuilderMask} /><div className="dynamic-stage-builder-actions"><button type="button" className="account-primary-button" disabled={presetBusy} onClick={() => void addDynamicStage(preset)}>Add Stage {stages.length + 1}</button><button type="button" disabled={presetBusy} onClick={() => setStageBuilderPresetId(null)}>Cancel</button></div></div>}
""", 1)
text = text.replace("                        <button type=\"button\" disabled={presetBusy} onClick={() => void addDynamicStageFromCurrent(preset)}>Add current as stage</button>\n", """                        <button type="button" disabled={presetBusy} onClick={() => { const opening = stageBuilderPresetId !== preset.id; setStageBuilderPresetId(opening ? preset.id : null); if (opening) { setStageBuilderSourceId('current'); setStageBuilderMask(createFullDynamicStageApplyMask(currentScenario)) } }}>{stageBuilderPresetId === preset.id ? 'Close stage builder' : 'Add stage'}</button>
""", 1)
p.write_text(text)

# CSS for compact builder controls.
p = Path('src/account.css')
css = p.read_text()
css += """

/* v0.82 dynamic stage source + selective parameter application */
.dynamic-stage-builder { margin-top:10px; padding:10px; border:1px solid #314852; background:#0c171c; display:grid; gap:9px; }
.dynamic-stage-builder.create { margin-bottom:10px; }
.dynamic-stage-source { display:grid; grid-template-columns:140px minmax(0,1fr); align-items:center; gap:10px; }
.dynamic-stage-source > span { color:#9eb0b8; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
.dynamic-stage-source select { min-width:0; border:1px solid #3b5360; border-radius:0; background:#101d23; color:#e7f0f3; padding:7px 8px; }
.dynamic-stage-mask { display:grid; gap:5px; }
.dynamic-mask-heading { display:flex; justify-content:space-between; align-items:center; gap:10px; }
.dynamic-mask-heading strong { font-size:11px; color:#c7d6dc; }
.dynamic-mask-heading div { display:flex; gap:5px; }
.dynamic-mask-heading button, .dynamic-stage-builder-actions button { border-radius:0; }
.dynamic-mask-group { border:1px solid #293f49; background:#0f1b20; }
.dynamic-mask-group summary { cursor:pointer; display:flex; justify-content:space-between; align-items:center; padding:6px 8px; color:#b8c8cf; font-size:11px; font-weight:700; }
.dynamic-mask-group summary small { color:#70858f; font-weight:600; }
.dynamic-mask-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:4px 8px; padding:7px 8px 9px; border-top:1px solid #263c46; }
.dynamic-mask-grid label { display:flex; align-items:center; gap:6px; min-width:0; color:#aebfc6; font-size:10px; }
.dynamic-mask-grid input { margin:0; }
.dynamic-stage-builder-actions { display:flex; gap:7px; justify-content:flex-end; }
.dynamic-stage-status > div { display:grid; gap:2px; }
.dynamic-stage-status > div small { color:#78909a; font-size:9px; }
@media (max-width: 800px) { .dynamic-mask-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .dynamic-stage-source { grid-template-columns:1fr; gap:4px; } }
"""
p.write_text(css)

print('v0.82 dynamic builder patch applied')
