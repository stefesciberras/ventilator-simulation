type JsonObject = Record<string, unknown>

const TOP_LEVEL_KEYS = [
  'lastActionId',
  'actionSequence',
  'actionSimulationTime',
  'actionCommand',
  'actionRuntimeSnapshot',
] as const

const RESPIRATORY_KEYS = [
  'ventilatorMode',
  'ventilatorSetRate',
  'ventilatorSetTidalVolumeMl',
  'ventilatorInspiratoryTimeSeconds',
  'ventilatorInspiratoryFlowLMin',
  'ventilatorPlateauPercent',
  'ventilatorPressureControlCmH2O',
  'ventilatorVolumeGuaranteePressureLimitCmH2O',
  'ventilatorPressureSupportCmH2O',
  'ventilatorTerminationSensitivityPercent',
  'ventilatorSimvSyncWindowPercent',
  'peepCmH2O',
  'fio2',
] as const

function objectValue(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
}

/**
 * Exact client-side mirror of private.edusim_candidate_simulation_patch().
 * The database remains the cloud authority; the instructor runtime uses this
 * same allow-list when accepting candidate commands over the local LAN path.
 */
export function filterCandidateSimulationPatch(patch: JsonObject): JsonObject {
  const result: JsonObject = {}

  for (const key of TOP_LEVEL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) result[key] = patch[key]
  }

  const patient = objectValue(patch.patient)
  const respiratory = objectValue(patient.respiratory)
  const respiratoryPatch: JsonObject = {}
  for (const key of RESPIRATORY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(respiratory, key)) respiratoryPatch[key] = respiratory[key]
  }

  const anaestheticGases = objectValue(patient.anaestheticGases)
  const patientPatch: JsonObject = {}
  if (Object.keys(respiratoryPatch).length) patientPatch.respiratory = respiratoryPatch
  if (Object.prototype.hasOwnProperty.call(anaestheticGases, 'fiSevoPercent')) {
    patientPatch.anaestheticGases = { fiSevoPercent: anaestheticGases.fiSevoPercent }
  }
  if (Object.keys(patientPatch).length) result.patient = patientPatch

  return result
}

export function hasCandidateSimulationPatch(patch: JsonObject) {
  return Object.keys(filterCandidateSimulationPatch(patch)).length > 0
}
