export const LOPPJUSIM_RUNTIME_MODES = ['standalone', 'simulation', 'teaching'] as const

export type LoppjuSimRuntimeMode = (typeof LOPPJUSIM_RUNTIME_MODES)[number]
export type LoppjuSimSessionRole = 'standalone' | 'instructor' | 'candidate'

export const DEFAULT_SUPPORTED_RUNTIME_MODES: readonly LoppjuSimRuntimeMode[] = LOPPJUSIM_RUNTIME_MODES

export function isLoppjuSimRuntimeMode(value: unknown): value is LoppjuSimRuntimeMode {
  return typeof value === 'string' && (LOPPJUSIM_RUNTIME_MODES as readonly string[]).includes(value)
}

/**
 * Old scenarios did not declare runtime modes. Treat an absent/empty declaration
 * as compatible with every mode so existing scenario libraries remain usable.
 */
export function normalizeSupportedRuntimeModes(modes?: readonly unknown[] | null): LoppjuSimRuntimeMode[] {
  if (!modes?.length) return [...LOPPJUSIM_RUNTIME_MODES]
  const normalized = LOPPJUSIM_RUNTIME_MODES.filter((mode) => modes.includes(mode))
  return normalized.length ? normalized : [...LOPPJUSIM_RUNTIME_MODES]
}

export function supportsRuntimeMode(modes: readonly unknown[] | null | undefined, mode: LoppjuSimRuntimeMode) {
  return normalizeSupportedRuntimeModes(modes).includes(mode)
}

export interface LoppjuSimRuntimeModeContract {
  mode: LoppjuSimRuntimeMode
  label: string
  description: string
  logicalRuntime: 'local' | 'shared-authoritative' | 'per-candidate'
  candidateToInstructorSync: boolean
  internetRequiredForLiveRuntime: boolean
}

export const LOPPJUSIM_RUNTIME_MODE_CONTRACTS: Record<LoppjuSimRuntimeMode, LoppjuSimRuntimeModeContract> = {
  standalone: {
    mode: 'standalone',
    label: 'Standalone',
    description: 'One user runs one local simulator without a session.',
    logicalRuntime: 'local',
    candidateToInstructorSync: false,
    internetRequiredForLiveRuntime: false,
  },
  simulation: {
    mode: 'simulation',
    label: 'Simulation',
    description: 'One instructor and one candidate control one shared authoritative simulation.',
    logicalRuntime: 'shared-authoritative',
    candidateToInstructorSync: true,
    internetRequiredForLiveRuntime: false,
  },
  teaching: {
    mode: 'teaching',
    label: 'Teaching',
    description: 'One instructor teaches one or more candidates whose simulator runtimes remain independent.',
    logicalRuntime: 'per-candidate',
    candidateToInstructorSync: false,
    internetRequiredForLiveRuntime: false,
  },
}

export type SimulationCommandType =
  | 'patient.parameter.set'
  | 'device.parameter.set'
  | 'environment.parameter.set'
  | 'action.invoke'
  | 'action.intensity.set'
  | 'action.stop'
  | 'scenario.control'
  | 'alarm.set'
  | 'simulation.pause.set'
  | 'display.freeze.set'

export interface SimulationCommand<TPayload = unknown> {
  id: string
  sessionId: string
  actorId: string
  actorRole: Exclude<LoppjuSimSessionRole, 'standalone'>
  type: SimulationCommandType
  product: string
  payload: TPayload
  /** Assigned by the session authority when the command is accepted. */
  sequence?: number
  simulationTime: number
  clientTime?: number
}

export interface SimulationSnapshot<TState = unknown, TActiveEffect = unknown> {
  sessionId: string
  product: string
  sequence: number
  simulationTime: number
  state: TState
  activeEffects?: TActiveEffect[]
  paused?: boolean
  waveformFrozen?: boolean
  scenarioId?: string | null
  scenarioStageId?: string | null
}

export type SimulationTransportConnection = 'disabled' | 'connecting' | 'connected' | 'reconnecting' | 'error'

/**
 * Transport contract for Simulation mode. The preferred implementation is the
 * existing LAN/WebSocket path; cloud transports may implement the same contract
 * without changing the simulation runtime.
 */
export interface SimulationTransport<TCommand = SimulationCommand, TSnapshot = SimulationSnapshot> {
  connect: () => void | Promise<void>
  disconnect: () => void | Promise<void>
  sendCommand: (command: TCommand) => boolean | Promise<boolean>
  sendSnapshot: (snapshot: TSnapshot) => boolean | Promise<boolean>
  onCommand: (listener: (command: TCommand) => void) => () => void
  onSnapshot: (listener: (snapshot: TSnapshot) => void) => () => void
}

/**
 * Both instructor and candidate may request changes in Simulation mode, but a
 * single authority validates and sequences every accepted mutation.
 */
export interface SimulationSessionAuthority<TCommand = SimulationCommand, TSnapshot = SimulationSnapshot> {
  getSnapshot: () => TSnapshot
  submitCommand: (command: TCommand) => boolean | Promise<boolean>
  subscribeSnapshot: (listener: (snapshot: TSnapshot) => void) => () => void
}
