from pathlib import Path

p = Path('src/components/DynamicScenarioBuilder.tsx')
s = p.read_text()

s = s.replace("  format?: (value: unknown) => string\n}", "  format?: (value: unknown) => string\n  defaultValue?: unknown\n}")
s = s.replace("{ key: 'maxSpO2', label: 'Maximum SpO₂', min: 80, max: 100, unit: '%' },", "{ key: 'maxSpO2', label: 'Maximum SpO₂', min: 80, max: 100, unit: '%', defaultValue: 100 },")
s = s.replace("{ key: 'vdVt', label: 'Vd/Vt', step: .05, min: .1, max: .9, format: (v) => Number(v).toFixed(2) },", "{ key: 'vdVt', label: 'Vd/Vt', step: .05, min: .1, max: .9, format: (v) => Number(v).toFixed(2), defaultValue: .4 },")

needle = "function cloneScenario<T>(value: T): T {\n  return JSON.parse(JSON.stringify(value)) as T\n}\n"
replacement = needle + "\nfunction normalisePhysiologyDefaults(snapshot: InstructorScenarioSnapshot): InstructorScenarioSnapshot {\n  const patient = { ...snapshot.patient }\n  if (!Number.isFinite(patient.maxSpO2 ?? Number.NaN)) patient.maxSpO2 = 100\n  if (!Number.isFinite(patient.vdVt ?? Number.NaN)) patient.vdVt = 0.4\n  return { ...snapshot, patient }\n}\n\nfunction resolvedFieldValue(field: FieldSpec, value: unknown): unknown {\n  if (field.type === 'select' || field.type === 'boolean') return value ?? field.defaultValue\n  const numeric = Number(value)\n  if (Number.isFinite(numeric)) return numeric\n  return field.defaultValue ?? field.min ?? 0\n}\n"
if needle not in s:
    raise SystemExit('clone needle not found')
s = s.replace(needle, replacement, 1)

s = s.replace("  const snapshot = cloneScenario(stage.snapshot)\n", "  const snapshot = normalisePhysiologyDefaults(cloneScenario(stage.snapshot))\n", 1)
s = s.replace("  const snapshot = asStaticScenario(cloneScenario(base), '')\n", "  const snapshot = normalisePhysiologyDefaults(asStaticScenario(cloneScenario(base), ''))\n", 1)
s = s.replace("    const snapshot = asStaticScenario(cloneScenario(preset.scenario), '')\n", "    const snapshot = normalisePhysiologyDefaults(asStaticScenario(cloneScenario(preset.scenario), ''))\n", 1)

old = "function displayValue(field: FieldSpec, value: unknown) {\n  if (field.format) return field.format(value)\n  if (field.type === 'boolean') return Boolean(value) ? 'On' : 'Off'\n  return `${Number(value)}${field.unit ?? ''}`\n}"
new = "function displayValue(field: FieldSpec, value: unknown) {\n  const resolved = resolvedFieldValue(field, value)\n  if (field.format) return field.format(resolved)\n  if (field.type === 'boolean') return Boolean(resolved) ? 'On' : 'Off'\n  return `${Number(resolved)}${field.unit ?? ''}`\n}"
if old not in s:
    raise SystemExit('displayValue needle not found')
s = s.replace(old, new, 1)

s = s.replace("          value={Number(value ?? 0)}\n", "          value={Number(resolvedFieldValue(field, value))}\n", 1)

p.write_text(s)

css = Path('src/components/DynamicScenarioBuilder.css')
c = css.read_text()
c = c.replace(".dynamic-control-slider {\n  width: 100%;\n  margin: 0;\n  accent-color: #df8a32;\n}\n", ".dynamic-control-slider {\n  width: 100%;\n  margin: 0;\n}\n\n.dynamic-control-column.vent .dynamic-control-slider { accent-color: #75cbe7 !important; }\n.dynamic-control-column.patient .dynamic-control-slider { accent-color: #8dd5a0 !important; }\n.dynamic-control-column.physio .dynamic-control-slider { accent-color: #c0a5e5 !important; }\n\n.dynamic-control-column.vent .dynamic-control-slider::-webkit-slider-thumb { background: #75cbe7; border-color: #75cbe7; }\n.dynamic-control-column.patient .dynamic-control-slider::-webkit-slider-thumb { background: #8dd5a0; border-color: #8dd5a0; }\n.dynamic-control-column.physio .dynamic-control-slider::-webkit-slider-thumb { background: #c0a5e5; border-color: #c0a5e5; }\n.dynamic-control-column.vent .dynamic-control-slider::-moz-range-thumb { background: #75cbe7; border-color: #75cbe7; }\n.dynamic-control-column.patient .dynamic-control-slider::-moz-range-thumb { background: #8dd5a0; border-color: #8dd5a0; }\n.dynamic-control-column.physio .dynamic-control-slider::-moz-range-thumb { background: #c0a5e5; border-color: #c0a5e5; }\n\n.dynamic-control-column.vent .dynamic-control-slider::-moz-range-progress { background: #75cbe7; }\n.dynamic-control-column.patient .dynamic-control-slider::-moz-range-progress { background: #8dd5a0; }\n.dynamic-control-column.physio .dynamic-control-slider::-moz-range-progress { background: #c0a5e5; }\n")
css.write_text(c)
