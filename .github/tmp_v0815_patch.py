from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1):
    p = Path(path)
    text = p.read_text()
    found = text.count(old)
    if found < count:
        raise SystemExit(f'{path}: expected at least {count} occurrences, found {found}: {old[:80]!r}')
    p.write_text(text.replace(old, new, count))

# Patient model: Vd/Vt replaces fixed dead-space volume, retaining the old field only for runtime migration.
replace('src/simulation/types.ts',
"  deadSpaceVolume: number\n",
"  vdVt: number\n  /** Legacy v0.81.4 value retained only so old saved scenarios can be interpreted. */\n  deadSpaceVolume?: number\n")

# Shared dead-space calculations.
p = Path('src/patientMetrics.ts')
text = p.read_text()
text += """

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function calculateAnatomicDeadSpaceMl(patient: Pick<PatientSettings, 'sex' | 'heightCm'>): number {
  return calculatePredictedBodyWeight(patient.sex ?? 'male', patient.heightCm ?? 170) * 2
}

export function calculateConfiguredVdVt(patient: PatientSettings, referenceTidalVolumeMl?: number): number {
  if (Number.isFinite(patient.vdVt)) return clamp(patient.vdVt, 0.05, 0.95)
  const legacyDeadSpace = patient.deadSpaceVolume
  if (legacyDeadSpace != null && Number.isFinite(legacyDeadSpace) && referenceTidalVolumeMl != null && referenceTidalVolumeMl > 0) {
    return clamp(legacyDeadSpace / referenceTidalVolumeMl, 0.05, 0.95)
  }
  return 0.4
}

export function calculateEffectiveDeadSpace(patient: PatientSettings, tidalVolumeMl: number): { deadSpaceMl: number; vdVt: number; anatomicDeadSpaceMl: number } {
  const referenceTidalVolumeMl = Math.max(0, tidalVolumeMl)
  const configuredVdVt = calculateConfiguredVdVt(patient, referenceTidalVolumeMl)
  const anatomicDeadSpaceMl = calculateAnatomicDeadSpaceMl(patient)
  const deadSpaceMl = Math.max(anatomicDeadSpaceMl, referenceTidalVolumeMl * configuredVdVt)
  const vdVt = referenceTidalVolumeMl > 0 ? deadSpaceMl / referenceTidalVolumeMl : configuredVdVt
  return { deadSpaceMl, vdVt, anatomicDeadSpaceMl }
}
"""
p.write_text(text)

# Patient/physio controls and presets.
replace('src/components/Controls.tsx',
"  const normalPhysiology = { sex: 'male' as const, heightCm: 170, oxygenConsumption: 250, frc: normalAdultFrc, maxSpO2: 100, co2Production: 250, deadSpaceVolume: 150 }",
"  const normalPhysiology = { sex: 'male' as const, heightCm: 170, oxygenConsumption: 250, frc: normalAdultFrc, maxSpO2: 100, co2Production: 250, vdVt: 0.4 }")
replace('src/components/Controls.tsx',
"    ARDS: { ...normalPhysiology, shuntFraction: 0.25, compliance: 25, resistance: 8, expiratoryResistance: 10, spontaneousRate: 0, effort: 10, neuralInspiratoryTime: 0.8, effortRisePercent: 20, effortRelaxationPercent: 25, endExpiratoryOesophagealPressure: -5 },",
"    ARDS: { ...normalPhysiology, vdVt: 0.6, shuntFraction: 0.25, compliance: 25, resistance: 8, expiratoryResistance: 10, spontaneousRate: 0, effort: 10, neuralInspiratoryTime: 0.8, effortRisePercent: 20, effortRelaxationPercent: 25, endExpiratoryOesophagealPressure: -5 },")
replace('src/components/Controls.tsx',
"    COPD: { ...normalPhysiology, shuntFraction: 0.05, compliance: 80, resistance: 16, expiratoryResistance: 28, spontaneousRate: 18, effort: 8, neuralInspiratoryTime: 0.9, effortRisePercent: 30, effortRelaxationPercent: 40, endExpiratoryOesophagealPressure: -5 },",
"    COPD: { ...normalPhysiology, vdVt: 0.5, shuntFraction: 0.05, compliance: 80, resistance: 16, expiratoryResistance: 28, spontaneousRate: 18, effort: 8, neuralInspiratoryTime: 0.9, effortRisePercent: 30, effortRelaxationPercent: 40, endExpiratoryOesophagealPressure: -5 },")
replace('src/components/Controls.tsx',
"    Asthma: { ...normalPhysiology, shuntFraction: 0.04, compliance: 70, resistance: 25, expiratoryResistance: 40, spontaneousRate: 24, effort: 11, neuralInspiratoryTime: 0.8, effortRisePercent: 20, effortRelaxationPercent: 30, endExpiratoryOesophagealPressure: -5 },",
"    Asthma: { ...normalPhysiology, vdVt: 0.5, shuntFraction: 0.04, compliance: 70, resistance: 25, expiratoryResistance: 40, spontaneousRate: 24, effort: 11, neuralInspiratoryTime: 0.8, effortRisePercent: 20, effortRelaxationPercent: 30, endExpiratoryOesophagealPressure: -5 },")
replace('src/components/Controls.tsx',
"    Paed: { sex: 'male', heightCm: 110, oxygenConsumption: 120, frc: 500, shuntFraction: 0.03, maxSpO2: 100, co2Production: 100, deadSpaceVolume: 40, compliance: 20, resistance: 8, expiratoryResistance: 10, spontaneousRate: 22, effort: 5, neuralInspiratoryTime: 0.7, effortRisePercent: 40, effortRelaxationPercent: 40, endExpiratoryOesophagealPressure: -4 },",
"    Paed: { sex: 'male', heightCm: 110, oxygenConsumption: 120, frc: 500, shuntFraction: 0.03, maxSpO2: 100, co2Production: 100, vdVt: 0.4, compliance: 20, resistance: 8, expiratoryResistance: 10, spontaneousRate: 22, effort: 5, neuralInspiratoryTime: 0.7, effortRisePercent: 40, effortRelaxationPercent: 40, endExpiratoryOesophagealPressure: -4 },")
replace('src/components/Controls.tsx',
"      <Slider label=\"Dead space volume\" value={settings.deadSpaceVolume ?? 150} unit=\" mL\" min={20} max={400} step={5} onChange={(v) => patch({ deadSpaceVolume: v })} />",
"      <Slider label=\"Vd/Vt\" value={Number((settings.vdVt ?? 0.4).toFixed(2))} unit=\"\" min={0.1} max={0.9} step={0.05} displayValue={(settings.vdVt ?? 0.4).toFixed(2)} onChange={(v) => patch({ vdVt: v })} />")

