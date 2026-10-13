from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:120]!r}')
    text = text.replace(old, new, 1)
    p.write_text(text)

# --- Stateful buffered CO2 + airway sensor washout ---
engine = Path('src/simulation/engine.ts')
text = engine.read_text()
text = text.replace(
"""  alveolarCo2: number\n  alveolarOxygenFraction: number\n  spo2: number\n""",
"""  alveolarCo2: number\n  airwayCo2: number\n  lastExpiratoryFlowTime: number\n  alveolarOxygenFraction: number\n  spo2: number\n""",
1,
)
text = text.replace(
"""    alveolarCo2: 40,\n    alveolarOxygenFraction: 0.16,\n    spo2: 98,\n""",
"""    alveolarCo2: 40,\n    airwayCo2: 0,\n    lastExpiratoryFlowTime: -100,\n    alveolarOxygenFraction: 0.16,\n    spo2: 98,\n""",
1,
)
old_co2 = """function co2TargetFromVentilation(alveolarVentilationLmin: number, patient: PatientSettings): number {\n  const vco2 = Math.max(patient.co2Production ?? 250, 0)\n  if (alveolarVentilationLmin <= 0.05) return 150\n  return clamp(0.863 * vco2 / alveolarVentilationLmin, 10, 150)\n}\n\nfunction updateAlveolarCo2(\n  state: SimulationState,\n  ventilator: VentilatorSettings,\n  patient: PatientSettings,\n  t: number,\n  dt: number,\n  complianceL: number,\n) {\n  const alveolarVentilation = calculateEffectiveAlveolarVentilation(state, ventilator, patient, t, complianceL)\n  const vco2 = Math.max(patient.co2Production ?? 250, 0)\n\n  if (alveolarVentilation <= 0.05) {\n    // With no ventilation, metabolic CO2 continues to accumulate. The effective\n    // CO2 distribution volume is scaled to PBW so a typical adult at VCO2 250\n    // mL/min rises about 5-6 mmHg/min; changing VCO2 changes that slope directly.\n    const heightCm = patient.heightCm ?? 170\n    const pbw = Math.max(20, (patient.sex === 'female' ? 45.5 : 50) + 0.91 * (heightCm - 152.4))\n    const co2DistributionVolumeL = Math.max(15, pbw * 0.6)\n    const riseMmHgPerMinute = 0.863 * vco2 / co2DistributionVolumeL\n    state.alveolarCo2 = clamp(state.alveolarCo2 + (riseMmHgPerMinute / 60) * dt, 0, 150)\n    return\n  }\n\n  const target = co2TargetFromVentilation(alveolarVentilation, patient)\n  const responseTime = 8\n  const fraction = 1 - Math.exp(-dt / responseTime)\n  state.alveolarCo2 = clamp(state.alveolarCo2 + (target - state.alveolarCo2) * fraction, 0, 150)\n}\n"""
new_co2 = """function updateAlveolarCo2(\n  state: SimulationState,\n  ventilator: VentilatorSettings,\n  patient: PatientSettings,\n  t: number,\n  dt: number,\n  complianceL: number,\n) {\n  const alveolarVentilation = calculateEffectiveAlveolarVentilation(state, ventilator, patient, t, complianceL)\n  const vco2 = Math.max(patient.co2Production ?? 250, 0)\n  const heightCm = patient.heightCm ?? 170\n  const pbw = Math.max(20, (patient.sex === 'female' ? 45.5 : 50) + 0.91 * (heightCm - 152.4))\n\n  // Effective whole-body CO2 capacitance. Dissolved CO2 plus bicarbonate/protein\n  // buffering make the physiologic store much larger than the lung gas volume.\n  // At VCO2 250 mL/min, 1.1 L/kg PBW gives an apnoeic rise of about 3 mmHg/min\n  // in a typical adult. VCO2 scales the rise directly.\n  const co2BufferCapacityL = Math.max(30, pbw * 1.1)\n\n  // Rearranged alveolar-ventilation equation: at equilibrium,\n  // PCO2 = 0.863 * VCO2 / VA. Away from equilibrium, current PCO2 and VA\n  // determine CO2 elimination; the buffered store integrates the net balance.\n  const eliminatedCo2MlMin = alveolarVentilation * state.alveolarCo2 / 0.863\n  const netCo2MlMin = vco2 - eliminatedCo2MlMin\n  const changeMmHgPerMinute = 0.863 * netCo2MlMin / co2BufferCapacityL\n  state.alveolarCo2 = clamp(state.alveolarCo2 + (changeMmHgPerMinute / 60) * dt, 0, 150)\n}\n"""
if old_co2 not in text:
    raise SystemExit('CO2 update block anchor not found')
