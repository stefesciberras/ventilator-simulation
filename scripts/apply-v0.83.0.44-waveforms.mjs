import fs from 'node:fs'

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, 'utf8')
  if (!source.includes(before)) throw new Error(`Anchor not found in ${path}: ${before.slice(0, 100)}`)
  fs.writeFileSync(path, source.replace(before, after))
}

replaceExact(
  'src/expiratoryFlowLimitation.ts',
  `  const requestedMagnitude = -requestedFlowLs\n  const limitedMagnitude = Math.min(requestedMagnitude, ceilingLs)\n  return {\n    flowLs: -limitedMagnitude,\n    limited: requestedMagnitude > ceilingLs + 1e-6,\n    ceilingLs,\n  }\n`,
  `  const requestedMagnitude = -requestedFlowLs\n\n  // Do not switch abruptly from the ordinary RC solution to the choke-flow\n  // envelope. A hard Math.min() produces a visible corner each time an\n  // obstructed breath crosses the envelope. Blend over a narrow +/-15% band\n  // around the ceiling so flow and its slope change continuously while the\n  // final severe-obstruction ceiling remains unchanged.\n  const blendWidth = Math.max(ceilingLs * 0.15, 0.015)\n  const blendLow = Math.max(0, ceilingLs - blendWidth)\n  const blendHigh = ceilingLs + blendWidth\n  let limitedMagnitude = requestedMagnitude\n  let limited = false\n\n  if (requestedMagnitude >= blendHigh) {\n    limitedMagnitude = ceilingLs\n    limited = true\n  } else if (requestedMagnitude > blendLow) {\n    const x = clamp((requestedMagnitude - blendLow) / Math.max(blendHigh - blendLow, 1e-6), 0, 1)\n    const smooth = x * x * (3 - 2 * x)\n    limitedMagnitude = requestedMagnitude + (ceilingLs - requestedMagnitude) * smooth\n    limited = smooth > 0.01\n  }\n\n  return {\n    flowLs: -limitedMagnitude,\n    limited,\n    ceilingLs,\n  }\n`,
)

replaceExact(
  'src/simulation/engineLegacy.ts',
  `const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))\n`,
  `const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))\n\nfunction pressureRiseFraction(elapsed: number, riseTime = 0.12): number {\n  const x = clamp(elapsed / Math.max(riseTime, 0.02), 0, 1)\n  // Smoothstep reaches the set pressure without the square leading edge of an\n  // ideal pressure source and without an exponential tail that never settles.\n  return x * x * (3 - 2 * x)\n}\n`,
)

replaceExact(
  'src/simulation/engineLegacy.ts',
  `  const triggerResponseDelay = 0.15\n`,
  `  // Modern ventilators usually respond within a few tens of milliseconds.\n  // The previous 150 ms delay exposed too much unsupported inspiratory effort\n  // and created a deep Paw trough / flow spike before an assisted breath.\n  const triggerResponseDelay = 0.06\n`,
)

replaceExact(
  'src/simulation/engineLegacy.ts',
  `    } else {\n      pressure = ventilator.peep + ventilator.pressureControl\n      const elasticPressure = state.volume / complianceL\n      const availableDrivingPressure = ventilator.pressureControl - elasticPressure + pmus\n      flowLs = Math.max(0, availableDrivingPressure / Math.max(patient.resistance, 0.5))\n    }\n`,
  `    } else {\n      const appliedDrivingPressure = ventilator.pressureControl * pressureRiseFraction(elapsed)\n      pressure = ventilator.peep + appliedDrivingPressure\n      const elasticPressure = state.volume / complianceL\n      const availableDrivingPressure = appliedDrivingPressure - elasticPressure + pmus\n      flowLs = Math.max(0, availableDrivingPressure / Math.max(patient.resistance, 0.5))\n    }\n`,
)

replaceExact(
  'src/simulation/engineLegacy.ts',
  `      // Subsequent breaths are pressure controlled, therefore inspiratory flow\n      // decelerates naturally as elastic recoil approaches the pressure target.\n      pressure = ventilator.peep + state.vgPressureControl\n      const elasticPressure = state.volume / complianceL\n      const availableDrivingPressure = state.vgPressureControl - elasticPressure + pmus\n      flowLs = Math.max(0, availableDrivingPressure / Math.max(patient.resistance, 0.5))\n`,
  `      // Subsequent breaths are pressure controlled, therefore inspiratory flow\n      // decelerates naturally as elastic recoil approaches the pressure target.\n      // Apply the same finite pneumatic rise as ordinary PC rather than stepping\n      // instantaneously from PEEP to the AutoFlow pressure target.\n      const appliedDrivingPressure = state.vgPressureControl * pressureRiseFraction(elapsed)\n      pressure = ventilator.peep + appliedDrivingPressure\n      const elasticPressure = state.volume / complianceL\n      const availableDrivingPressure = appliedDrivingPressure - elasticPressure + pmus\n      flowLs = Math.max(0, availableDrivingPressure / Math.max(patient.resistance, 0.5))\n`,
)

