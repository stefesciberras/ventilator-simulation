from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Expected text not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, count))

path = 'src/patientMetrics.ts'
replace(path,
"export function calculateConfiguredVdVt(patient: PatientSettings, referenceTidalVolumeMl?: number): number {\n  if (Number.isFinite(patient.vdVt)) return clamp(patient.vdVt, 0.05, 0.95)\n  const legacyDeadSpace = patient.deadSpaceVolume\n  if (legacyDeadSpace != null && Number.isFinite(legacyDeadSpace) && referenceTidalVolumeMl != null && referenceTidalVolumeMl > 0) {\n    return clamp(legacyDeadSpace / referenceTidalVolumeMl, 0.05, 0.95)\n  }\n  return 0.4\n}\n\nexport function calculateEffectiveDeadSpace(patient: PatientSettings, tidalVolumeMl: number): { deadSpaceMl: number; vdVt: number; anatomicDeadSpaceMl: number } {\n  const referenceTidalVolumeMl = Math.max(0, tidalVolumeMl)\n  const configuredVdVt = calculateConfiguredVdVt(patient, referenceTidalVolumeMl)\n  const anatomicDeadSpaceMl = calculateAnatomicDeadSpaceMl(patient)\n  const deadSpaceMl = Math.max(anatomicDeadSpaceMl, referenceTidalVolumeMl * configuredVdVt)\n  const vdVt = referenceTidalVolumeMl > 0 ? deadSpaceMl / referenceTidalVolumeMl : configuredVdVt\n  return { deadSpaceMl, vdVt, anatomicDeadSpaceMl }\n}\n",
"export function calculateConfiguredVdVtFromValues(vdVt: number | undefined, legacyDeadSpaceMl: number | undefined, referenceTidalVolumeMl?: number): number {\n  if (vdVt != null && Number.isFinite(vdVt)) return clamp(vdVt, 0.05, 0.95)\n  if (legacyDeadSpaceMl != null && Number.isFinite(legacyDeadSpaceMl) && referenceTidalVolumeMl != null && referenceTidalVolumeMl > 0) {\n    return clamp(legacyDeadSpaceMl / referenceTidalVolumeMl, 0.05, 0.95)\n  }\n  return 0.4\n}\n\nexport function calculateEffectiveDeadSpaceFromVdVt(\n  patient: { sex: PatientSettings['sex']; heightCm: number; vdVt?: number; legacyDeadSpaceMl?: number },\n  tidalVolumeMl: number,\n): { deadSpaceMl: number; vdVt: number; anatomicDeadSpaceMl: number } {\n  const referenceTidalVolumeMl = Math.max(0, tidalVolumeMl)\n  const configuredVdVt = calculateConfiguredVdVtFromValues(patient.vdVt, patient.legacyDeadSpaceMl, referenceTidalVolumeMl)\n  const anatomicDeadSpaceMl = calculateAnatomicDeadSpaceMl(patient)\n  const deadSpaceMl = Math.max(anatomicDeadSpaceMl, referenceTidalVolumeMl * configuredVdVt)\n  const vdVt = referenceTidalVolumeMl > 0 ? deadSpaceMl / referenceTidalVolumeMl : configuredVdVt\n  return { deadSpaceMl, vdVt, anatomicDeadSpaceMl }\n}\n\nexport function calculateConfiguredVdVt(patient: PatientSettings, referenceTidalVolumeMl?: number): number {\n  return calculateConfiguredVdVtFromValues(patient.vdVt, patient.deadSpaceVolume, referenceTidalVolumeMl)\n}\n\nexport function calculateEffectiveDeadSpace(patient: PatientSettings, tidalVolumeMl: number): { deadSpaceMl: number; vdVt: number; anatomicDeadSpaceMl: number } {\n  return calculateEffectiveDeadSpaceFromVdVt(\n    { sex: patient.sex, heightCm: patient.heightCm, vdVt: patient.vdVt, legacyDeadSpaceMl: patient.deadSpaceVolume },\n    tidalVolumeMl,\n  )\n}\n")

path = 'src/edumon/types.ts'
replace(path, "  deadSpaceMl: number\n", "  /** Physiological dead-space fraction. Effective dead-space volume follows the current tidal volume, as in LoppjuSIM-MV. */\n  vdVt: number\n  /** Legacy absolute dead-space value retained for older scenarios/session payloads. */\n  deadSpaceMl?: number\n")
replace(path, "  deadSpaceMl: 150,\n", "  vdVt: 0.4,\n")

