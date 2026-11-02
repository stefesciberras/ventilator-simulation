import type { LoppjuSimRuntimeMode, LoppjuSimSessionRole } from './runtimeModes'

/**
 * Semantic state classes used by the session layer. These describe ownership
 * and synchronization, not the concrete transport carrying the state.
 */
export type SessionStateClass =
  | 'patient-model'
  | 'session-control'
  | 'presentation-broadcast'
  | 'local-view'

export interface SessionStateClassContract {
  stateClass: SessionStateClass
  authoritativeActor: 'local-user' | 'session-authority' | 'instructor' | 'participant'
  persistence: 'runtime-snapshot' | 'session' | 'ephemeral' | 'local'
  simulationSync: 'canonical-shared' | 'instructor-to-candidate' | 'local-only'
  teachingSync: 'instructor-to-candidates' | 'local-only'
}

export const SESSION_STATE_CLASS_CONTRACTS: Record<SessionStateClass, SessionStateClassContract> = {
  'patient-model': {
    stateClass: 'patient-model',
    authoritativeActor: 'session-authority',
    persistence: 'runtime-snapshot',
    simulationSync: 'canonical-shared',
    teachingSync: 'instructor-to-candidates',
  },
  'session-control': {
    stateClass: 'session-control',
    authoritativeActor: 'instructor',
    persistence: 'session',
    simulationSync: 'instructor-to-candidate',
    teachingSync: 'instructor-to-candidates',
  },
  'presentation-broadcast': {
    stateClass: 'presentation-broadcast',
    authoritativeActor: 'instructor',
    persistence: 'ephemeral',
    simulationSync: 'instructor-to-candidate',
    teachingSync: 'instructor-to-candidates',
  },
  'local-view': {
    stateClass: 'local-view',
    authoritativeActor: 'participant',
    persistence: 'local',
    simulationSync: 'local-only',
    teachingSync: 'local-only',
  },
}

export type ParticipantAccessCapability =
  | 'patient-controls'
  | 'physiology-controls'
  | 'patient-profiles'
  | 'teaching-controls'
  | 'instructor-view'
  | 'session-controls'
  | 'session-termination'
  | 'scenario-controls'
  | 'device-controls'
  | 'anaesthetic-gas-controls'
  | 'waveform-visibility'
  | 'local-waveform-freeze'
  | 'actions'

/**
 * Product-neutral access capabilities. Product adapters may further restrict
 * device/action details, but they must not grant a restricted learner any
 * instructor-only capability that is false here.
 */
export interface ParticipantAccessPolicy {
  restrictedLearner: boolean
  patientControls: boolean
  physiologyControls: boolean
  patientProfiles: boolean
  teachingControls: boolean
  instructorView: boolean
  sessionControls: boolean
  sessionTermination: boolean
  scenarioControls: boolean
  deviceControls: boolean
  anaestheticGasControls: boolean
  waveformVisibilityControls: boolean
  localWaveformFreeze: boolean
  actionAccess: 'all' | 'permission-gated'
}

const FULL_ACCESS: ParticipantAccessPolicy = {
  restrictedLearner: false,
  patientControls: true,
  physiologyControls: true,
  patientProfiles: true,
  teachingControls: true,
  instructorView: true,
  sessionControls: true,
  sessionTermination: true,
  scenarioControls: true,
  deviceControls: true,
  anaestheticGasControls: true,
  waveformVisibilityControls: true,
  localWaveformFreeze: true,
  actionAccess: 'all',
}

const RESTRICTED_LEARNER_ACCESS: ParticipantAccessPolicy = {
  restrictedLearner: true,
  patientControls: false,
  physiologyControls: false,
  patientProfiles: false,
  teachingControls: false,
  instructorView: false,
  sessionControls: false,
  sessionTermination: false,
  scenarioControls: false,
  deviceControls: true,
  anaestheticGasControls: true,
  waveformVisibilityControls: true,
  localWaveformFreeze: true,
  actionAccess: 'permission-gated',
}

export function resolveParticipantAccessPolicy(
  mode: LoppjuSimRuntimeMode,
  role: LoppjuSimSessionRole,
): ParticipantAccessPolicy {
  if (mode === 'standalone' || role === 'standalone' || role === 'instructor') return { ...FULL_ACCESS }
  return { ...RESTRICTED_LEARNER_ACCESS }
}

export function participantCanAccess(policy: ParticipantAccessPolicy, capability: ParticipantAccessCapability) {
  switch (capability) {
    case 'patient-controls': return policy.patientControls
    case 'physiology-controls': return policy.physiologyControls
    case 'patient-profiles': return policy.patientProfiles
    case 'teaching-controls': return policy.teachingControls
    case 'instructor-view': return policy.instructorView
    case 'session-controls': return policy.sessionControls
    case 'session-termination': return policy.sessionTermination
    case 'scenario-controls': return policy.scenarioControls
    case 'device-controls': return policy.deviceControls
    case 'anaesthetic-gas-controls': return policy.anaestheticGasControls
    case 'waveform-visibility': return policy.waveformVisibilityControls
    case 'local-waveform-freeze': return policy.localWaveformFreeze
    case 'actions': return policy.actionAccess === 'all' || policy.actionAccess === 'permission-gated'
  }
}

/**
 * Compatibility map for established shared control-tab ids. New product tabs
 * should declare their capability explicitly in the product adapter/framework.
 */
export function defaultControlTabAccessCapability(tabId: string): ParticipantAccessCapability | null {
  switch (tabId) {
    case 'actions': return 'actions'
    case 'vent': return 'device-controls'
    case 'patient': return 'patient-controls'
    case 'physio': return 'physiology-controls'
    case 'teaching': return 'teaching-controls'
    default: return null
  }
}

export interface ParticipantAccessContext {
  mode: LoppjuSimRuntimeMode
  role: LoppjuSimSessionRole
  policy: ParticipantAccessPolicy
}

export function readParticipantAccessContextFromDocument(): ParticipantAccessContext {
  const roleValue = typeof document !== 'undefined'
    ? document.documentElement.dataset.loppjusimSessionRole
    : undefined
  const modeValue = typeof document !== 'undefined'
    ? document.documentElement.dataset.loppjusimRuntimeMode
    : undefined

  const role: LoppjuSimSessionRole = roleValue === 'candidate' || roleValue === 'instructor'
    ? roleValue
    : 'standalone'
  const mode: LoppjuSimRuntimeMode = modeValue === 'simulation' || modeValue === 'teaching' || modeValue === 'self-directed'
    ? modeValue
    : 'standalone'

  return { mode, role, policy: resolveParticipantAccessPolicy(mode, role) }
}

export function effectiveWaveformFreeze(globalFrozen: boolean, localFrozen: boolean) {
  return globalFrozen || localFrozen
}
