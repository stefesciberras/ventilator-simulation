from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1):
    p = Path(path)
    text = p.read_text()
    found = text.count(old)
    if found < count:
        raise SystemExit(f'{path}: expected at least {count} occurrence(s), found {found}: {old[:120]!r}')
    p.write_text(text.replace(old, new, count))

# Physiology measurements: derive current intrinsic/total PEEP from trapped end-expiratory
# volume, and make displayed alveolar ventilation use the same expiratory emptying
# limitation as the simulation gas-exchange model.
p = Path('src/physiologyMeasurements.ts')
text = p.read_text()

text = text.replace(
"const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null\n",
"const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null\nconst clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))\n",
1,
)

marker = "function latestCompletedInspiratoryVolume(samples: Sample[]) {\n"
helper = """function latestEndExpiratoryVolume(samples: Sample[]): number | null {
  let latest: number | null = null
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    if (previous.phase === 'expiration' && current.phase === 'inspiration') {
      latest = Math.max(0, previous.volume)
    }
  }
  return latest
}

"""
if marker not in text:
    raise SystemExit('latestCompletedInspiratoryVolume marker not found')
text = text.replace(marker, helper + marker, 1)

text = text.replace(
"function waveformMonitorValues(samples: Sample[], ventilator: VentilatorSettings) {",
"function waveformMonitorValues(samples: Sample[], ventilator: VentilatorSettings, patient: PatientSettings) {",
1,
)

old = """  const measuredPeep = median(passiveEndExpiration.map((sample) => sample.pressure))
  const plateauPressure = median(recent
"""
new = """  const endExpiratoryVolume = latestEndExpiratoryVolume(recent)
  // state.volume is volume above the relaxed volume at set PEEP. Any residual
  // volume carried into the next inspiration therefore represents dynamic
  // hyperinflation. Converting that volume through compliance gives intrinsic
  // PEEP continuously, without depending on a potentially stale prior hold.
  const autoPeep = endExpiratoryVolume == null
    ? null
    : Math.max(0, endExpiratoryVolume / Math.max(patient.compliance, 1))
  const totalPeep = autoPeep == null ? ventilator.peep : ventilator.peep + autoPeep
  const plateauPressure = median(recent
"""
if old not in text:
    raise SystemExit('measuredPeep block not found')
text = text.replace(old, new, 1)

old = """  const endTidalCO2 = measuredEndTidalCO2(samples)
  const pesValues = recent.map((sample) => sample.oesophagealPressure)
"""
new = """  const endTidalCO2 = measuredEndTidalCO2(samples)
  const expiredTidalVolume = latestCompletedExpiredVolume(recent)
  const pesValues = recent.map((sample) => sample.oesophagealPressure)
"""
if old not in text:
    raise SystemExit('endTidalCO2 block not found')
text = text.replace(old, new, 1)

old = """    plateauPressure,
    drivingPressure: plateauPressure != null && measuredPeep != null ? plateauPressure - measuredPeep : null,
    meanPressure: mean(recent.map((sample) => sample.pressure)),
    measuredPeep,
    autoPeep: measuredPeep == null ? null : Math.max(0, measuredPeep - ventilator.peep),
    inspiratoryFlow: positiveFlows.length ? Math.max(...positiveFlows) : null,
    expiratoryFlow: negativeFlows.length ? Math.max(...negativeFlows) : null,
    inspiredTidalVolume: latestCompletedInspiratoryVolume(recent),
    expiredTidalVolume: latestCompletedExpiredVolume(recent),
"""
new = """    plateauPressure,
    // Prefer an actual zero-flow plateau when available. Pressure-controlled
    // breaths often have no plateau, so fall back to the elastic VT/C term.
    // In both cases driving pressure is referenced to current total PEEP.
    drivingPressure: plateauPressure != null
      ? plateauPressure - totalPeep
      : expiredTidalVolume != null
        ? expiredTidalVolume / Math.max(patient.compliance, 1)
        : null,
    meanPressure: mean(recent.map((sample) => sample.pressure)),
    measuredPeep: totalPeep,
    autoPeep,
    inspiratoryFlow: positiveFlows.length ? Math.max(...positiveFlows) : null,
    expiratoryFlow: negativeFlows.length ? Math.max(...negativeFlows) : null,
    inspiredTidalVolume: latestCompletedInspiratoryVolume(recent),
    expiredTidalVolume,
"""
if old not in text:
    raise SystemExit('waveform monitor return block not found')
