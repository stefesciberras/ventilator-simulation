import type { ReactNode } from 'react'

export type SimulationProductId = 'mv' | 'anaesth' | 'icu'
export type LegacySimulationProductId = 'eduvent' | 'edumon-ana' | 'edumon-icu'
export type SimulationProductFamily = 'ventilation' | 'monitoring'
export type TeachingEnvironmentId = 'mechanical-ventilation' | 'anaesthesia' | 'itu' | (string & {})

const LEGACY_PRODUCT_IDS: Record<SimulationProductId, LegacySimulationProductId> = {
  mv: 'eduvent',
  anaesth: 'edumon-ana',
  icu: 'edumon-icu',
}

const PRODUCT_ID_ALIASES: Record<string, SimulationProductId> = {
  mv: 'mv',
  anaesth: 'anaesth',
  icu: 'icu',
  eduvent: 'mv',
  'edumon-ana': 'anaesth',
  'edumon-icu': 'icu',
}

export function toLegacyProductId(productId: SimulationProductId): LegacySimulationProductId {
  return LEGACY_PRODUCT_IDS[productId]
}

export function normaliseSimulationProductId(value: unknown): SimulationProductId | null {
  if (typeof value !== 'string') return null
  return PRODUCT_ID_ALIASES[value.trim().toLowerCase()] ?? null
}

export interface SimulationProductCapabilitySet {
  patientControls: boolean
  deviceControls: boolean
  alarms: boolean
  scenarios: boolean
  teaching: boolean
  secondaryDisplays: boolean
  waveforms: boolean
}

export interface SimulationProductControlTabDefinition {
  id: string
  label: string
}

export interface SimulationProductSecondaryDisplayDefinition {
  id: string
  label: string
  eyebrow?: string
}

export interface SimulationProductAlarmDefinition {
  key: string
  label: string
  unit?: string
  priority?: 'warning' | 'critical'
}

export interface SimulationProductSessionSwitchDefinition {
  id: string
  label: string
  checked: (session: unknown) => boolean
  disabled?: (session: unknown) => boolean
  emphasis?: boolean
  /** Missing patch means this row is informative/read-only for this transport. */
  patch?: (checked: boolean) => unknown
}

export interface SimulationProductSessionDomainDefinition {
  id: string
  title: string
  status: (session: unknown) => string
  active?: (session: unknown) => boolean
  rows: readonly SimulationProductSessionSwitchDefinition[]
}

export interface SimulationProductCandidateStatusDefinition {
  id: string
  text: (session: unknown) => string
  state?: (session: unknown) => 'locked' | 'available'
}

export interface SimulationProductTelemetryDefinition {
  id: string
  label: string
  value: (member: unknown) => string
}

export interface SimulationProductSessionContract {
  domains: readonly SimulationProductSessionDomainDefinition[]
  candidateStatus?: readonly SimulationProductCandidateStatusDefinition[]
  telemetry?: readonly SimulationProductTelemetryDefinition[]
}

export interface SimulationProductScenarioContract {
  productId: SimulationProductId
  supportsBranches: boolean
  supportsTransitions: boolean
  supportsMediaStages: boolean
  supportsQuestionStages: boolean
}

export interface SimulationProductAdapter<TPatient = unknown, TDevice = unknown, TAlarmLimits = unknown> {
  id: SimulationProductId
  family: SimulationProductFamily
  label: string
  route: string
  teachingEnvironment: TeachingEnvironmentId
  capabilities: SimulationProductCapabilitySet
  controlTabs: readonly SimulationProductControlTabDefinition[]
  secondaryDisplays: readonly SimulationProductSecondaryDisplayDefinition[]
  alarmDefinitions: readonly SimulationProductAlarmDefinition[]
  session?: SimulationProductSessionContract
  scenario?: SimulationProductScenarioContract
  defaultPatientState?: TPatient
  defaultDeviceState?: TDevice
  defaultAlarmLimits?: TAlarmLimits
  renderProductBadge?: () => ReactNode
}

export function defineSimulationProduct<TPatient = unknown, TDevice = unknown, TAlarmLimits = unknown>(
  adapter: SimulationProductAdapter<TPatient, TDevice, TAlarmLimits>,
): SimulationProductAdapter<TPatient, TDevice, TAlarmLimits> {
  return adapter
}
