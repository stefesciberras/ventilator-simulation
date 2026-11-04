/**
 * Experimental Anaesth adapter for the shared v2 session reducer.
 * Pure, transport-free state transitions; no global ActionRuntime singleton.
 *
 * The host resolves ActionDefinitions and supplies applyAction, which must validate
 * action ID, actor permissions and the declared effect before returning next state.
 * Until configured, Drugs & Events fail closed rather than fake a physiological effect.
 */
import { advanceEndTidalSevo, estimatedAlveolarVentilationLMin } from '../../edumon/sharedVolatilePhysiology.mjs'
import { applySharedEdumonActionPhysiology } from '../../edumon/sharedActionPhysiology.mjs'
import { resolveV2ActionNumber, projectAnaesthV2Monitor } from './anaesthPilot.mjs'
import { advanceBisIndex, tofReadingFromBlock } from '../../edumon/sharedAnaestheticMeasurements.mjs'
import { advanceAlveolarCo2 } from '../../core/physiology/respiratory/sharedCo2Kinetics.mjs'
import { setBronchospasmSeverity, advanceBronchospasm, projectBronchospasmVentilation } from './bronchospasm.mjs'

const clone = value => structuredClone(value)
const finite = (value, min, max) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

const PATIENT_LIMITS = Object.freeze({
  heartRate: [0, 300], systolicPressure: [0, 350], diastolicPressure: [0, 250],
  spo2: [0, 100], peripheralPerfusion: [0, 5], temperatureC: [20, 45],
})
const DEVICE_LIMITS = Object.freeze({
  respiratoryRate: [0, 80], tidalVolumeMl: [0, 2500],
  spontaneousRespiratoryRate: [0, 80], spontaneousTidalVolumeMl: [0, 2500],
  ventilatorSetRate: [0, 80], ventilatorSetTidalVolumeMl: [0, 2500],
  ventilatorInspiratoryTimeSeconds: [0.1, 10],
  ventilatorInspiratoryFlowLMin: [0, 200],
  ventilatorPressureControlCmH2O: [0, 80],
  ventilatorPressureSupportCmH2O: [0, 80],
  ventilatorPlateauPercent: [0, 20],
  ventilatorVolumeGuaranteePressureLimitCmH2O: [0, 80],
  ventilatorTerminationSensitivityPercent: [5, 80],
  ventilatorSimvSyncWindowPercent: [5, 75],
  fio2: [0.21, 1], peepCmH2O: [0, 35],
})
const INPUT_TYPES = new Set(['patient.parameter.set', 'device.parameter.set',
  'anaesth.gas.set', 'action.invoke', 'monitor.tof.measure', 'event.bronchospasm.set', 'device.ventilator.mode.set', 'tick'])

function validatePathValue(payload, limits) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      typeof payload.path !== 'string' || !Object.hasOwn(limits, payload.path)) {
    throw new Error('Unsupported parameter')
  }
  const [min, max] = limits[payload.path]
  if (!finite(payload.value, min, max)) throw new Error('Value out of bounds')
}

/**
 * @param {object} options
 * @param {object} options.initialPatient - canonical patient state, seeded from existing simulator
 * @param {Function} [options.applyAction] - trusted, pure action evaluator
 */
