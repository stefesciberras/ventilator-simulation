import { ARDS_PROFILES, PATIENT_PROFILES } from '../patientProfiles'
import { EDUMON_PATIENT_PROFILES } from '../edumon/patientProfiles'
import type { PatientSettings } from '../simulation/types'
import type { MonitorPatientState } from '../edumon/types'
import type { ScenarioProductId } from '../teaching/scenario/products'

export interface BuiltinProductProfile<TValues extends object> {
  key: string
  name: string
  values: TValues
}

export const MV_PROFILE_KEYS = {
  Normal: 'mv.normal',
  COPD: 'mv.copd',
  Asthma: 'mv.asthma',
  Paed: 'mv.paediatric',
  ArdsMild: 'mv.ards.mild',
  ArdsModerate: 'mv.ards.moderate',
  ArdsSevere: 'mv.ards.severe',
} as const

export const EDUMON_PROFILE_KEYS = {
  Awake: 'edumon.awake',
  Asleep: 'edumon.asleep',
  Paediatric: 'edumon.paediatric',
} as const

export const MV_BUILTIN_PROFILES: Array<BuiltinProductProfile<PatientSettings>> = [
  { key: MV_PROFILE_KEYS.Normal, name: 'Normal', values: PATIENT_PROFILES.Normal },
  { key: MV_PROFILE_KEYS.COPD, name: 'COPD', values: PATIENT_PROFILES.COPD },
  { key: MV_PROFILE_KEYS.Asthma, name: 'Asthma', values: PATIENT_PROFILES.Asthma },
  { key: MV_PROFILE_KEYS.ArdsMild, name: 'ARDS Mild', values: ARDS_PROFILES.mild },
  { key: MV_PROFILE_KEYS.ArdsModerate, name: 'ARDS Moderate', values: ARDS_PROFILES.moderate },
  { key: MV_PROFILE_KEYS.ArdsSevere, name: 'ARDS Severe', values: ARDS_PROFILES.severe },
  { key: MV_PROFILE_KEYS.Paed, name: 'Paediatric', values: PATIENT_PROFILES.Paed },
]

export const EDUMON_BUILTIN_PROFILES: Array<BuiltinProductProfile<MonitorPatientState>> = (Object.keys(EDUMON_PATIENT_PROFILES) as Array<keyof typeof EDUMON_PATIENT_PROFILES>).map((name) => ({
  key: EDUMON_PROFILE_KEYS[name],
  name,
  values: EDUMON_PATIENT_PROFILES[name],
}))

export function builtinProfilesForProduct(product: ScenarioProductId): Array<BuiltinProductProfile<Record<string, unknown>>> {
  if (product === 'mv') return MV_BUILTIN_PROFILES.map((row) => ({ ...row, values: row.values as unknown as Record<string, unknown> }))
  return EDUMON_BUILTIN_PROFILES.map((row) => ({ ...row, values: row.values as unknown as Record<string, unknown> }))
}
