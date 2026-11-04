/**
 * Experimental Anaesth adapter for the shared v2 session reducer.
 * Pure, transport-free state transitions; no global ActionRuntime singleton.
 *
 * The host resolves ActionDefinitions and supplies applyAction, which must validate
 * action ID, actor permissions and the declared effect before returning next state.
 * Until configured, Drugs & Events fail closed rather than fake a physiological effect.
 */
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
  fio2: [0.21, 1], peepCmH2O: [0, 35],
})
const INPUT_TYPES = new Set(['patient.parameter.set', 'device.parameter.set',
  'anaesth.gas.set', 'action.invoke', 'tick'])

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
        return { ...state, patient: { ...state.patient, respiratory: {
          ...state.patient.respiratory, [command.payload.path]: command.payload.value,
        } } }
      }
      if (command.type === 'anaesth.gas.set') {
        if (!finite(command.payload?.fiSevoPercent, 0, 8)) throw new Error('Invalid FiSevo')
        return { ...state, patient: { ...state.patient, anaestheticGases: {
          ...state.patient.anaestheticGases, fiSevoPercent: command.payload.fiSevoPercent,
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
        const next = applyAction(clone(state), clone(command.payload), clone(context))
        if (!next || typeof next !== 'object' || !next.patient || !next.actionRuntime) {
          throw new Error('Action evaluator must return canonical state')
        }
        return next
      }
      // Advancing model time is authority-controlled by SessionEngineV2.
      const delta = command.payload?.deltaMs
      if (!finite(delta, 1, 1000)) throw new Error('Invalid tick')
      if (state.controls.paused) return state
      return { ...state, actionRuntime: { ...state.actionRuntime,
        simulationTime: state.actionRuntime.simulationTime + delta / 1000 } }
    },
  }
}
