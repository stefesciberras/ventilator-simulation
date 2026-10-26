from pathlib import Path

# 1) Clinical grouping in the EDUMON registry. Keep simulation variables in the
# registry for runtime/backwards compatibility; authoring UI filters them out.
p = Path('src/scenario-builder/modules/edumon/definition.ts')
s = p.read_text()
replacements = {
    "group: 'Monitor patient state'": "group: 'Cardiovascular'",
    "group: 'Respiratory physiology'": "group: 'Respiratory'",
    "group: 'Anaesthetic physiology'": "group: 'Anaesthesia'",
}
for old, new in replacements.items():
    s = s.replace(old, new)
# Move SpO2 / perfusion into Respiratory, temperature into Metabolism.
s = s.replace("{ id: 'spo2', label: 'SpO₂', group: 'Cardiovascular'", "{ id: 'spo2', label: 'SpO₂', group: 'Respiratory'")
s = s.replace("{ id: 'peripheralPerfusion', label: 'Peripheral perfusion', group: 'Cardiovascular'", "{ id: 'peripheralPerfusion', label: 'Peripheral perfusion', group: 'Respiratory'")
s = s.replace("{ id: 'temperatureC', label: 'Temperature', group: 'Cardiovascular'", "{ id: 'temperatureC', label: 'Temperature', group: 'Metabolism'")
# Export an explicit clinically meaningful display order for Patient/Stage editors.
anchor = "const variables: ScenarioVariableDefinition[] = [\n"
insert = "export const EDUMON_PATIENT_GROUP_ORDER = ['Patient characteristics', 'Cardiovascular', 'Respiratory', 'Metabolism', 'Anaesthesia'] as const\n\n" + anchor
if anchor not in s:
    raise SystemExit('definition variables anchor missing')
s = s.replace(anchor, insert, 1)
p.write_text(s)

# 2) Scenario stage editor: show Patient state only (no simulation pause/speed),
# use explicit clinical section order and always display the actual slider value.
p = Path('src/scenario-builder/modules/edumon/authoringAdapter.tsx')
s = p.read_text()
s = s.replace("  getEdumonScenarioModule,\n", "  EDUMON_PATIENT_GROUP_ORDER,\n  getEdumonScenarioModule,\n")
old = """  const value = readScenarioSnapshotValue(snapshot, variable)\n  const set = (next: unknown) => onChange(writeScenarioSnapshotValue(snapshot, variable, next))\n\n  return <div className={`shared-scenario-variable-row ${variable.type === 'number' ? 'slider' : ''} ${applied ? 'applied' : 'not-applied'}`}>\n"""
new = """  const value = readScenarioSnapshotValue(snapshot, variable)\n  const effectiveValue = value ?? variable.defaultValue ?? (variable.type === 'number' ? variable.min ?? 0 : undefined)\n  const set = (next: unknown) => onChange(writeScenarioSnapshotValue(snapshot, variable, next))\n\n  return <div className={`shared-scenario-variable-row ${variable.type === 'number' ? 'slider' : ''} ${applied ? 'applied' : 'not-applied'}`}>\n"""
if old not in s:
    raise SystemExit('authoring control value anchor missing')
s = s.replace(old, new, 1)
s = s.replace("<strong>{displayValue(variable, value)}</strong>", "<strong>{displayValue(variable, effectiveValue)}</strong>")
s = s.replace("value={typeof value === 'number' ? value : Number(variable.defaultValue ?? variable.min ?? 0)}", "value={typeof effectiveValue === 'number' ? effectiveValue : Number(variable.defaultValue ?? variable.min ?? 0)}")
s = s.replace("value={String(value ?? variable.defaultValue ?? '')}", "value={String(effectiveValue ?? '')}")
s = s.replace("set(typeof value === 'number' ? Number(event.target.value) : event.target.value)", "set(typeof effectiveValue === 'number' ? Number(event.target.value) : event.target.value)")
s = s.replace("checked={Boolean(value)}", "checked={Boolean(effectiveValue)}")
s = s.replace("<span>{value ? 'Enabled' : 'Disabled'}</span>", "<span>{effectiveValue ? 'Enabled' : 'Disabled'}</span>")
s = s.replace("value={String(value ?? '')}", "value={String(effectiveValue ?? '')}")
old = """  const module = getEdumonScenarioModule(product)\n  const editable = writableScenarioVariables(module)\n  const selected = new Set(appliedVariableIds ?? editable.map((variable) => variable.id))\n  const setApplied = (id: string, enabled: boolean) => { const next = new Set(selected); if (enabled) next.add(id); else next.delete(id); onAppliedVariableIdsChange?.([...next]) }\n  const groups = [...new Set(editable.map((variable) => variable.group))]\n"""
new = """  const module = getEdumonScenarioModule(product)\n  const editable = writableScenarioVariables(module).filter((variable) => variable.snapshotPath?.startsWith('patient.'))\n  const selected = new Set(appliedVariableIds ?? editable.map((variable) => variable.id))\n  const setApplied = (id: string, enabled: boolean) => { const next = new Set(selected); if (enabled) next.add(id); else next.delete(id); onAppliedVariableIdsChange?.([...next]) }\n  const groups = EDUMON_PATIENT_GROUP_ORDER.filter((group) => editable.some((variable) => variable.group === group))\n"""
if old not in s:
    raise SystemExit('SnapshotEditor grouping anchor missing')
