from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Expected text not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, count))

# Shared MV-compatible VD/VT helpers.
path = 'src/patientMetrics.ts'
replace(path,
"export function calculateConfiguredVdVt(patient: PatientSettings, referenceTidalVolumeMl?: number): number {\n  if (Number.isFinite(patient.vdVt)) return clamp(patient.vdVt, 0.05, 0.95)\n  const legacyDeadSpace = patient.deadSpaceVolume\n  if (legacyDeadSpace != null && Number.isFinite(legacyDeadSpace) && referenceTidalVolumeMl != null && referenceTidalVolumeMl > 0) {\n    return clamp(legacyDeadSpace / referenceTidalVolumeMl, 0.05, 0.95)\n  }\n  return 0.4\n}\n\nexport function calculateEffectiveDeadSpace(patient: PatientSettings, tidalVolumeMl: number): { deadSpaceMl: number; vdVt: number; anatomicDeadSpaceMl: number } {\n  const referenceTidalVolumeMl = Math.max(0, tidalVolumeMl)\n  const configuredVdVt = calculateConfiguredVdVt(patient, referenceTidalVolumeMl)\n  const anatomicDeadSpaceMl = calculateAnatomicDeadSpaceMl(patient)\n  const deadSpaceMl = Math.max(anatomicDeadSpaceMl, referenceTidalVolumeMl * configuredVdVt)\n  const vdVt = referenceTidalVolumeMl > 0 ? deadSpaceMl / referenceTidalVolumeMl : configuredVdVt\n  return { deadSpaceMl, vdVt, anatomicDeadSpaceMl }\n}\n",
"export function calculateConfiguredVdVtFromValues(vdVt: number | undefined, legacyDeadSpaceMl: number | undefined, referenceTidalVolumeMl?: number): number {\n  if (vdVt != null && Number.isFinite(vdVt)) return clamp(vdVt, 0.05, 0.95)\n  if (legacyDeadSpaceMl != null && Number.isFinite(legacyDeadSpaceMl) && referenceTidalVolumeMl != null && referenceTidalVolumeMl > 0) {\n    return clamp(legacyDeadSpaceMl / referenceTidalVolumeMl, 0.05, 0.95)\n  }\n  return 0.4\n}\n\nexport function calculateEffectiveDeadSpaceFromVdVt(\n  patient: { sex: PatientSettings['sex']; heightCm: number; vdVt?: number; legacyDeadSpaceMl?: number },\n  tidalVolumeMl: number,\n): { deadSpaceMl: number; vdVt: number; anatomicDeadSpaceMl: number } {\n  const referenceTidalVolumeMl = Math.max(0, tidalVolumeMl)\n  const configuredVdVt = calculateConfiguredVdVtFromValues(patient.vdVt, patient.legacyDeadSpaceMl, referenceTidalVolumeMl)\n  const anatomicDeadSpaceMl = calculateAnatomicDeadSpaceMl(patient)\n  const deadSpaceMl = Math.max(anatomicDeadSpaceMl, referenceTidalVolumeMl * configuredVdVt)\n  const vdVt = referenceTidalVolumeMl > 0 ? deadSpaceMl / referenceTidalVolumeMl : configuredVdVt\n  return { deadSpaceMl, vdVt, anatomicDeadSpaceMl }\n}\n\nexport function calculateConfiguredVdVt(patient: PatientSettings, referenceTidalVolumeMl?: number): number {\n  return calculateConfiguredVdVtFromValues(patient.vdVt, patient.deadSpaceVolume, referenceTidalVolumeMl)\n}\n\nexport function calculateEffectiveDeadSpace(patient: PatientSettings, tidalVolumeMl: number): { deadSpaceMl: number; vdVt: number; anatomicDeadSpaceMl: number } {\n  return calculateEffectiveDeadSpaceFromVdVt(\n    { sex: patient.sex, heightCm: patient.heightCm, vdVt: patient.vdVt, legacyDeadSpaceMl: patient.deadSpaceVolume },\n    tidalVolumeMl,\n  )\n}\n")

# Monitor state exposes VD/VT while retaining a resolved absolute dead-space value for existing consumers.
path = 'src/edumon/types.ts'
replace(path, "  deadSpaceMl: number\n", "  /** Physiological dead-space fraction. Effective dead-space volume follows the current tidal volume, as in LoppjuSIM-MV. */\n  vdVt: number\n  /** Resolved effective dead-space volume. Older payloads may provide this without vdVt. */\n  deadSpaceMl: number\n")
replace(path, "  deadSpaceMl: 150,\n", "  vdVt: 0.4,\n  deadSpaceMl: 150,\n")

# Resolve VD/VT once, centrally, so capnography, volatile-agent kinetics and gas exchange all see the same dynamic dead space.
path = 'src/edumon/respiratoryPhysiology.ts'
replace(path, "import { setActionRuntimeSimulationTime } from '../edusim/actions/ActionRuntime'\n", "import { setActionRuntimeSimulationTime } from '../edusim/actions/ActionRuntime'\nimport { calculateConfiguredVdVtFromValues, calculateEffectiveDeadSpaceFromVdVt } from '../patientMetrics'\n")
replace(path,
"export function resolvedMonitorRespiratorySettings(state: MonitorPatientState): MonitorRespiratorySettings {\n  return {\n    ...DEFAULT_MONITOR_RESPIRATORY_SETTINGS,\n    ...(state.respiratory ?? {}),\n  }\n}\n",
"export function resolvedMonitorRespiratorySettings(state: MonitorPatientState): MonitorRespiratorySettings {\n  const configured = state.respiratory ?? {}\n  const merged = {\n    ...DEFAULT_MONITOR_RESPIRATORY_SETTINGS,\n    ...configured,\n  }\n  const configuredVdVt = calculateConfiguredVdVtFromValues(\n    configured.vdVt,\n    configured.vdVt == null ? configured.deadSpaceMl : undefined,\n    merged.tidalVolumeMl,\n  )\n  const effectiveDeadSpace = calculateEffectiveDeadSpaceFromVdVt(\n    { sex: merged.sex, heightCm: merged.heightCm, vdVt: configuredVdVt },\n    merged.tidalVolumeMl,\n  )\n  return { ...merged, vdVt: configuredVdVt, deadSpaceMl: effectiveDeadSpace.deadSpaceMl }\n}\n")

