import fs from 'node:fs'

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, 'utf8')
  if (!source.includes(before)) throw new Error(`Anchor not found in ${path}: ${before.slice(0, 180)}`)
  fs.writeFileSync(path, source.replace(before, after))
}

replaceExact(
  'src/components/Controls.tsx',
  `  const zeroPressureSupport = (settings.mode === 'PSV' || isSimvMode(settings.mode)) && settings.pressureSupport <= 0.001`,
  `  const zeroPressureSupport = settings.mode === 'PSV' && settings.pressureSupport <= 0.001`,
)

replaceExact(
  'src/App.tsx',
  `  const manualHoldAvailable = activeMode !== 'PSV' && activeMode !== 'APRV' && activeMode !== 'BIPAP'`,
  `  const manualHoldAvailable = activeMode !== 'PSV' && activeMode !== 'BIPAP'`,
)

replaceExact(
  'src/App.tsx',
  `  const beginExpiratoryHold = () => {\n    if (waveformFrozen || simulationPaused || activeMode === 'APRV' || expiratoryHoldPressed) return`,
  `  const beginExpiratoryHold = () => {\n    if (waveformFrozen || simulationPaused || activeMode === 'BIPAP' || expiratoryHoldPressed) return`,
)

replaceExact(
  'src/App.tsx',
  `              disabled={waveformFrozen || simulationPaused || activeMode === 'APRV' || activeMode === 'BIPAP'}\n              title={(activeMode === 'APRV' || activeMode === 'BIPAP') ? 'Expiratory hold is unavailable in two-level pressure modes' : 'Press and hold for an end-expiratory occlusion; release to freeze the trace'}`,
  `              disabled={waveformFrozen || simulationPaused || activeMode === 'BIPAP'}\n              title={activeMode === 'BIPAP' ? 'Expiratory hold is unavailable in BIPAP mode' : 'Press and hold for an end-expiratory occlusion; release to freeze the trace'}`,
)

replaceExact(
  'src/simulation/engineLegacy.ts',
  `  complianceL: number,\n  mode: 'APRV' | 'BIPAP',\n): Sample {\n  let high: boolean`,
  `  complianceL: number,\n  mode: 'APRV' | 'BIPAP',\n  options: SimulationOptions = {},\n): Sample {\n  let high: boolean`,
)

replaceExact(
  'src/simulation/engineLegacy.ts',
  `  let ventilatorTriggerDetected = false\n  const patientEffortStart = pmus > 0.1 && state.previousPmus <= 0.1\n\n  if (mode === 'BIPAP') {`,
  `  let ventilatorTriggerDetected = false\n  const patientEffortStart = pmus > 0.1 && state.previousPmus <= 0.1\n  const inspiratoryHoldRequested = mode === 'APRV' && isRequestHeld(t, options.inspiratoryHoldRequestTime, options.inspiratoryHoldReleaseTime)\n  const expiratoryHoldRequested = mode === 'APRV' && isRequestHeld(t, options.expiratoryHoldRequestTime, options.expiratoryHoldReleaseTime)\n\n  // APRV manual holds pause the pressure-phase clock while the airway is\n  // occluded. This preserves the selected Thigh/Tlow timing after release\n  // instead of allowing the underlying APRV phase to run on invisibly.\n  if (mode === 'APRV') {\n    if (state.inspiratoryHoldActive && !inspiratoryHoldRequested) state.inspiratoryHoldActive = false\n    if (state.expiratoryHoldActive && !expiratoryHoldRequested) state.expiratoryHoldActive = false\n    if (state.inspiratoryHoldActive || state.expiratoryHoldActive) state.modeStartTime += dt\n  }\n\n  if (mode === 'BIPAP') {`,
)

replaceExact(
  'src/simulation/engineLegacy.ts',
  `  }\n\n  const targetPressure = high ? pHigh : pLow\n  const elasticPressure = state.volume / complianceL`,
  `  }\n\n  if (mode === 'APRV') {\n    if (!state.inspiratoryHoldActive && !state.expiratoryHoldActive) {\n      if (inspiratoryHoldRequested && high) state.inspiratoryHoldActive = true\n      else if (expiratoryHoldRequested && !high) state.expiratoryHoldActive = true\n    }\n    if (state.inspiratoryHoldActive) high = true\n    else if (state.expiratoryHoldActive) high = false\n  }\n\n  const targetPressure = high ? pHigh : pLow\n  const elasticPressure = state.volume / complianceL`,
)