# App defaults, interpolation, session normalization, reset and diagnostics.
replace('src/App.tsx',
"  compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1, effortRisePercent: 50, effortRelaxationPercent: 50, endExpiratoryOesophagealPressure: -5, co2Production: 250, deadSpaceVolume: 150,",
"  compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1, effortRisePercent: 50, effortRelaxationPercent: 50, endExpiratoryOesophagealPressure: -5, co2Production: 250, vdVt: 0.4,")
replace('src/App.tsx',
"    deadSpaceVolume: lerp(from.deadSpaceVolume, to.deadSpaceVolume),",
"    vdVt: lerp(from.vdVt ?? 0.4, to.vdVt ?? 0.4),")
replace('src/App.tsx',
"    setPatient,\n    setVentilator,",
"    setPatient: (next) => setPatient({ ...initialPatient, ...next, vdVt: next.vdVt ?? 0.4 }),\n    setVentilator,")
replace('src/App.tsx',
"    setPatient({ ...scenario.patient })",
"    setPatient({ ...initialPatient, ...scenario.patient, vdVt: scenario.patient.vdVt ?? 0.4 })")
replace('src/App.tsx',
"        patient: scenario.patient,",
"        patient: { ...initialPatient, ...scenario.patient, vdVt: scenario.patient.vdVt ?? 0.4 },")
replace('src/App.tsx',
"    deadSpaceVolume: initialPatient.deadSpaceVolume,",
"    vdVt: initialPatient.vdVt,")
replace('src/App.tsx',
"        deadSpaceVolumeMl: physiologyMeasurements.deadSpaceVolume,",
"        totalDeadSpaceVolumeMl: physiologyMeasurements.totalDeadSpaceVolume,\n        vdVt: physiologyMeasurements.vdVt,")

