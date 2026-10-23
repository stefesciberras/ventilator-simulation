import { EDUMON_PRODUCT_MONITOR_PROFILES, type EdumonProductMonitorProfile } from './commonMonitorProfile'

export type EdumonModuleId = 'ana' | 'icu'

// trends/teaching and ana-gases remain compatibility IDs for existing shared
// surface routing; anaesthetic gases now live directly in the Ana footer strip.
export type EdumonAuxiliaryMonitorId =
  | 'ana-gases'
  | 'icu-neuro'
  | 'trends'
  | 'teaching'

export interface EdumonModuleDefinition {
  id: EdumonModuleId
  productName: string
  subtitle: string
  defaultTeachingModule: string
  monitorProfile: EdumonProductMonitorProfile
  plannedMeasurements: string[]
  auxiliaryMonitors: Array<{
    id: EdumonAuxiliaryMonitorId
    label: string
    shortLabel: string
    description: string
  }>
}

export const EDUMON_MODULES: Record<EdumonModuleId, EdumonModuleDefinition> = {
  ana: {
    id: 'ana',
    productName: 'EDUMON-Ana',
    subtitle: 'Anaesthesia patient monitor',
    defaultTeachingModule: 'Anaesthesia monitoring',
    monitorProfile: EDUMON_PRODUCT_MONITOR_PROFILES.ana,
    plannedMeasurements: ['EtCO₂', 'FiO₂', 'EtO₂', 'FiSevo', 'EtSevo', 'MAC', 'NIBP', 'Temperature', 'BIS', 'TOF'],
    auxiliaryMonitors: [],
  },
  icu: {
    id: 'icu',
    productName: 'EDUMON-ICU',
    subtitle: 'Intensive care patient monitor',
    defaultTeachingModule: 'Intensive care monitoring',
    monitorProfile: EDUMON_PRODUCT_MONITOR_PROFILES.icu,
    plannedMeasurements: ['EtCO₂', 'CVP', 'ICP', 'CPP', 'NIBP', 'Temperature', 'Advanced haemodynamics'],
    auxiliaryMonitors: [
      {
        id: 'icu-neuro',
        label: 'Neuro monitoring',
        shortLabel: 'ICP / CPP',
        description: 'ICP waveform/value and derived cerebral perfusion pressure.',
      },
    ],
  },
}

export function moduleFromPath(pathname: string): EdumonModuleId | null {
  if (pathname === '/edumon/ana' || pathname.startsWith('/edumon/ana/')) return 'ana'
  if (pathname === '/edumon/icu' || pathname.startsWith('/edumon/icu/')) return 'icu'
  return null
}