text = text.replace(old, new, 1)

text = text.replace(
"    transpulmonaryExpiratory: measuredPeep != null && endExpPes != null ? measuredPeep - endExpPes : null,\n",
"    transpulmonaryExpiratory: endExpPes != null ? totalPeep - endExpPes : null,\n",
1,
)

text = text.replace(
"  const monitor = waveformMonitorValues(window, ventilator)\n",
"  const monitor = waveformMonitorValues(window, ventilator, patient)\n",
1,
)

old = """  const totalDeadSpaceVolume = effectiveDeadSpace.deadSpaceMl
  const alveolarTidalVolume = monitor.expiredTidalVolume == null ? null : Math.max(0, monitor.expiredTidalVolume - totalDeadSpaceVolume)
  const alveolarMinuteVentilation = Math.max(0, rates.minuteVentilation - (totalDeadSpaceVolume / 1000) * rates.totalRate)

  return {
"""
new = """  const totalDeadSpaceVolume = effectiveDeadSpace.deadSpaceMl
  const alveolarTidalVolume = monitor.expiredTidalVolume == null ? null : Math.max(0, monitor.expiredTidalVolume - totalDeadSpaceVolume)

  // Match the simulation engine's gas-exchange model: only the fraction of the
  // alveolar tidal volume that can empty during Te contributes to effective
  // alveolar ventilation. This makes dynamic hyperinflation visible in EXTRA.
  const modelExpiratoryTimeConstant = Math.max(patient.expiratoryResistance * patient.compliance / 1000, 0.05)
  const measuredExpiratoryTime = timing.expiratoryTime
  const expiratoryEmptyingFraction = measuredExpiratoryTime == null
    ? 1
    : clamp(1 - Math.exp(-measuredExpiratoryTime / modelExpiratoryTimeConstant), 0.03, 1)
  const alveolarMinuteVentilation = alveolarTidalVolume == null
    ? 0
    : Math.max(0, (alveolarTidalVolume / 1000) * rates.totalRate * expiratoryEmptyingFraction)

  return {
"""
if old not in text:
    raise SystemExit('alveolar ventilation block not found')
text = text.replace(old, new, 1)

p.write_text(text)

# Diagnostics must report the same live total/auto PEEP and driving pressure as the
# measurements popup, rather than calculateMeasurements' last-expiratory-hold value.
p = Path('src/App.tsx')
text = p.read_text()
old = """        measuredIERatio,
        totalPeepCmH2O: measures.totalPeep,
        autoPeepCmH2O: measures.autoPeep,
        alveolarTidalVolumeMl: physiologyMeasurements.alveolarTidalVolume,
        alveolarMinuteVentilationLMin: physiologyMeasurements.alveolarMinuteVentilation,
"""
new = """        measuredIERatio,
        totalPeepCmH2O: physiologyMeasurements.measuredPeep,
        autoPeepCmH2O: physiologyMeasurements.autoPeep,
        drivingPressureCmH2O: physiologyMeasurements.drivingPressure,
        alveolarTidalVolumeMl: physiologyMeasurements.alveolarTidalVolume,
        alveolarMinuteVentilationLMin: physiologyMeasurements.alveolarMinuteVentilation,
"""
if old not in text:
    raise SystemExit('App diagnostics PEEP block not found')
text = text.replace(old, new, 1)
p.write_text(text)

# Make the monitor label explicit: this value now represents current total PEEP.
replace(
    'src/components/PhysiologyMeasurementsDialog.tsx',
    '<MonitorMetric value={measurements.measuredPeep} label="PEEP/CPAP" unit="cmH₂O" digits={1} />',
    '<MonitorMetric value={measurements.measuredPeep} label="Total PEEP" unit="cmH₂O" digits={1} />',
)

# Version bump.
replace('src/appVersion.ts', "export const APP_VERSION = '0.81.5'", "export const APP_VERSION = '0.81.6'")

print('Applied v0.81.6 live PEEP and alveolar ventilation measurement fixes')