s = s.replace(old, new, 1)
# New scenarios should default Apply only for patient variables; runtime keeps old simulation support.
s = s.replace("  const editableVariables = writableScenarioVariables(module)\n", "  const editableVariables = writableScenarioVariables(module).filter((variable) => variable.snapshotPath?.startsWith('patient.'))\n")
p.write_text(s)

# 3) Patient editor: same explicit group order and numeric fallback display.
p = Path('src/scenario-builder/ProfileEditor.tsx')
s = p.read_text()
s = s.replace("import { getEdumonScenarioModule } from './modules/edumon/definition'", "import { EDUMON_PATIENT_GROUP_ORDER, getEdumonScenarioModule } from './modules/edumon/definition'")
anchor = "type LibraryScope = 'organisation' | 'user'\n"
helper = """type LibraryScope = 'organisation' | 'user'\n\nfunction profileGroupOrder(product: ScenarioProductId, variables: Array<{ variable: ScenarioVariableDefinition }>) {\n  const present = new Set(variables.map(({ variable }) => variable.group))\n  if (product === 'anaesth' || product === 'icu') {\n    return EDUMON_PATIENT_GROUP_ORDER.filter((group) => present.has(group))\n  }\n  return [...present]\n}\n"""
if anchor not in s:
    raise SystemExit('ProfileEditor LibraryScope anchor missing')
s = s.replace(anchor, helper, 1)
# Compute groups once.
s = s.replace("  const variables = useMemo(() => profileVariables(product), [product])\n", "  const variables = useMemo(() => profileVariables(product), [product])\n  const groups = useMemo(() => profileGroupOrder(product, variables), [product, variables])\n")
s = s.replace("{[...new Set(variables.map(({ variable }) => variable.group))].map((group) => <section", "{groups.map((group) => <section")
# Ensure label and slider share same effective value even for older/custom sparse rows.
old = """                {variables.filter(({ variable }) => variable.group === group).map(({ variable, key }) => {\n                  const value = readValue(draftValues, key)\n                  return <div key={variable.id} className={`shared-scenario-variable-row ${variable.type === 'number' ? 'slider' : ''}`}>\n                    <div className=\"shared-scenario-variable-heading\"><span className=\"shared-scenario-variable-label\">{variable.label}</span><strong>{displayValue(variable, value)}</strong></div>\n                    {variable.type === 'number' && <input disabled={!libraryWritable} className=\"shared-scenario-control-slider\" type=\"range\" min={variable.min ?? 0} max={variable.max ?? 100} step={variable.step ?? 1} value={typeof value === 'number' ? value : Number(variable.defaultValue ?? variable.min ?? 0)} onChange={(event) => updateValue(key, Number(event.target.value))} />}\n                    {variable.type === 'select' && <select disabled={!libraryWritable} value={String(value ?? variable.defaultValue ?? '')} onChange={(event) => updateValue(key, event.target.value)}>{variable.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}\n                    {variable.type === 'boolean' && <label className=\"shared-scenario-boolean-control\"><input disabled={!libraryWritable} type=\"checkbox\" checked={Boolean(value)} onChange={(event) => updateValue(key, event.target.checked)} /><span>{value ? 'Enabled' : 'Disabled'}</span></label>}\n                  </div>\n                })}\n"""
new = """                {variables.filter(({ variable }) => variable.group === group).map(({ variable, key }) => {\n                  const value = readValue(draftValues, key)\n                  const effectiveValue = value ?? variable.defaultValue ?? (variable.type === 'number' ? variable.min ?? 0 : undefined)\n                  return <div key={variable.id} className={`shared-scenario-variable-row ${variable.type === 'number' ? 'slider' : ''}`}>\n                    <div className=\"shared-scenario-variable-heading\"><span className=\"shared-scenario-variable-label\">{variable.label}</span><strong>{displayValue(variable, effectiveValue)}</strong></div>\n                    {variable.type === 'number' && <input disabled={!libraryWritable} className=\"shared-scenario-control-slider\" type=\"range\" min={variable.min ?? 0} max={variable.max ?? 100} step={variable.step ?? 1} value={typeof effectiveValue === 'number' ? effectiveValue : Number(variable.defaultValue ?? variable.min ?? 0)} onChange={(event) => updateValue(key, Number(event.target.value))} />}\n                    {variable.type === 'select' && <select disabled={!libraryWritable} value={String(effectiveValue ?? '')} onChange={(event) => updateValue(key, event.target.value)}>{variable.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}\n                    {variable.type === 'boolean' && <label className=\"shared-scenario-boolean-control\"><input disabled={!libraryWritable} type=\"checkbox\" checked={Boolean(effectiveValue)} onChange={(event) => updateValue(key, event.target.checked)} /><span>{effectiveValue ? 'Enabled' : 'Disabled'}</span></label>}\n                  </div>\n                })}\n"""
if old not in s:
    raise SystemExit('ProfileEditor variable rendering anchor missing')
s = s.replace(old, new, 1)
p.write_text(s)

# 4) Version bump.
p = Path('src/scenario-builder/version.ts')
s = p.read_text().replace("SCENARIO_BUILDER_VERSION = '0.11.1'", "SCENARIO_BUILDER_VERSION = '0.11.2'")
p.write_text(s)
