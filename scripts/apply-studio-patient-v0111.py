from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'pattern missing in {path}: {old[:160]!r}')
    p.write_text(text.replace(old, new, 1))

# Expand EDUMON registry patient variables without broadening action-trigger vocabulary yet.
path = 'src/scenario-builder/modules/edumon/definition.ts'
p = Path(path)
s = p.read_text()
s = s.replace("import { RHYTHM_LABELS } from '../../../edumon/monitorEngine'", "import { ECG_MORPHOLOGIES, ECG_MORPHOLOGY_LABELS, RHYTHM_LABELS } from '../../../edumon/monitorEngine'")
s = s.replace("import type { CardiacRhythm } from '../../../edumon/types'", "import type { CardiacRhythm, EcgMorphology } from '../../../edumon/types'")
s = s.replace("const rhythmOptions = (Object.keys(RHYTHM_LABELS) as CardiacRhythm[]).map((value) => ({ value, label: RHYTHM_LABELS[value] }))", "const rhythmOptions = (Object.keys(RHYTHM_LABELS) as CardiacRhythm[]).map((value) => ({ value, label: RHYTHM_LABELS[value] }))\nconst morphologyOptions = (ECG_MORPHOLOGIES as EcgMorphology[]).map((value) => ({ value, label: ECG_MORPHOLOGY_LABELS[value] }))")
needle = "  { id: 'rhythm', label: 'Rhythm', group: 'Monitor patient state', type: 'select', role: 'setting', options: rhythmOptions, writable: true, snapshotPath: 'patient.rhythm' },\n"
insert = needle + "  { id: 'ecgMorphology', label: 'ECG morphology', group: 'Monitor patient state', type: 'select', role: 'setting', options: morphologyOptions, writable: true, snapshotPath: 'patient.ecgMorphology' },\n  { id: 'morphologySeverity', label: 'Morphology severity', group: 'Monitor patient state', type: 'number', role: 'setting', unit: '%', min: 0, max: 100, step: 1, defaultValue: 50, writable: true, snapshotPath: 'patient.morphologySeverity' },\n"
if needle not in s: raise SystemExit('rhythm registry anchor missing')
s = s.replace(needle, insert, 1)
needle = "  { id: 'peripheralPerfusion', label: 'Peripheral perfusion', group: 'Monitor patient state', type: 'number', role: 'setting', min: 0, max: 2, step: 0.05, writable: true, snapshotPath: 'patient.peripheralPerfusion', transitionable: true },\n"
insert = needle + "  { id: 'temperatureC', label: 'Temperature', group: 'Monitor patient state', type: 'number', role: 'setting', unit: '°C', min: 30, max: 42, step: 0.1, defaultValue: 37, writable: true, snapshotPath: 'patient.temperatureC' },\n  { id: 'spontaneousRespiratoryRate', label: 'Spontaneous respiratory rate', group: 'Respiratory physiology', type: 'number', role: 'setting', unit: '/min', min: 0, max: 40, step: 1, defaultValue: 12, writable: true, snapshotPath: 'patient.respiratory.spontaneousRespiratoryRate' },\n  { id: 'spontaneousTidalVolumeMl', label: 'Spontaneous tidal volume', group: 'Respiratory physiology', type: 'number', role: 'setting', unit: 'mL', min: 50, max: 1500, step: 10, defaultValue: 500, writable: true, snapshotPath: 'patient.respiratory.spontaneousTidalVolumeMl' },\n  { id: 'deadSpaceMl', label: 'Dead space', group: 'Respiratory physiology', type: 'number', role: 'setting', unit: 'mL', min: 0, max: 500, step: 10, defaultValue: 150, writable: true, snapshotPath: 'patient.respiratory.deadSpaceMl' },\n  { id: 'complianceMlPerCmH2O', label: 'Respiratory compliance', group: 'Respiratory physiology', type: 'number', role: 'setting', unit: 'mL/cmH₂O', min: 5, max: 200, step: 5, defaultValue: 70, writable: true, snapshotPath: 'patient.respiratory.complianceMlPerCmH2O' },\n  { id: 'expiratoryResistanceCmH2OLs', label: 'Expiratory resistance', group: 'Respiratory physiology', type: 'number', role: 'setting', unit: 'cmH₂O/L/s', min: 1, max: 60, step: 1, defaultValue: 8, writable: true, snapshotPath: 'patient.respiratory.expiratoryResistanceCmH2OLs' },\n  { id: 'frcMl', label: 'Functional residual capacity', group: 'Respiratory physiology', type: 'number', role: 'setting', unit: 'mL', min: 500, max: 6000, step: 100, defaultValue: 2500, writable: true, snapshotPath: 'patient.respiratory.frcMl' },\n  { id: 'shuntFraction', label: 'Shunt fraction', group: 'Respiratory physiology', type: 'number', role: 'setting', min: 0, max: 0.8, step: 0.01, defaultValue: 0.03, writable: true, snapshotPath: 'patient.respiratory.shuntFraction' },\n  { id: 'maxSpO2', label: 'Maximum SpO₂', group: 'Respiratory physiology', type: 'number', role: 'setting', unit: '%', min: 50, max: 100, step: 1, defaultValue: 100, writable: true, snapshotPath: 'patient.respiratory.maxSpO2' },\n  { id: 'oxygenConsumptionMlMin', label: 'VO₂', group: 'Metabolism', type: 'number', role: 'setting', unit: 'mL/min', min: 50, max: 600, step: 10, defaultValue: 250, writable: true, snapshotPath: 'patient.respiratory.oxygenConsumptionMlMin' },\n  { id: 'co2ProductionMlMin', label: 'VCO₂', group: 'Metabolism', type: 'number', role: 'setting', unit: 'mL/min', min: 50, max: 600, step: 10, defaultValue: 250, writable: true, snapshotPath: 'patient.respiratory.co2ProductionMlMin' },\n  { id: 'sex', label: 'Sex', group: 'Patient characteristics', type: 'select', role: 'setting', options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }], writable: true, snapshotPath: 'patient.respiratory.sex' },\n  { id: 'heightCm', label: 'Height', group: 'Patient characteristics', type: 'number', role: 'setting', unit: 'cm', min: 50, max: 220, step: 1, defaultValue: 170, writable: true, snapshotPath: 'patient.respiratory.heightCm' },\n  { id: 'anaestheticSensitivity', label: 'Anaesthetic sensitivity', group: 'Anaesthetic physiology', type: 'number', role: 'setting', min: -1, max: 1, step: 0.1, defaultValue: 0, writable: true, snapshotPath: 'patient.anaestheticPhysiology.anaestheticSensitivity' },\n  { id: 'anaestheticResponse', label: 'Anaesthetic haemodynamic response', group: 'Anaesthetic physiology', type: 'number', role: 'setting', min: -1, max: 1, step: 0.1, defaultValue: 0, writable: true, snapshotPath: 'patient.anaestheticPhysiology.anaestheticResponse' },\n  { id: 'depthOfAnaesthesia', label: 'Depth of anaesthesia', group: 'Anaesthetic physiology', type: 'number', role: 'setting', min: 1, max: 5, step: 1, defaultValue: 5, writable: true, snapshotPath: 'patient.anaestheticPhysiology.depthOfAnaesthesia' },\n"
if needle not in s: raise SystemExit('perfusion registry anchor missing')
s = s.replace(needle, insert, 1)
p.write_text(s)

