from pathlib import Path


def must_replace(text: str, old: str, new: str, label: str, count: int = 1) -> str:
    found = text.count(old)
    if found < count:
        raise SystemExit(f'{label}: expected at least {count}, found {found}')
    return text.replace(old, new, count)

# Vent settings: rate ceiling 40 and linked Tinsp control.
path = Path('src/components/Controls.tsx')
text = path.read_text()
text = must_replace(
    text,
    "  const currentIeRatio = ieRatioFrom(settings)\n",
    "  const currentIeRatio = ieRatioFrom(settings)\n  const minimumInspiratoryTime = cycleTime(settings.rate) / (1 + MAX_IE)\n  const maximumInspiratoryTime = cycleTime(settings.rate) / (1 + MIN_IE)\n",
    'timing bounds',
)
text = must_replace(
    text,
    "  const setTidalVolume = (tidalVolume: number) => {\n",
    "  const setInspiratoryTime = (requestedTime: number) => {\n    const inspiratoryTime = clamp(requestedTime, minimumInspiratoryTime, maximumInspiratoryTime)\n    const next: VentilatorSettings = { ...settings, inspiratoryTime }\n    if (isVolumeMandatoryMode(settings.mode)) next.inspiratoryFlow = flowFor(next.tidalVolume, inspiratoryTime, next.plateauPercent ?? 0)\n    onChange(next)\n  }\n\n  const setTidalVolume = (tidalVolume: number) => {\n",
    'Tinsp setter',
)
text = must_replace(text, 'min={5} max={35} onChange={setRate}', 'min={5} max={40} onChange={setRate}', 'rate max', 2)
text = must_replace(
    text,
    "          <Slider label=\"I:E ratio\" value={Number(currentIeRatio.toFixed(1))} unit=\"\" min={MIN_IE} max={MAX_IE} step={0.1} displayValue={`1:${currentIeRatio.toFixed(1)}`} onChange={setIeRatio} />\n          {triggerControls}\n",
    "          <Slider label=\"I:E ratio\" value={Number(currentIeRatio.toFixed(1))} unit=\"\" min={MIN_IE} max={MAX_IE} step={0.1} displayValue={`1:${currentIeRatio.toFixed(1)}`} onChange={setIeRatio} />\n          <Slider label=\"Tinsp\" value={Number(settings.inspiratoryTime.toFixed(2))} unit=\" s\" min={Number(minimumInspiratoryTime.toFixed(2))} max={Number(maximumInspiratoryTime.toFixed(2))} step={0.05} onChange={setInspiratoryTime} />\n          {triggerControls}\n",
    'BIPAP Tinsp',
)
text = must_replace(
    text,
    "          {hasConventionalMandatoryTiming(settings.mode) && (\n            <Slider label=\"I:E ratio\" value={Number(currentIeRatio.toFixed(1))} unit=\"\" min={MIN_IE} max={MAX_IE} step={0.1} displayValue={`1:${currentIeRatio.toFixed(1)}`} onChange={setIeRatio} />\n          )}\n",
    "          {hasConventionalMandatoryTiming(settings.mode) && (\n            <>\n              <Slider label=\"I:E ratio\" value={Number(currentIeRatio.toFixed(1))} unit=\"\" min={MIN_IE} max={MAX_IE} step={0.1} displayValue={`1:${currentIeRatio.toFixed(1)}`} onChange={setIeRatio} />\n              <Slider label=\"Tinsp\" value={Number(settings.inspiratoryTime.toFixed(2))} unit=\" s\" min={Number(minimumInspiratoryTime.toFixed(2))} max={Number(maximumInspiratoryTime.toFixed(2))} step={0.05} onChange={setInspiratoryTime} />\n            </>\n          )}\n",
    'conventional Tinsp',
)
path.write_text(text)

# Ventilator display controls: rate ceiling only; deliberately no Tinsp control here.
path = Path('src/components/InteractiveVentilatorStrip.tsx')
text = path.read_text()
text = must_replace(text, "unit: '/min', min: 5, max: 35, step: 1", "unit: '/min', min: 5, max: 40, step: 1", 'display rate max', 2)
path.write_text(text)