path = 'src/edumon/respiratoryPhysiology.ts'
replace(path, "import { setActionRuntimeSimulationTime } from '../edusim/actions/ActionRuntime'\n", "import { setActionRuntimeSimulationTime } from '../edusim/actions/ActionRuntime'\nimport { calculateEffectiveDeadSpaceFromVdVt } from '../patientMetrics'\n")
replace(path,
"  const respiratory = resolvedMonitorRespiratorySettings(effectiveState)\n  return {\n",
"  const respiratory = resolvedMonitorRespiratorySettings(effectiveState)\n  const configuredVdVt = effectiveState.respiratory?.vdVt\n  const legacyDeadSpaceMl = configuredVdVt == null ? effectiveState.respiratory?.deadSpaceMl : undefined\n  const effectiveDeadSpace = calculateEffectiveDeadSpaceFromVdVt(\n    { sex: respiratory.sex, heightCm: respiratory.heightCm, vdVt: configuredVdVt ?? respiratory.vdVt, legacyDeadSpaceMl },\n    respiratory.tidalVolumeMl,\n  )\n  return {\n")
replace(path, "    deadSpaceMl: respiratory.deadSpaceMl,\n", "    deadSpaceMl: effectiveDeadSpace.deadSpaceMl,\n")

path = 'src/scenario-builder/modules/edumon/definition.ts'
replace(path,
"  { id: 'deadSpaceMl', label: 'Dead space', group: 'Respiratory', type: 'number', role: 'setting', unit: 'mL', min: 0, max: 500, step: 10, defaultValue: 150, writable: true, snapshotPath: 'patient.respiratory.deadSpaceMl' },\n",
"  { id: 'vdVt', label: 'Vd/Vt', group: 'Respiratory', type: 'number', role: 'setting', min: 0.1, max: 0.9, step: 0.05, defaultValue: 0.4, writable: true, snapshotPath: 'patient.respiratory.vdVt' },\n")

path = 'src/scenario-builder/modules/edumon/authoringAdapter.tsx'
replace(path, "import { DEFAULT_MONITOR_STATE } from '../../../edumon/types'\n", "import { DEFAULT_MONITOR_STATE } from '../../../edumon/types'\nimport { calculateConfiguredVdVtFromValues } from '../../../patientMetrics'\n")
replace(path, "type EdumonScenarioProduct = Extract<ScenarioProductId, 'anaesth' | 'icu'>\n", "type EdumonScenarioProduct = Extract<ScenarioProductId, 'anaesth' | 'icu'>\n\nfunction normalizeLegacyDeadSpaceSnapshot(snapshot: EdumonScenarioSnapshot): EdumonScenarioSnapshot {\n  const respiratory = snapshot.patient.respiratory\n  if (!respiratory || respiratory.vdVt != null || respiratory.deadSpaceMl == null) return snapshot\n  const referenceTidalVolumeMl = respiratory.tidalVolumeMl ?? respiratory.spontaneousTidalVolumeMl ?? 500\n  return {\n    ...snapshot,\n    patient: {\n      ...snapshot.patient,\n      respiratory: {\n        ...respiratory,\n        vdVt: calculateConfiguredVdVtFromValues(undefined, respiratory.deadSpaceMl, referenceTidalVolumeMl),\n      },\n    },\n  }\n}\n\nfunction normalizeLegacyAppliedVariableIds(ids: string[] | undefined): string[] | undefined {\n  if (!ids) return ids\n  return [...new Set(ids.map((id) => id === 'deadSpaceMl' ? 'vdVt' : id))]\n}\n")
replace(path, "        snapshot: stage.snapshot,\n        appliedVariableIds: stage.appliedVariableIds ?? [...appliedIds],\n", "        snapshot: normalizeLegacyDeadSpaceSnapshot(stage.snapshot),\n        appliedVariableIds: normalizeLegacyAppliedVariableIds(stage.appliedVariableIds) ?? [...appliedIds],\n")

replace('src/scenario-builder/version.ts', "SCENARIO_BUILDER_VERSION = '0.11.4'", "SCENARIO_BUILDER_VERSION = '0.11.5'")
replace('src/edumon/appVersion.ts', "EDUMON_APP_VERSION = '1.2.7.22'", "EDUMON_APP_VERSION = '1.2.7.23'")