# Built-ins become complete patient baselines for the profile editor.
Path('src/edumon/patientProfiles.ts').write_text("""import {\n  DEFAULT_MONITOR_ANAESTHETIC_PHYSIOLOGY_SETTINGS,\n  DEFAULT_MONITOR_RESPIRATORY_SETTINGS,\n  type MonitorPatientState,\n} from './types'\n\nexport type EdumonPatientProfile = 'Awake' | 'Asleep' | 'Paediatric'\n\nconst patientRespiratoryBaseline = {\n  spontaneousRespiratoryRate: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.spontaneousRespiratoryRate,\n  spontaneousTidalVolumeMl: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.spontaneousTidalVolumeMl,\n  deadSpaceMl: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.deadSpaceMl,\n  complianceMlPerCmH2O: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.complianceMlPerCmH2O,\n  expiratoryResistanceCmH2OLs: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.expiratoryResistanceCmH2OLs,\n  frcMl: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.frcMl,\n  shuntFraction: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.shuntFraction,\n  maxSpO2: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.maxSpO2,\n  oxygenConsumptionMlMin: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.oxygenConsumptionMlMin,\n  co2ProductionMlMin: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.co2ProductionMlMin,\n  sex: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.sex,\n  heightCm: DEFAULT_MONITOR_RESPIRATORY_SETTINGS.heightCm,\n}\n\nconst common = {\n  rhythm: 'sinus' as const,\n  ecgMorphology: 'nil' as const,\n  morphologySeverity: 50,\n  peripheralPerfusion: 1,\n  temperatureC: 37,\n  respiratory: { ...patientRespiratoryBaseline },\n  anaestheticPhysiology: { ...DEFAULT_MONITOR_ANAESTHETIC_PHYSIOLOGY_SETTINGS },\n}\n\nexport const EDUMON_PATIENT_PROFILES: Record<EdumonPatientProfile, MonitorPatientState> = {\n  Awake: { ...common, heartRate: 78, systolicPressure: 122, diastolicPressure: 68, spo2: 98 },\n  Asleep: { ...common, respiratory: { ...patientRespiratoryBaseline }, anaestheticPhysiology: { ...DEFAULT_MONITOR_ANAESTHETIC_PHYSIOLOGY_SETTINGS }, heartRate: 62, systolicPressure: 105, diastolicPressure: 60, spo2: 99, peripheralPerfusion: 0.9 },\n  Paediatric: { ...common, respiratory: { ...patientRespiratoryBaseline, spontaneousRespiratoryRate: 20, spontaneousTidalVolumeMl: 250, deadSpaceMl: 75, frcMl: 1200, oxygenConsumptionMlMin: 180, co2ProductionMlMin: 180, heightCm: 120 }, anaestheticPhysiology: { ...DEFAULT_MONITOR_ANAESTHETIC_PHYSIOLOGY_SETTINGS }, heartRate: 110, systolicPressure: 95, diastolicPressure: 55, spo2: 99 },\n}\n""")