text = text.replace(old_co2, new_co2, 1)

old_capno = """function capnogramValue(\n  expiratory: boolean,\n  elapsedExpiration: number,\n  patient: PatientSettings,\n  complianceL: number,\n  etco2: number,\n): number {\n  if (!expiratory || elapsedExpiration < 0) return 0\n\n  const tau = Math.max(patient.expiratoryResistance * complianceL, 0.05)\n  const obstruction = clamp((tau - 0.45) / 1.8, 0, 1)\n  const deadSpaceDelay = 0.03 + Math.max(patient.deadSpaceVolume ?? 150, 0) / 5000 + 0.05 * obstruction\n  if (elapsedExpiration <= deadSpaceDelay) return 0\n\n  // The same expiratory time constant that limits CO2 clearance also shapes\n  // phase II. A long tau produces the progressively sloping shark-fin pattern.\n  const riseTime = clamp(0.14 + 0.42 * tau, 0.16, 1.6)\n  const riseProgress = clamp((elapsedExpiration - deadSpaceDelay) / riseTime, 0, 1)\n  const normalRise = 1 - Math.pow(1 - riseProgress, 4)\n  const obstructedRise = Math.pow(riseProgress, 1.35)\n  const riseShape = normalRise * (1 - obstruction) + obstructedRise * obstruction\n  const phaseIIEndFraction = 0.88 - 0.12 * obstruction\n\n  if (riseProgress < 1) return clamp(etco2 * phaseIIEndFraction * riseShape, 0, 150)\n\n  const plateauElapsed = elapsedExpiration - deadSpaceDelay - riseTime\n  const plateauRise = plateauElapsed * (0.05 + 0.08 * obstruction)\n  return clamp(etco2 * Math.min(1, phaseIIEndFraction + plateauRise), 0, 150)\n}\n"""
new_capno = """function capnogramSourceValue(\n  expiratory: boolean,\n  elapsedExpiration: number,\n  patient: PatientSettings,\n  complianceL: number,\n  etco2: number,\n): number {\n  if (!expiratory || elapsedExpiration < 0) return 0\n\n  const tau = Math.max(patient.expiratoryResistance * complianceL, 0.05)\n  const obstruction = clamp((tau - 0.45) / 1.8, 0, 1)\n  const deadSpaceDelay = 0.03 + Math.max(patient.deadSpaceVolume ?? 150, 0) / 5000 + 0.05 * obstruction\n  if (elapsedExpiration <= deadSpaceDelay) return 0\n\n  // The same expiratory time constant that limits CO2 clearance also shapes\n  // phase II. A long tau produces the progressively sloping shark-fin pattern.\n  const riseTime = clamp(0.14 + 0.42 * tau, 0.16, 1.6)\n  const riseProgress = clamp((elapsedExpiration - deadSpaceDelay) / riseTime, 0, 1)\n  const normalRise = 1 - Math.pow(1 - riseProgress, 4)\n  const obstructedRise = Math.pow(riseProgress, 1.35)\n  const riseShape = normalRise * (1 - obstruction) + obstructedRise * obstruction\n  const phaseIIEndFraction = 0.88 - 0.12 * obstruction\n\n  if (riseProgress < 1) return clamp(etco2 * phaseIIEndFraction * riseShape, 0, 150)\n\n  const plateauElapsed = elapsedExpiration - deadSpaceDelay - riseTime\n  const plateauRise = plateauElapsed * (0.05 + 0.08 * obstruction)\n  return clamp(etco2 * Math.min(1, phaseIIEndFraction + plateauRise), 0, 150)\n}\n\nfunction updateAirwayCo2(\n  state: SimulationState,\n  expiratory: boolean,\n  flowLmin: number,\n  elapsedExpiration: number,\n  patient: PatientSettings,\n  complianceL: number,\n  t: number,\n  dt: number,\n): number {\n  const activeExpiratoryFlow = expiratory && flowLmin < -0.5\n  if (activeExpiratoryFlow) state.lastExpiratoryFlowTime = t\n\n  // A sidestream/mainstream capnogram samples gas moving past the airway sensor.\n  // Once expiratory flow has effectively stopped, the airway/sampling volume is\n  // no longer replenished from alveoli and its displayed CO2 slowly washes out,\n  // even though the patient's internal CO2 store continues to rise.\n  const target = activeExpiratoryFlow\n    ? capnogramSourceValue(true, elapsedExpiration, patient, complianceL, state.alveolarCo2)\n    : 0\n  const sensorResponseSeconds = activeExpiratoryFlow ? 0.10 : expiratory ? 4.0 : 0.15\n  const fraction = 1 - Math.exp(-dt / sensorResponseSeconds)\n  state.airwayCo2 = clamp(state.airwayCo2 + (target - state.airwayCo2) * fraction, 0, 150)\n  return state.airwayCo2\n}\n"""
if old_capno not in text:
    raise SystemExit('capnogram block anchor not found')