replaceExact(
  'src/simulation/engineLegacy.ts',
  `  } else if (state.breathActive && state.activeBreathType === 'ps') {\n    pressure = ventilator.peep + ventilator.pressureSupport\n    const elasticPressure = state.volume / complianceL\n    const availableDrivingPressure = ventilator.pressureSupport - elasticPressure + pmus\n    flowLs = Math.max(0, availableDrivingPressure / Math.max(patient.resistance, 0.5))\n`,
  `  } else if (state.breathActive && state.activeBreathType === 'ps') {\n    const appliedSupportPressure = ventilator.pressureSupport * pressureRiseFraction(elapsed)\n    pressure = ventilator.peep + appliedSupportPressure\n    const elasticPressure = state.volume / complianceL\n    const availableDrivingPressure = appliedSupportPressure - elasticPressure + pmus\n    flowLs = Math.max(0, availableDrivingPressure / Math.max(patient.resistance, 0.5))\n`,
)

replaceExact(
  'src/simulation/engineLegacy.ts',
  `      const requestedFlow = netPatientDrivingPressure / effortResistance\n      const effortLimitedFlow = applyExpiratoryFlowLimitation(requestedFlow, state.volume, patient)\n      flowLs = effortLimitedFlow.flowLs\n      expiratoryFlowLimited = expiratoryFlowLimited || effortLimitedFlow.limited\n      pressure = ventilator.peep - Math.max(0, netPatientDrivingPressure)\n`,
  `      const requestedFlow = netPatientDrivingPressure / effortResistance\n      const effortLimitedFlow = applyExpiratoryFlowLimitation(requestedFlow, state.volume, patient)\n      flowLs = effortLimitedFlow.flowLs\n      expiratoryFlowLimited = expiratoryFlowLimited || effortLimitedFlow.limited\n\n      // A patient can create a visible trigger notch, but the displayed airway\n      // pressure should not follow full Pmus once the demand valve is sensing the\n      // effort. Cap the pre-trigger depression to a clinically recognisable\n      // deflection while trigger detection itself continues to use the uncapped\n      // predicted signal above. This preserves difficult triggering with auto-PEEP\n      // without the unrealistic deep trough before PC/VG-PC/PS breaths.\n      const preTriggerPressureDeflectionLimit = clamp(pressureTriggerSensitivity + 1, 1.5, 3)\n      const pressureDeflection = Math.min(Math.max(0, netPatientDrivingPressure), preTriggerPressureDeflectionLimit)\n      pressure = ventilator.peep - pressureDeflection\n`,
)

replaceExact(
  'src/appVersion.ts',
  `export const APP_VERSION = '0.83.0.43'\n`,
  `export const APP_VERSION = '0.83.0.44'\n`,
)

replaceExact(
  'scripts/core-regression.mjs',
  `const laserInteractionCss = read('src/teaching/laser-interaction.css')\n`,
  `const laserInteractionCss = read('src/teaching/laser-interaction.css')\nconst expiratoryFlowLimitation = read('src/expiratoryFlowLimitation.ts')\n`,
)

replaceExact(
  'scripts/core-regression.mjs',
  `// Existing shared shell / UI ownership regression checks.\n`,
  `// EDUVENT waveform morphology regression checks.\nassert(eduventLegacyEngine.includes('function pressureRiseFraction'), 'pressure-targeted breaths must retain a finite pressure rise')\nassert(eduventLegacyEngine.includes('const triggerResponseDelay = 0.06'), 'patient trigger response must not restore the exaggerated 150 ms delay')\nassert(eduventLegacyEngine.includes('preTriggerPressureDeflectionLimit'), 'pre-trigger Paw deflection must remain bounded without altering trigger detection')\nassert(expiratoryFlowLimitation.includes('const blendWidth = Math.max(ceilingLs * 0.15, 0.015)'), 'obstructive flow limitation must blend smoothly into its choke-flow envelope')\n\n// Existing shared shell / UI ownership regression checks.\n`,
)

console.log('Applied v0.83.0.44 waveform physiology refinements')