# Profile editor: nested paths, deep inheritance and Patient terminology.
path = 'src/scenario-builder/ProfileEditor.tsx'
p = Path(path)
s = p.read_text()
anchor = "function decimalsFor(step?: number) {"
helpers = """function readValue(values: Record<string, unknown>, path: string): unknown {\n  let current: unknown = values\n  for (const part of path.split('.')) {\n    if (!current || typeof current !== 'object') return undefined\n    current = (current as Record<string, unknown>)[part]\n  }\n  return current\n}\n\nfunction writeValue(values: Record<string, unknown>, path: string, value: unknown) {\n  const clone = structuredClone(values)\n  const parts = path.split('.')\n  let current = clone\n  for (let index = 0; index < parts.length - 1; index += 1) {\n    const part = parts[index]\n    const next = current[part]\n    current[part] = next && typeof next === 'object' ? structuredClone(next) : {}\n    current = current[part] as Record<string, unknown>\n  }\n  current[parts[parts.length - 1]] = value\n  return clone\n}\n\nfunction deepMerge(...sources: Array<Record<string, unknown> | undefined>): Record<string, unknown> {\n  const result: Record<string, unknown> = {}\n  for (const source of sources) {\n    if (!source) continue\n    for (const [key, value] of Object.entries(source)) {\n      const previous = result[key]\n      result[key] = value && typeof value === 'object' && !Array.isArray(value)\n        ? deepMerge(previous && typeof previous === 'object' && !Array.isArray(previous) ? previous as Record<string, unknown> : undefined, value as Record<string, unknown>)\n        : value\n    }\n  }\n  return result\n}\n\n"""
if anchor not in s: raise SystemExit('profile helper anchor missing')
s = s.replace(anchor, helpers + anchor, 1)
s = s.replace("values: scope === 'organisation'\n          ? { ...builtin.values, ...(organisationOverride?.values ?? {}) }\n          : { ...builtin.values, ...(organisationOverride?.values ?? {}), ...(userOverride?.values ?? {}) },", "values: scope === 'organisation'\n          ? deepMerge(builtin.values, organisationOverride?.values)\n          : deepMerge(builtin.values, organisationOverride?.values, userOverride?.values),")
s = s.replace("  const updateValue = (key: string, value: unknown) => setDraftValues((current) => ({ ...current, [key]: value }))", "  const updateValue = (key: string, value: unknown) => setDraftValues((current) => writeValue(current, key, value))")
s = s.replace("                  const value = draftValues[key]", "                  const value = readValue(draftValues, key)")
repls = {
"Loading profiles…":"Loading patients…",
">My profiles<":">My patients<",
"shared profile library":"shared patient library",
"shared profile library.":"shared patient library.",
"Personal profiles are private":"Personal patients are private",
"Organisation profiles":"Organisation patients",
"My profiles":"My patients",
"Built-in profile":"Built-in patient",
"Organisation profile":"Organisation patient",
"Personal profile":"Personal patient",
"Profiles are reusable baseline patient states.":"Patient presets are reusable baseline patient states.",
"Save profile":"Save patient",
"Profile name":"Patient name",
"Profile duplicated into the organisation library.":"Patient duplicated into the organisation library.",
"Profile duplicated into My profiles.":"Patient duplicated into My patients.",
"Profile deleted.":"Patient preset deleted.",
"No profiles available.":"No patient presets available.",
"Unable to save profile.":"Unable to save patient preset.",
"Unable to duplicate profile.":"Unable to duplicate patient preset.",
"Unable to restore profile.":"Unable to restore patient preset.",
"Unable to delete profile.":"Unable to delete patient preset.",
"Organisation profile override saved.":"Organisation patient override saved.",
"Personal profile override saved.":"Personal patient override saved.",
"Organisation profile saved.":"Organisation patient saved.",
"Personal profile saved.":"Personal patient saved.",
"Profile name already":"Patient name already",
"copy a profile into My profiles":"copy a patient into My patients",
}
for old, new in repls.items(): s = s.replace(old, new)
p.write_text(s)