text = text.replace(old_capno, new_capno, 1)

old_sample = """  const sample: Sample = {\n    time: Number(t.toFixed(4)),\n    pressure: clamp(pressure, -5, 80),\n    flow: flowLs * 60,\n    volume: state.volume * 1000,\n    musclePressure: pmus,\n    co2: capnogramValue(!sampleInspiration, t - state.expirationStartTime, patient, complianceL, state.alveolarCo2),\n"""
new_sample = """  const flowLmin = flowLs * 60\n  const airwayCo2 = updateAirwayCo2(\n    state,\n    !sampleInspiration,\n    flowLmin,\n    t - state.expirationStartTime,\n    patient,\n    complianceL,\n    t,\n    dt,\n  )\n\n  const sample: Sample = {\n    time: Number(t.toFixed(4)),\n    pressure: clamp(pressure, -5, 80),\n    flow: flowLmin,\n    volume: state.volume * 1000,\n    musclePressure: pmus,\n    co2: airwayCo2,\n"""
if old_sample not in text:
    raise SystemExit('sample CO2 anchor not found')
text = text.replace(old_sample, new_sample, 1)
engine.write_text(text)

# --- EtCO2 measurement: terminal expiration + 20 s stale timeout ---
app = Path('src/App.tsx')
text = app.read_text()
old_et = """function calculateEndTidalCO2(samples: Sample[]): number | null {\n  if (samples.length < 2) return null\n  let expiratoryPeak = 0\n  let inExpiration = samples[0].phase === 'expiration'\n  let lastCompleted: number | null = null\n\n  if (inExpiration) expiratoryPeak = samples[0].co2\n  for (let index = 1; index < samples.length; index += 1) {\n    const previous = samples[index - 1]\n    const current = samples[index]\n    if (current.phase === 'expiration') {\n      if (!inExpiration) {\n        inExpiration = true\n        expiratoryPeak = current.co2\n      } else {\n        expiratoryPeak = Math.max(expiratoryPeak, current.co2)\n      }\n    }\n    if (previous.phase === 'expiration' && current.phase === 'inspiration' && inExpiration) {\n      lastCompleted = expiratoryPeak\n      inExpiration = false\n      expiratoryPeak = 0\n    }\n  }\n  return lastCompleted\n}\n"""
new_et = """function calculateEndTidalCO2(samples: Sample[]): number | null {\n  if (samples.length < 2) return null\n  const terminalFlowThreshold = 0.5\n  const latestTime = samples[samples.length - 1].time\n  let lastExpiratoryFlowTime: number | null = null\n  let terminalCandidate: number | null = null\n  let lastCompleted: number | null = null\n\n  for (let index = 0; index < samples.length; index += 1) {\n    const current = samples[index]\n    const previous = index > 0 ? samples[index - 1] : null\n\n    if (current.phase === 'expiration' && current.flow < -terminalFlowThreshold) {\n      lastExpiratoryFlowTime = current.time\n      terminalCandidate = current.co2\n    }\n\n    // EtCO2 is the terminal expired concentration: latch the value at the point\n    // expiratory flow has effectively reached zero, not the maximum CO2 seen in\n    // an arbitrarily long expiratory/apnoeic interval.\n    if (\n      previous &&\n      previous.phase === 'expiration' &&\n      current.phase === 'expiration' &&\n      previous.flow < -terminalFlowThreshold &&\n      current.flow >= -terminalFlowThreshold &&\n      terminalCandidate != null\n    ) {\n      lastCompleted = terminalCandidate\n    }\n\n    // If the next inspiration starts before flow crosses the near-zero threshold,\n    // the final actively expired sample is still the end-tidal sample.\n    if (previous && previous.phase === 'expiration' && current.phase === 'inspiration' && terminalCandidate != null) {\n      lastCompleted = terminalCandidate\n      terminalCandidate = null\n    }\n    if (previous && previous.phase === 'inspiration' && current.phase === 'expiration') terminalCandidate = null\n  }\n\n  if (lastExpiratoryFlowTime == null || latestTime - lastExpiratoryFlowTime > 20) return null\n  return lastCompleted\n}\n"""
if old_et not in text:
    raise SystemExit('App EtCO2 function anchor not found')