replaceExact(
  'src/simulation/engineLegacy.ts',
  `  const resistance = drivingPressure >= 0\n    ? Math.max(patient.resistance, 0.5)\n    : Math.max(patient.expiratoryResistance, 0.5)\n  const flowLs = drivingPressure / resistance\n\n  state.volume = clamp(state.volume + flowLs * dt, 0, 2.5)\n\n  const flowLmin = flowLs * 60`,
  `  const resistance = drivingPressure >= 0\n    ? Math.max(patient.resistance, 0.5)\n    : Math.max(patient.expiratoryResistance, 0.5)\n  let flowLs = drivingPressure / resistance\n  let displayedPressure = targetPressure - spontaneousPressureDeflection\n\n  if (mode === 'APRV' && (state.inspiratoryHoldActive || state.expiratoryHoldActive)) {\n    flowLs = 0\n    displayedPressure = pLow + elasticPressure - pmus\n  }\n\n  state.volume = clamp(state.volume + flowLs * dt, 0, 2.5)\n\n  const flowLmin = flowLs * 60`,
)

replaceExact(
  'src/simulation/engineLegacy.ts',
  `    pressure: clamp(targetPressure - spontaneousPressureDeflection, -5, 80),`,
  `    pressure: clamp(displayedPressure, -5, 80),`,
)

replaceExact(
  'src/simulation/engineLegacy.ts',
  `    expiratoryHold: false,`,
  `    expiratoryHold: state.expiratoryHoldActive,`,
)

replaceExact(
  'src/simulation/engineLegacy.ts',
  `    const sample = twoLevelSample(state, ventilator, patient, t, dt, pmus, complianceL, mode)`,
  `    const sample = twoLevelSample(state, ventilator, patient, t, dt, pmus, complianceL, mode, options)`,
)

replaceExact(
  'src/simulation/engineLegacy.ts',
  `      sample.pressure = pressureLimit\n      sample.flow = 0\n      sample.pressureLimitHit = true\n      state.expirationStartTime = t`,
  `      sample.pressure = pressureLimit\n      sample.flow = 0\n      sample.pressureLimitHit = true\n      state.inspiratoryHoldActive = false\n      state.expiratoryHoldActive = false\n      state.expirationStartTime = t`,
)

replaceExact(
  'src/simulation/engineLegacy.ts',
  `  const supportTriggeringDisabled =\n    (mode === 'PSV' || isSimv(mode)) && ventilator.pressureSupport <= 0.001`,
  `  const supportTriggeringDisabled =\n    mode === 'PSV' && ventilator.pressureSupport <= 0.001`,
)

replaceExact(
  'src/appVersion.ts',
  `export const APP_VERSION = '0.83.0.46'\n`,
  `export const APP_VERSION = '0.83.0.47'\n`,
)

replaceExact(
  'scripts/core-regression.mjs',
  `assert(eduventLegacyEngine.includes('preTriggerPressureDeflectionLimit'), 'pre-trigger Paw deflection must remain bounded without altering trigger detection')\n`,
  `assert(eduventLegacyEngine.includes('preTriggerPressureDeflectionLimit'), 'pre-trigger Paw deflection must remain bounded without altering trigger detection')\nassert(eduvent.includes("const manualHoldAvailable = activeMode !== 'PSV' && activeMode !== 'BIPAP'"), 'APRV must keep manual inspiratory/expiratory holds available while PSV and BIPAP remain excluded')\nassert(eduventLegacyEngine.includes("const inspiratoryHoldRequested = mode === 'APRV'"), 'APRV runtime must consume inspiratory hold requests')\nassert(eduventLegacyEngine.includes("const expiratoryHoldRequested = mode === 'APRV'"), 'APRV runtime must consume expiratory hold requests')\nassert(eduventLegacyEngine.includes('state.modeStartTime += dt'), 'APRV hold must pause the two-level phase clock while occluded')\nassert(eduventLegacyEngine.includes("mode === 'PSV' && ventilator.pressureSupport <= 0.001"), 'zero pressure support must disable patient triggering only in pure PSV, not SIMV')\nassert(!eduventLegacyEngine.includes("(mode === 'PSV' || isSimv(mode)) && ventilator.pressureSupport <= 0.001"), 'SIMV must not inherit the PSV zero-support trigger lockout')\nassert(eduventControls.includes("const zeroPressureSupport = settings.mode === 'PSV' && settings.pressureSupport <= 0.001"), 'SIMV trigger controls must remain enabled at PS 0')\n`,
)

console.log('Applied v0.83.0.47 APRV hold and SIMV trigger fixes')
