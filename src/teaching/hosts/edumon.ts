import type { TeachingHostAdapter } from '../types'

export const edumonAnaTeachingHost: TeachingHostAdapter = {
  appId: 'anaesth',
  appName: 'LoppjuSIM-Anaesth',
  defaultModule: 'Anaesthesia monitoring',
  libraryEnvironmentId: 'anaesthesia',
}

export const edumonIcuTeachingHost: TeachingHostAdapter = {
  appId: 'icu',
  appName: 'LoppjuSIM-ICU',
  defaultModule: 'Intensive care monitoring',
  libraryEnvironmentId: 'itu',
}