text = text.replace(old_et, new_et, 1)
text = text.replace("etco2={endTidalCO2 == null ? '—' : endTidalCO2.toFixed(0)}", "etco2={endTidalCO2 == null ? '-' : endTidalCO2.toFixed(0)}", 1)
text = text.replace("appVersion: '0.66'", "appVersion: '0.69'", 1)
text = text.replace('v0.68', 'v0.69')
app.write_text(text)

# --- Physiology monitor uses the same terminal-flow definition ---
phys = Path('src/physiologyMeasurements.ts')
text = phys.read_text()
insert_anchor = """function waveformMonitorValues(samples: Sample[], ventilator: VentilatorSettings) {\n"""
helper = """function measuredEndTidalCO2(samples: Sample[]): number | null {\n  if (samples.length < 2) return null\n  const terminalFlowThreshold = 0.5\n  const latestTime = samples[samples.length - 1].time\n  let lastExpiratoryFlowTime: number | null = null\n  let terminalCandidate: number | null = null\n  let lastCompleted: number | null = null\n\n  for (let index = 0; index < samples.length; index += 1) {\n    const current = samples[index]\n    const previous = index > 0 ? samples[index - 1] : null\n    if (current.phase === 'expiration' && current.flow < -terminalFlowThreshold) {\n      lastExpiratoryFlowTime = current.time\n      terminalCandidate = current.co2\n    }\n    if (\n      previous && previous.phase === 'expiration' && current.phase === 'expiration' &&\n      previous.flow < -terminalFlowThreshold && current.flow >= -terminalFlowThreshold &&\n      terminalCandidate != null\n    ) lastCompleted = terminalCandidate\n    if (previous && previous.phase === 'expiration' && current.phase === 'inspiration' && terminalCandidate != null) {\n      lastCompleted = terminalCandidate\n      terminalCandidate = null\n    }\n    if (previous && previous.phase === 'inspiration' && current.phase === 'expiration') terminalCandidate = null\n  }\n\n  if (lastExpiratoryFlowTime == null || latestTime - lastExpiratoryFlowTime > 20) return null\n  return lastCompleted\n}\n\n"""
if insert_anchor not in text:
    raise SystemExit('physiology waveform monitor anchor not found')
text = text.replace(insert_anchor, helper + insert_anchor, 1)
text = text.replace(
"""  const co2Expiration = recent.filter((sample) => sample.phase === 'expiration').map((sample) => sample.co2)\n""",
"""  const endTidalCO2 = measuredEndTidalCO2(samples)\n""",
1,
)
text = text.replace(
"""    endTidalCO2: co2Expiration.length ? Math.max(...co2Expiration) : null,\n""",
"""    endTidalCO2,\n""",
1,
)
phys.write_text(text)

# --- Monitoring dialog shows a literal '-' when EtCO2 is unavailable ---
dlg = Path('src/components/PhysiologyMeasurementsDialog.tsx')
text = dlg.read_text()
text = text.replace(
"""const display = (number: number | null | undefined, digits = 1) => number == null || !Number.isFinite(number) ? '—' : number.toFixed(digits)\n\nfunction MonitorMetric({ value, label, unit, digits = 1 }: { value: number | null | undefined; label: string; unit: string; digits?: number }) {\n  return (\n    <div className=\"monitor-metric\">\n      <strong>{display(value, digits)}</strong>\n""",
"""const display = (number: number | null | undefined, digits = 1, empty = '—') => number == null || !Number.isFinite(number) ? empty : number.toFixed(digits)\n\nfunction MonitorMetric({ value, label, unit, digits = 1, empty = '—' }: { value: number | null | undefined; label: string; unit: string; digits?: number; empty?: string }) {\n  return (\n    <div className=\"monitor-metric\">\n      <strong>{display(value, digits, empty)}</strong>\n""",
1,
)
text = text.replace(
"""<MonitorMetric value={measurements.endTidalCO2} label=\"EtCO₂\" unit=\"mmHg\" digits={0} />""",
"""<MonitorMetric value={measurements.endTidalCO2} label=\"EtCO₂\" unit=\"mmHg\" digits={0} empty=\"-\" />""",
1,
)
dlg.write_text(text)

# --- Version strings ---
for path in ['src/components/InstructorAccountControls.tsx', 'src/components/SessionPanel.tsx']:
    p = Path(path)
    t = p.read_text().replace('v0.68', 'v0.69')
    p.write_text(t)

diag = Path('src/diagnostics.ts')
t = diag.read_text()
t = t.replace("APP_VERSION = '0.68'", "APP_VERSION = '0.69'")
diag.write_text(t)

print('v0.69 patch applied')