# Applying an EDUMON patient preset now applies patient physiology but preserves device controls.
path = 'src/edumon/EdumonWorkspacePanel.tsx'
p = Path(path)
s = p.read_text()
old = """    onPatientStateChange({\n      ...values,\n      respiratory: patientState.respiratory,\n      anaestheticGases: patientState.anaestheticGases,\n      anaestheticPhysiology: patientState.anaestheticPhysiology,\n    })"""
new = """    onPatientStateChange({\n      ...patientState,\n      ...values,\n      respiratory: {\n        ...(patientState.respiratory ?? {}),\n        ...(values.respiratory ?? {}),\n      },\n      anaestheticGases: patientState.anaestheticGases,\n      anaestheticPhysiology: {\n        ...(patientState.anaestheticPhysiology ?? {}),\n        ...(values.anaestheticPhysiology ?? {}),\n      },\n    })"""
if old not in s: raise SystemExit('EDUMON applyProfile anchor missing')
s = s.replace(old, new, 1)
p.write_text(s)

# User-facing Studio terminology and patch version.
path = 'src/scenario-builder/ScenarioBuilderApp.tsx'
p = Path(path)
s = p.read_text()
s = s.replace('organisation profile libraries', 'organisation patient libraries')
s = s.replace(">Profiles</button>", ">Patient</button>")
p.write_text(s)
replace_once('src/scenario-builder/version.ts', "export const SCENARIO_BUILDER_VERSION = '0.11.0'", "export const SCENARIO_BUILDER_VERSION = '0.11.1'")
