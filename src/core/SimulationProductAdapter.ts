import type { ReactNode } from 'react'

export type SimulationProductId = 'eduvent' | 'edumon-ana' | 'edumon-icu'
export type TeachingEnvironmentId = 'mechanical-ventilation' | 'anaesthesia' | 'itu' | (string & {})

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

export interface SimulationProductAdapter<TPatient = unknown, TDevice = unknown, TAlarmLimits = unknown> {
  id: SimulationProductId
  family: 'EDUVENT' | 'EDUMON'
  label: string
  route: string
  teachingEnvironment: TeachingEnvironmentId
  capabilities: SimulationProductCapabilitySet
  controlTabs: readonly SimulationProductControlTabDefinition[]
  secondaryDisplays: readonly SimulationProductSecondaryDisplayDefinition[]
  alarmDefinitions: readonly SimulationProductAlarmDefinition[]
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