# Studio control parity with LoppjuSIM-MV.
path = 'src/scenario-builder/modules/edumon/definition.ts'
replace(path,
"  { id: 'deadSpaceMl', label: 'Dead space', group: 'Respiratory', type: 'number', role: 'setting', unit: 'mL', min: 0, max: 500, step: 10, defaultValue: 150, writable: true, snapshotPath: 'patient.respiratory.deadSpaceMl' },\n",
"  { id: 'vdVt', label: 'Vd/Vt', group: 'Respiratory', type: 'number', role: 'setting', min: 0.1, max: 0.9, step: 0.05, defaultValue: 0.4, writable: true, snapshotPath: 'patient.respiratory.vdVt' },\n")

# Legacy scenarios: convert absolute dead space to VD/VT when opened in Studio and preserve Apply state.
path = 'src/scenario-builder/modules/edumon/authoringAdapter.tsx'
replace(path, "import { DEFAULT_MONITOR_STATE } from '../../../edumon/types'\n", "import { DEFAULT_MONITOR_STATE } from '../../../edumon/types'\nimport { calculateConfiguredVdVtFromValues } from '../../../patientMetrics'\n")
replace(path, "type EdumonScenarioProduct = Extract<ScenarioProductId, 'anaesth' | 'icu'>\n", "type EdumonScenarioProduct = Extract<ScenarioProductId, 'anaesth' | 'icu'>\n\nfunction normalizeLegacyDeadSpaceSnapshot(snapshot: EdumonScenarioSnapshot): EdumonScenarioSnapshot {\n  const respiratory = snapshot.patient.respiratory\n  if (!respiratory || respiratory.vdVt != null || respiratory.deadSpaceMl == null) return snapshot\n  const referenceTidalVolumeMl = respiratory.tidalVolumeMl ?? respiratory.spontaneousTidalVolumeMl ?? 500\n  return {\n    ...snapshot,\n    patient: {\n      ...snapshot.patient,\n      respiratory: {\n        ...respiratory,\n        vdVt: calculateConfiguredVdVtFromValues(undefined, respiratory.deadSpaceMl, referenceTidalVolumeMl),\n      },\n    },\n  }\n}\n\nfunction normalizeLegacyAppliedVariableIds(ids: string[] | undefined): string[] | undefined {\n  if (!ids) return ids\n  return [...new Set(ids.map((id) => id === 'deadSpaceMl' ? 'vdVt' : id))]\n}\n")
replace(path, "        snapshot: stage.snapshot,\n        appliedVariableIds: stage.appliedVariableIds ?? [...appliedIds],\n", "        snapshot: normalizeLegacyDeadSpaceSnapshot(stage.snapshot),\n        appliedVariableIds: normalizeLegacyAppliedVariableIds(stage.appliedVariableIds) ?? [...appliedIds],\n")

# Standalone Anaesth/ICU physiology control should also manipulate VD/VT, not a fixed mL dead space.
path = 'src/edumon/EdumonWorkspacePanel.tsx'
replace(path, "    const nextRespiratory = { ...respiratory, ...patch }\n    nextRespiratory.deadSpaceMl = Math.min(nextRespiratory.deadSpaceMl, Math.max(0, nextRespiratory.tidalVolumeMl))\n    onPatientStateChange({ ...patientState, respiratory: nextRespiratory })\n", "    const nextRespiratory = { ...respiratory, ...patch }\n    onPatientStateChange({ ...patientState, respiratory: nextRespiratory })\n")
replace(path, "          <label className=\"edumon-signal-control edumon-signal-capnography\"><span>Dead space <b>{Math.round(respiratory.deadSpaceMl)} mL</b></span><input disabled={patientControlsLocked} type=\"range\" min=\"0\" max={Math.max(0, respiratory.tidalVolumeMl)} step=\"10\" value={respiratory.deadSpaceMl} onChange={(event) => updateRespiratory({ deadSpaceMl: Number(event.target.value) })} /></label>\n", "          <label className=\"edumon-signal-control edumon-signal-capnography\"><span>Vd/Vt <b>{respiratory.vdVt.toFixed(2)}</b></span><input disabled={patientControlsLocked} type=\"range\" min=\"0.1\" max=\"0.9\" step=\"0.05\" value={respiratory.vdVt} onChange={(event) => updateRespiratory({ vdVt: Number(event.target.value) })} /></label>\n")

replace('src/scenario-builder/version.ts', "SCENARIO_BUILDER_VERSION = '0.11.4'", "SCENARIO_BUILDER_VERSION = '0.11.5'")
replace('src/edumon/appVersion.ts', "EDUMON_APP_VERSION = '1.2.7.22'", "EDUMON_APP_VERSION = '1.2.7.23'")
