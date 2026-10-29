import fs from 'node:fs'

const path = 'src/simulation/engineLegacy.ts'
let text = fs.readFileSync(path, 'utf8')

const importNeedle = "import { applyExpiratoryFlowLimitation } from '../expiratoryFlowLimitation'\n"
const importReplacement = `${importNeedle}import { patientMusclePressure, solvePressureDemand, spontaneousTriggerSignal } from './spontaneousBreathing'\n`
if (!text.includes(importNeedle)) throw new Error('engine import anchor missing')
text = text.replace(importNeedle, importReplacement)

const oldPmus = `function patientMusclePressure(t: number, patient: PatientSettings): number {\n  if (patient.spontaneousRate <= 0 || patient.effort <= 0) return 0\n  const cycle = 60 / patient.spontaneousRate\n  const phase = ((t % cycle) + cycle) % cycle\n  const neuralTi = Math.max(patient.neuralInspiratoryTime, 0.1)\n  if (phase >= neuralTi) return 0\n\n  // Active-breathing model: sinusoidal-family Pmus envelope with smooth\n  // rise, optional hold, and smooth release. Equal 50% rise / 50% release with\n  // zero hold is exactly sin^2(pi*t/Ti). Phase percentages scale with neural Ti.\n  let riseTime = neuralTi * clamp(patient.effortRisePercent ?? 30, 1, 95) / 100\n  let relaxationTime = neuralTi * clamp(patient.effortRelaxationPercent ?? 35, 1, 95) / 100\n  const edgeTime = riseTime + relaxationTime\n  if (edgeTime > neuralTi) {\n    const scale = neuralTi / edgeTime\n    riseTime *= scale\n    relaxationTime *= scale\n  }\n  const relaxationStart = neuralTi - relaxationTime\n\n  if (phase < riseTime) {\n    const x = phase / Math.max(riseTime, 0.001)\n    const shape = 0.5 - 0.5 * Math.cos(Math.PI * x)\n    return patient.effort * shape\n  }\n\n  if (phase < relaxationStart) return patient.effort\n\n  const x = (phase - relaxationStart) / Math.max(relaxationTime, 0.001)\n  const shape = 0.5 + 0.5 * Math.cos(Math.PI * clamp(x, 0, 1))\n  return patient.effort * shape\n}\n\n`
if (!text.includes(oldPmus)) throw new Error('Pmus block missing')
text = text.replace(oldPmus, '')

const oldTrigger = `  // Predict the patient-generated signal during expiration. Trapped elastic\n  // pressure (auto-PEEP) must be overcome before Paw can fall below set PEEP\n  // or inspiratory flow can become positive. Pressure sensitivity is therefore\n  // explicitly a gradient from set PEEP, not an absolute airway pressure.\n  const triggerElasticPressure = state.volume / complianceL\n  const triggerNetDrivingPressure = pmus - triggerElasticPressure\n  const triggerEffortResistance = triggerNetDrivingPressure >= 0\n    ? Math.max(patient.resistance, 0.5)\n    : Math.max(patient.expiratoryResistance, 0.5)\n  const predictedPatientFlowLs = triggerNetDrivingPressure / triggerEffortResistance\n  const predictedPatientFlowLmin = predictedPatientFlowLs * 60\n  const predictedAirwayPressure = ventilator.peep - Math.max(0, triggerNetDrivingPressure)\n`
const newTrigger = `  // Derive trigger flow and Paw deflection from the same spontaneous demand\n  // mechanics used after a CPAP/PS breath is triggered. Trapped elastic pressure\n  // must first be overcome, while the finite demand source creates a realistic\n  // pressure deflection rather than assuming an infinitely compliant valve.\n  const triggerSignal = spontaneousTriggerSignal(\n    ventilator.peep,\n    pmus,\n    state.volume,\n    complianceL,\n    patient.resistance,\n  )\n  const predictedPatientFlowLmin = triggerSignal.flowLs * 60\n  const predictedAirwayPressure = triggerSignal.airwayPressureCmH2O\n`
if (!text.includes(oldTrigger)) throw new Error('trigger mechanics block missing')
text = text.replace(oldTrigger, newTrigger)

const oldPs = `  } else if (state.breathActive && state.activeBreathType === 'ps') {\n    const appliedSupportPressure = ventilator.pressureSupport * pressureRiseFraction(elapsed)\n    pressure = ventilator.peep + appliedSupportPressure\n    const elasticPressure = state.volume / complianceL\n    const availableDrivingPressure = appliedSupportPressure - elasticPressure + pmus\n    flowLs = Math.max(0, availableDrivingPressure / Math.max(patient.resistance, 0.5))\n    state.peakInspiratoryFlow = Math.max(state.peakInspiratoryFlow, flowLs)\n`
const newPs = `  } else if (state.breathActive && state.activeBreathType === 'ps') {\n    const appliedSupportPressure = ventilator.pressureSupport * pressureRiseFraction(elapsed)\n    const demand = solvePressureDemand({\n      peepCmH2O: ventilator.peep,\n      targetAssistPressureCmH2O: appliedSupportPressure,\n      musclePressureCmH2O: pmus,\n      volumeAbovePeepL: state.volume,\n      complianceLPerCmH2O: complianceL,\n      airwayResistanceCmH2OPerLs: patient.resistance,\n    })\n    pressure = demand.airwayPressureCmH2O\n    flowLs = demand.flowLs\n    state.peakInspiratoryFlow = Math.max(state.peakInspiratoryFlow, flowLs)\n`
if (!text.includes(oldPs)) throw new Error('PS mechanics block missing')
text = text.replace(oldPs, newPs)

fs.writeFileSync(path, text)

const versionPath = 'src/appVersion.ts'
const version = fs.readFileSync(versionPath, 'utf8')
if (!version.includes("0.83.0.52")) throw new Error('expected version 0.83.0.52')
fs.writeFileSync(versionPath, version.replace('0.83.0.52', '0.83.0.53'))