export function createAnaesthSessionAdapter({ initialPatient, applyAction } = {}) {
  if (!initialPatient || typeof initialPatient !== 'object' || Array.isArray(initialPatient)) {
    throw new Error('Anaesth initialPatient required')
  }
  const baseline = clone(initialPatient)
  const initial = () => ({
    patient: clone(baseline),
    actionRuntime: { simulationTime: 0, activeEffects: [], activeToggleActions: [] },
    gasRuntime: { etSevoPercent: 0 },
    respiratoryRuntime: { alveolarCo2MmHg: 40, estimatedEtCo2MmHg: 40,
      respiratoryRate: baseline.respiratory?.respiratoryRate ?? 12,
      tidalVolumeMl: baseline.respiratory?.tidalVolumeMl ?? 500,
      alveolarVentilationLMin: 4.2, minuteVentilationLMin: 6 },
    monitorRuntime: { bisValue: 100, tofReading: null },
    bronchospasmRuntime: { targetSeverityPercent: 0, effectiveSeverityPercent: 0 },
    display: { invasiveBloodPressure: false, bis: false, capnography: false, temperature: false },
    controls: { paused: false, waveformsFrozen: false, alarmsSilenced: false },
  })

  return {
    initialState: () => initial(),
    reset: () => initial(),
    apply: (state, command, context) => {
      if (!INPUT_TYPES.has(command.type)) throw new Error('Unsupported command')
      const actorRole = context.actorRole
      if (command.type === 'patient.parameter.set') {
        if (actorRole !== 'instructor' && context.mode !== 'standalone') throw new Error('Instructor-only patient control')
        validatePathValue(command.payload, PATIENT_LIMITS)
        return { ...state, patient: { ...state.patient, [command.payload.path]: command.payload.value } }
      }
      if (command.type === 'device.parameter.set') {
        validatePathValue(command.payload, DEVICE_LIMITS)
        const path = command.payload.path
        const value = command.payload.value
        const respiratory = { ...state.patient.respiratory, [path]: value }
        // Preserve the distinction between set values and measured delivery.
        // For mandatory modes the canonical mechanics tick will resolve VT/RR.
        return { ...state, patient: { ...state.patient, respiratory } }
      }
      if (command.type === 'anaesth.gas.set') {
        if (!finite(command.payload?.fiSevoPercent, 0, 8)) throw new Error('Invalid FiSevo')
        return { ...state, patient: { ...state.patient, anaestheticGases: {
          ...state.patient.anaestheticGases, fiSevoPercent: command.payload.fiSevoPercent,
        } } }
      }
      if (command.type === 'event.bronchospasm.set') {
        // This is the intrinsic pilot Event; the slider changes only the
        // canonical severity target. No client-defined effects are accepted.
        if (actorRole !== 'instructor' && context.mode !== 'standalone')
          throw Error('Instructor-only bronchospasm severity')
        if (!command.payload || Object.keys(command.payload).some(k => k !== 'severityPercent'))
          throw Error('Untrusted bronchospasm command')
        return setBronchospasmSeverity(state, command.payload.severityPercent)
      }
      if (command.type === 'device.ventilator.mode.set') {
        if (!command.payload || Object.keys(command.payload).some(k => k !== 'mode') ||
          !['MANUAL','VC-AC','PC-AC','PSV','SIMV-VC','SIMV-PC','VG-PC'].includes(command.payload.mode))
          throw Error('Unsupported ventilator mode')
        return { ...state, patient: { ...state.patient, respiratory: {
          ...state.patient.respiratory, ventilatorMode: command.payload.mode,
        } } }
      }
      if (command.type === 'action.invoke') {
        if (typeof applyAction !== 'function') throw new Error('Action evaluator not installed')
        if (!command.payload || typeof command.payload.actionId !== 'string' ||
            !command.payload.actionId || !finite(command.payload.intensity ?? 1, 0, 10)) {
          throw new Error('Invalid action request')
        }
        // The caller cannot inject an ActionRuntime snapshot or arbitrary effect definition.
        if (Object.keys(command.payload).some(k => !['actionId', 'intensity'].includes(k))) {
          throw new Error('Untrusted action payload')
        }
        const next = applyAction(clone(state), clone(command.payload), { ...clone(context), commandId: command.id })
        if (!next || typeof next !== 'object' || !next.patient || !next.actionRuntime) {
          throw new Error('Action evaluator must return canonical state')
        }
        return next
      }
      if (command.type === 'monitor.tof.measure') {
        if (command.payload && Object.keys(command.payload).length) throw Error('Untrusted TOF payload')
        const now = state.actionRuntime.simulationTime
        const block = resolveV2ActionNumber(state.actionRuntime, 'neuromuscular.block', 0)
        const minimumCount = resolveV2ActionNumber(state.actionRuntime, 'neuromuscular.tofMinimumCount', 0)
        const reading = tofReadingFromBlock(block, minimumCount)
        return { ...state, monitorRuntime: { ...state.monitorRuntime,
          bisValue: state.monitorRuntime?.bisValue ?? 100,
          tofReading: { ...reading, measuredAtSimulationTime: now },
        } }
      }
      // Advancing model time is authority-controlled by SessionEngineV2.
      const delta = command.payload?.deltaMs
      if (!finite(delta, 1, 1000)) throw new Error('Invalid tick')
      if (state.controls.paused) return state
      // Advance gas kinetics from the checkpointed effective ventilation.
      // Do not mutate raw patient controls; measured EtSevo is runtime state.
      // If an old checkpoint predates gasRuntime, initialize at 0 explicitly.
      const withEvent = advanceBronchospasm(state, delta / 1000)
      const resolve = (target, base) => resolveV2ActionNumber(withEvent.actionRuntime, target, base)
      const effective = applySharedEdumonActionPhysiology(withEvent.patient, resolve)
      const respiratory = effective.respiratory
      const mode = respiratory.ventilatorMode ?? 'MANUAL'
      const mandatory = !['MANUAL','PSV'].includes(mode)
      // In controlled modes, the device set rate remains authoritative even
      // if a relaxant suppresses spontaneous breathing. Measured delivery is
      // a separate output and must never overwrite device settings.
      const controlled = mandatory ? {
        ...respiratory,
        respiratoryRate: respiratory.ventilatorSetRate ?? respiratory.respiratoryRate,
      } : respiratory
      const mechanical = projectBronchospasmVentilation(controlled)
      const observedRespiratory = {
        ...controlled, tidalVolumeMl: mechanical.tidalVolumeMl,
      }
      const co2 = advanceAlveolarCo2({
        previousAlveolarCo2MmHg: state.respiratoryRuntime?.alveolarCo2MmHg ?? 40,
        respiratoryRate: observedRespiratory.respiratoryRate,
        tidalVolumeMl: observedRespiratory.tidalVolumeMl,
        deadSpaceMl: respiratory.deadSpaceMl,
        co2ProductionMlMin: respiratory.co2ProductionMlMin,
        sex: respiratory.sex,
        heightCm: respiratory.heightCm,
        deltaSeconds: delta / 1000,
      })
      const nextEtSevo = advanceEndTidalSevo({
        etSevoPercent: state.gasRuntime?.etSevoPercent ?? 0,
        fiSevoPercent: state.patient.anaestheticGases?.fiSevoPercent ?? 0,
        alveolarVentilationLMin: estimatedAlveolarVentilationLMin(observedRespiratory),
        frcMl: respiratory.frcMl,
        dtSeconds: delta / 1000,
      })
      const next = { ...withEvent,
        actionRuntime: { ...withEvent.actionRuntime,
          simulationTime: state.actionRuntime.simulationTime + delta / 1000 },
        gasRuntime: { etSevoPercent: nextEtSevo },
        respiratoryRuntime: {
          ...co2,
          expiratoryResistanceCmH2OLs: mechanical.airwayResistanceCmH2OLs,
          peakAirwayPressureCmH2O: mechanical.peakAirwayPressureCmH2O,
          expiratoryTimeConstantSeconds: mechanical.expiratoryTimeConstantSeconds,
        },
      }
      const depth = projectAnaesthV2Monitor(next).anaestheticPhysiology.depthOfAnaesthesia
      return { ...next, monitorRuntime: { ...state.monitorRuntime,
        bisValue: advanceBisIndex(state.monitorRuntime?.bisValue ?? 100, depth, delta / 1000),
        tofReading: state.monitorRuntime?.tofReading ?? null,
      } }
    },
  }
}