# Core simulation uses Vd/Vt-derived total dead space with a 2 mL/kg PBW floor.
replace('src/simulation/engine.ts',
"import type { Measurements, PatientSettings, Sample, VentilatorMode, VentilatorSettings } from './types'\n",
"import type { Measurements, PatientSettings, Sample, VentilatorMode, VentilatorSettings } from './types'\nimport { calculateEffectiveDeadSpace } from '../patientMetrics'\n")
replace('src/simulation/engine.ts',
"  const deadSpaceL = Math.max(patient.deadSpaceVolume ?? 150, 0) / 1000\n  const alveolarVolumeL = Math.max(0, tidalVolumeL - deadSpaceL)",
"  const deadSpaceL = calculateEffectiveDeadSpace(patient, tidalVolumeL * 1000).deadSpaceMl / 1000\n  const alveolarVolumeL = Math.max(0, tidalVolumeL - deadSpaceL)", 2)
replace('src/simulation/engine.ts',
"  const deadSpaceDelay = 0.03 + Math.max(patient.deadSpaceVolume ?? 150, 0) / 5000 + 0.05 * obstruction",
"  const deadSpaceDelay = 0.03 + deadSpaceVolumeMl / 5000 + 0.05 * obstruction")
replace('src/simulation/engine.ts',
"  etco2: number,\n): number {",
"  etco2: number,\n  deadSpaceVolumeMl: number,\n): number {")
replace('src/simulation/engine.ts',
"  dt: number,\n): number {\n  const activeExpiratoryFlow = expiratory && flowLmin < -0.5",
"  dt: number,\n  deadSpaceVolumeMl: number,\n): number {\n  const activeExpiratoryFlow = expiratory && flowLmin < -0.5")
replace('src/simulation/engine.ts',
"    ? capnogramSourceValue(true, elapsedExpiration, patient, complianceL, state.alveolarCo2)",
"    ? capnogramSourceValue(true, elapsedExpiration, patient, complianceL, state.alveolarCo2, deadSpaceVolumeMl)")
replace('src/simulation/engine.ts',
"  const flowLmin = flowLs * 60\n  const airwayCo2 = updateAirwayCo2(",
"  const flowLmin = flowLs * 60\n  const deadSpaceReferenceVtMl = Math.max(state.lastExpiredTidalVolume * 1000, ventilator.tidalVolume, 1)\n  const totalDeadSpaceVolumeMl = calculateEffectiveDeadSpace(patient, deadSpaceReferenceVtMl).deadSpaceMl\n  const airwayCo2 = updateAirwayCo2(")
replace('src/simulation/engine.ts',
"    t,\n    dt,\n  )",
"    t,\n    dt,\n    totalDeadSpaceVolumeMl,\n  )", 1)

# Measurements expose total dead space and effective Vd/Vt.
replace('src/physiologyMeasurements.ts',
"import type { PatientSettings, Sample, VentilatorSettings } from './simulation/types'\n",
"import type { PatientSettings, Sample, VentilatorSettings } from './simulation/types'\nimport { calculateEffectiveDeadSpace } from './patientMetrics'\n")
replace('src/physiologyMeasurements.ts',
"  deadSpaceVolume: number\n",
"  totalDeadSpaceVolume: number\n  vdVt: number\n")
replace('src/physiologyMeasurements.ts',
"  const deadSpaceVolume = Math.max(0, patient.deadSpaceVolume ?? 150)\n  const alveolarTidalVolume = monitor.expiredTidalVolume == null ? null : Math.max(0, monitor.expiredTidalVolume - deadSpaceVolume)\n  const alveolarMinuteVentilation = Math.max(0, rates.minuteVentilation - (deadSpaceVolume / 1000) * rates.totalRate)",
"  const deadSpaceReferenceVt = monitor.expiredTidalVolume ?? ventilator.tidalVolume\n  const effectiveDeadSpace = calculateEffectiveDeadSpace(patient, deadSpaceReferenceVt)\n  const totalDeadSpaceVolume = effectiveDeadSpace.deadSpaceMl\n  const alveolarTidalVolume = monitor.expiredTidalVolume == null ? null : Math.max(0, monitor.expiredTidalVolume - totalDeadSpaceVolume)\n  const alveolarMinuteVentilation = Math.max(0, rates.minuteVentilation - (totalDeadSpaceVolume / 1000) * rates.totalRate)")
replace('src/physiologyMeasurements.ts',
"    deadSpaceVolume,\n",
"    totalDeadSpaceVolume,\n    vdVt: effectiveDeadSpace.vdVt,\n")

# EXTRA tab: show both Vd/Vt and total calculated dead space.
replace('src/components/PhysiologyMeasurementsDialog.tsx',
"                <MonitorMetric value={measurements.deadSpaceVolume} label=\"Dead space\" unit=\"mL\" digits={0} />",
"                <MonitorMetric value={measurements.vdVt} label=\"Vd/Vt\" unit=\"\" digits={2} />\n                <MonitorMetric value={measurements.totalDeadSpaceVolume} label=\"Total dead space\" unit=\"mL\" digits={0} />")

# Version bump.
replace('src/appVersion.ts', "export const APP_VERSION = '0.81.4'", "export const APP_VERSION = '0.81.5'")

print('Applied v0.81.5 Vd/Vt physiology model')
