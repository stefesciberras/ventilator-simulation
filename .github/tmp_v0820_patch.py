from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise RuntimeError(f'pattern not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

replace_once('src/appVersion.ts', "export const APP_VERSION = '0.81.9'", "export const APP_VERSION = '0.82.0'")

# Defaults: pressure limitation 40, peak pressure alarm 35.
replace_once('src/App.tsx', "  pressureLimit: 60,\n  apneaTime: 30,\n  peakPressure: 40,", "  pressureLimit: 40,\n  apneaTime: 30,\n  peakPressure: 35,")

# VG-PC: remove hidden 5 cmH2O reserve; configured limit is the actual airway pressure ceiling.
p = Path('src/simulation/engine.ts')
text = p.read_text()
text = text.replace("pressureLimit - 5 - ventilator.peep", "pressureLimit - ventilator.peep")
p.write_text(text)

# Dynamic scenario schema.
p = Path('src/instructorAccount.ts')
text = p.read_text()
text = text.replace("export interface InstructorScenarioSnapshot {\n", "export interface DynamicScenarioStage {\n  name: string\n  snapshot: InstructorScenarioSnapshot\n}\n\nexport interface InstructorScenarioSnapshot {\n")
text = text.replace("  mediaIds?: string[]\n  ventilator: VentilatorSettings\n", "  mediaIds?: string[]\n  stages?: DynamicScenarioStage[]\n  ventilator: VentilatorSettings\n")
insert_after = "export function asStaticScenario(\n"
idx = text.index(insert_after)
helper = '''export function asDynamicScenario(\n  current: InstructorScenarioSnapshot,\n  description = current.description ?? '',\n): InstructorScenarioSnapshot {\n  const firstStageSnapshot = asStaticScenario(current, '')\n  return {\n    ...firstStageSnapshot,\n    schemaVersion: 3,\n    kind: 'dynamic',\n    description: description.trim(),\n    stages: [{ name: 'Stage 1', snapshot: firstStageSnapshot }],\n  }\n}\n\n'''
text = text[:idx] + helper + text[idx:]
# normalise nested stages
old = "    mediaIds: [...new Set((scenario.mediaIds ?? []).filter((id) => typeof id === 'string' && id.length > 0))],\n  }\n}"
new = "    mediaIds: [...new Set((scenario.mediaIds ?? []).filter((id) => typeof id === 'string' && id.length > 0))],\n    stages: scenario.kind === 'dynamic' ? (scenario.stages ?? []).map((stage, index) => ({ name: stage.name || `Stage ${index + 1}`, snapshot: { ...stage.snapshot, kind: 'static', stages: undefined } })) : undefined,\n  }\n}"
# replace only second occurrence in normaliseScenario by split
first = text.find(old)
second = text.find(old, first + 1)
if second == -1: raise RuntimeError('normalise pattern not found')
text = text[:second] + new + text[second+len(old):]
p.write_text(text)

# Instructor scenario UI: dynamic tab, creation, add stage, and manual navigation.
p = Path('src/components/InstructorAccountControls.tsx')
text = p.read_text()
text = text.replace("  asStaticScenario,\n", "  asDynamicScenario,\n  asStaticScenario,\n")
text = text.replace("  const [presetDescription, setPresetDescription] = useState('')\n", "  const [presetDescription, setPresetDescription] = useState('')\n  const [scenarioType, setScenarioType] = useState<'static' | 'dynamic'>('static')\n  const [activeDynamicId, setActiveDynamicId] = useState<string | null>(null)\n  const [activeDynamicStage, setActiveDynamicStage] = useState(0)\n")
text = text.replace("  const staticPresets = useMemo(\n    () => presets.filter((preset) => (preset.scenario.kind ?? 'static') === 'static'),\n    [presets],\n  )\n", "  const staticPresets = useMemo(() => presets.filter((preset) => (preset.scenario.kind ?? 'static') === 'static'), [presets])\n  const dynamicPresets = useMemo(() => presets.filter((preset) => preset.scenario.kind === 'dynamic'), [presets])\n")
text = text.replace("        asStaticScenario(currentScenario, presetDescription),", "        scenarioType === 'dynamic' ? asDynamicScenario(currentScenario, presetDescription) : asStaticScenario(currentScenario, presetDescription),")
text = text.replace("      setPresetMessage(`Saved “${created.name}”.`)", "      setPresetMessage(`Saved “${created.name}”.`)\n      if (scenarioType === 'dynamic') { setActiveDynamicId(created.id); setActiveDynamicStage(0) }")

anchor = "  const loadScenario = (preset: InstructorPresetRow) => {\n"
idx = text.index(anchor)
dynamic_funcs = '''  const loadDynamicStage = (preset: InstructorPresetRow, index: number) => {\n    const stages = preset.scenario.stages ?? []\n    if (!stages.length) return\n    const nextIndex = Math.max(0, Math.min(stages.length - 1, index))\n    onLoadScenario(stages[nextIndex].snapshot)\n    setActiveDynamicId(preset.id)\n    setActiveDynamicStage(nextIndex)\n    setPresetMessage(`“${preset.name}” · ${stages[nextIndex].name} (${nextIndex + 1}/${stages.length})`)\n  }\n\n  const addDynamicStageFromCurrent = async (preset: InstructorPresetRow) => {\n    if (!account) return\n    const stages = [...(preset.scenario.stages ?? [])]\n    const stageNumber = stages.length + 1\n    stages.push({ name: `Stage ${stageNumber}`, snapshot: asStaticScenario(currentScenario, '') })\n    setPresetBusy(true)\n    try {\n      await updateInstructorPreset(preset.id, { scenario: { ...preset.scenario, schemaVersion: 3, kind: 'dynamic', stages } })\n      setPresetMessage(`Added Stage ${stageNumber} to “${preset.name}”.`)\n      await refreshPresets(account)\n    } catch (cause) {\n      setPresetMessage(cause instanceof Error ? cause.message : 'Unable to add stage.')\n    } finally { setPresetBusy(false) }\n  }\n\n'''
text = text[:idx] + dynamic_funcs + text[idx:]

text = text.replace('''            <div className="scenario-type-tabs" role="tablist" aria-label="Scenario type">\n              <button type="button" className="selected" role="tab" aria-selected="true">Static presets</button>\n              <button type="button" role="tab" aria-selected="false" disabled>Dynamic scenarios <small>later</small></button>\n            </div>''', '''            <div className="scenario-type-tabs" role="tablist" aria-label="Scenario type">\n              <button type="button" className={scenarioType === 'static' ? 'selected' : ''} role="tab" aria-selected={scenarioType === 'static'} onClick={() => setScenarioType('static')}>Static presets</button>\n              <button type="button" className={scenarioType === 'dynamic' ? 'selected' : ''} role="tab" aria-selected={scenarioType === 'dynamic'} onClick={() => setScenarioType('dynamic')}>Dynamic scenarios</button>\n            </div>''')
text = text.replace("<div><span>New static preset</span><h3>Capture current simulator state</h3></div>", "<div><span>{scenarioType === 'dynamic' ? 'New dynamic scenario' : 'New static preset'}</span><h3>{scenarioType === 'dynamic' ? 'Stage 1 uses the current simulator state' : 'Capture current simulator state'}</h3></div>")
text = text.replace("Save current state as preset</button>", "{scenarioType === 'dynamic' ? 'Create dynamic scenario' : 'Save current state as preset'}</button>")

# Replace library heading and list to switch by tab.
text = text.replace("<div><span>Library</span><strong>{staticPresets.length} static {staticPresets.length === 1 ? 'preset' : 'presets'}</strong></div>", "<div><span>Library</span><strong>{scenarioType === 'static' ? `${staticPresets.length} static ${staticPresets.length === 1 ? 'preset' : 'presets'}` : `${dynamicPresets.length} dynamic ${dynamicPresets.length === 1 ? 'scenario' : 'scenarios'}`}</strong></div>")
text = text.replace("{staticPresets.length ? staticPresets.map((preset) => {", "{scenarioType === 'static' && (staticPresets.length ? staticPresets.map((preset) => {")
text = text.replace("                  }) : <div className=\"scenario-empty\">No static scenarios saved yet. Configure the patient and ventilator, then capture the current state above.</div>}\n                </div>", "                  }) : <div className=\"scenario-empty\">No static scenarios saved yet. Configure the patient and ventilator, then capture the current state above.</div>)}\n                  {scenarioType === 'dynamic' && (dynamicPresets.length ? dynamicPresets.map((preset) => {\n                    const stages = preset.scenario.stages ?? []\n                    const active = activeDynamicId === preset.id\n                    const stageIndex = active ? Math.min(activeDynamicStage, Math.max(0, stages.length - 1)) : 0\n                    return <article className=\"scenario-card dynamic-scenario-card\" key={preset.id}>\n                      <div className=\"scenario-card-heading\"><div><span className=\"scenario-kind-badge\">Dynamic</span><strong>{preset.name}</strong><small>{stages.length} {stages.length === 1 ? 'stage' : 'stages'}</small></div></div>\n                      <div className=\"scenario-card-main\">\n                        {preset.scenario.description ? <p className=\"scenario-description\">{preset.scenario.description}</p> : <p className=\"scenario-description empty\">No instructor notes.</p>}\n                        {active && stages.length > 0 && <div className=\"dynamic-stage-status\"><strong>{stages[stageIndex].name}</strong><span>{stageIndex + 1} / {stages.length}</span></div>}\n                      </div>\n                      <div className=\"scenario-card-actions dynamic-actions\">\n                        <button type=\"button\" className=\"scenario-load-button\" disabled={presetBusy || !stages.length} onClick={() => loadDynamicStage(preset, active ? stageIndex : 0)}>{active ? 'Reload stage' : 'Start'}</button>\n                        <button type=\"button\" disabled={presetBusy || !active || stageIndex <= 0} onClick={() => loadDynamicStage(preset, stageIndex - 1)}>Back</button>\n                        <button type=\"button\" className=\"account-primary-button\" disabled={presetBusy || !active || stageIndex >= stages.length - 1} onClick={() => loadDynamicStage(preset, stageIndex + 1)}>Proceed to Next</button>\n                        <button type=\"button\" disabled={presetBusy} onClick={() => void addDynamicStageFromCurrent(preset)}>Add current as stage</button>\n                        <button type=\"button\" className=\"scenario-delete-button\" disabled={presetBusy} onClick={() => void removeScenario(preset)}>Delete</button>\n                      </div>\n                    </article>\n                  }) : <div className=\"scenario-empty\">No dynamic scenarios saved yet. Create one from the current simulator state, then add further stages from the states you want to teach.</div>)}\n                </div>")
p.write_text(text)

# Dynamic UI styling.
p = Path('src/account.css')
text = p.read_text() + '''\n\n/* v0.82.0 linear dynamic scenarios */\n.dynamic-stage-status { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:8px; padding:7px 9px; border:1px solid #3d5360; background:#101b20; }\n.dynamic-stage-status strong { color:#e8f2f5; font-size:11px; }\n.dynamic-stage-status span { color:#8ea4ae; font-size:10px; }\n.dynamic-actions .account-primary-button { color:#ddf7e5; border-color:#4d9562; background:#173821; }\n'''
p.write_text(text)

print('v0.82.0 patch applied')