# Measurements model: expose clinically conventional alveolar VT and VA from measured VTE, rate and configured anatomical dead space.
path = Path('src/physiologyMeasurements.ts')
text = path.read_text()
text = must_replace(text, "import type { Sample, VentilatorSettings } from './simulation/types'", "import type { PatientSettings, Sample, VentilatorSettings } from './simulation/types'", 'patient type import')
text = must_replace(
    text,
    "  expiredTidalVolume: number | null\n  endTidalCO2: number | null\n",
    "  expiredTidalVolume: number | null\n  alveolarTidalVolume: number | null\n  alveolarMinuteVentilation: number\n  deadSpaceVolume: number\n  endTidalCO2: number | null\n",
    'extra measurement interface',
)
text = must_replace(
    text,
    "export function calculatePhysiologicalMeasurements(samples: Sample[], ventilator: VentilatorSettings): PhysiologicalMeasurements {",
    "export function calculatePhysiologicalMeasurements(samples: Sample[], ventilator: VentilatorSettings, patient: PatientSettings): PhysiologicalMeasurements {",
    'measurement signature',
)
text = must_replace(
    text,
    "  const setMinuteVentilation = volumeTargeted && setRate != null ? ventilator.tidalVolume * setRate / 1000 : null\n\n  return {\n",
    "  const setMinuteVentilation = volumeTargeted && setRate != null ? ventilator.tidalVolume * setRate / 1000 : null\n  const deadSpaceVolume = Math.max(0, patient.deadSpaceVolume ?? 150)\n  const alveolarTidalVolume = monitor.expiredTidalVolume == null ? null : Math.max(0, monitor.expiredTidalVolume - deadSpaceVolume)\n  const alveolarMinuteVentilation = Math.max(0, rates.minuteVentilation - (deadSpaceVolume / 1000) * rates.totalRate)\n\n  return {\n",
    'extra measurement calculations',
)
text = must_replace(
    text,
    "    expiredTidalVolume: monitor.expiredTidalVolume,\n    endTidalCO2: monitor.endTidalCO2,\n",
    "    expiredTidalVolume: monitor.expiredTidalVolume,\n    alveolarTidalVolume,\n    alveolarMinuteVentilation,\n    deadSpaceVolume,\n    endTidalCO2: monitor.endTidalCO2,\n",
    'extra measurement return',
)
path.write_text(text)

# App: supply current patient settings to measurements and include the new values in simulation diagnostics.
path = Path('src/App.tsx')
text = path.read_text()
text = must_replace(
    text,
    "  const physiologyMeasurements = useMemo(() => calculatePhysiologicalMeasurements(measurementSamples, effectiveVentilator), [measurementSamples, effectiveVentilator])",
    "  const physiologyMeasurements = useMemo(() => calculatePhysiologicalMeasurements(measurementSamples, effectiveVentilator, effectivePatientRef.current), [measurementSamples, effectiveVentilator, patient])",
    'measurement call',
)
text = must_replace(
    text,
    "        autoPeepCmH2O: measures.autoPeep,\n",
    "        autoPeepCmH2O: measures.autoPeep,\n        alveolarTidalVolumeMl: physiologyMeasurements.alveolarTidalVolume,\n        alveolarMinuteVentilationLMin: physiologyMeasurements.alveolarMinuteVentilation,\n        deadSpaceVolumeMl: physiologyMeasurements.deadSpaceVolume,\n",
    'diagnostic extras',
)
path.write_text(text)

# Popup: add EXTRA tab and metrics.
path = Path('src/components/PhysiologyMeasurementsDialog.tsx')
text = path.read_text()
text = must_replace(text, "type MonitorTab = 'general' | 'spo2' | 'co2' | 'oesophageal'", "type MonitorTab = 'general' | 'spo2' | 'co2' | 'extra' | 'oesophageal'", 'extra tab type')
text = must_replace(
    text,
    "          <button className={tab === 'co2' ? 'active' : ''} type=\"button\" onClick={() => setTab('co2')}>CO₂</button>\n          <button className={tab === 'oesophageal' ? 'active' : ''}",
    "          <button className={tab === 'co2' ? 'active' : ''} type=\"button\" onClick={() => setTab('co2')}>CO₂</button>\n          <button className={tab === 'extra' ? 'active' : ''} type=\"button\" onClick={() => setTab('extra')}>Extra</button>\n          <button className={tab === 'oesophageal' ? 'active' : ''}",
    'extra tab button',
)
text = must_replace(
    text,
    "          {tab === 'oesophageal' && oesophagealEnabled && (\n",
    "          {tab === 'extra' && (\n            <div className=\"monitor-grid monitor-grid-sparse\">\n              <div className=\"monitor-column\">\n                <MonitorMetric value={measurements.alveolarTidalVolume} label=\"Alveolar VT\" unit=\"mL\" digits={0} />\n                <MonitorMetric value={measurements.alveolarMinuteVentilation} label=\"Alveolar MinVol\" unit=\"L/min\" digits={2} />\n                <MonitorMetric value={measurements.deadSpaceVolume} label=\"Dead space\" unit=\"mL\" digits={0} />\n              </div>\n            </div>\n          )}\n\n          {tab === 'oesophageal' && oesophagealEnabled && (\n",
    'extra panel',
)
path.write_text(text)

# Five popup columns including close button + four tabs.
path = Path('src/physiology.css')
text = path.read_text()
text = must_replace(text, 'grid-template-columns: 82px repeat(3, minmax(0, 1fr));', 'grid-template-columns: 82px repeat(4, minmax(0, 1fr));', 'desktop measurement tabs')
text = must_replace(text, 'grid-template-columns: 58px repeat(3, minmax(0, 1fr));', 'grid-template-columns: 58px repeat(4, minmax(0, 1fr));', 'tablet measurement tabs')
text = must_replace(text, 'grid-template-columns: 48px repeat(3, minmax(0, 1fr));', 'grid-template-columns: 48px repeat(4, minmax(0, 1fr));', 'mobile measurement tabs')
path.write_text(text)

print('Applied v0.81.4 ventilator timing and EXTRA measurements changes')
