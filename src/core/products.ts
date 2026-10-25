import { EDUVENT_SESSION_CONTRACT } from '../eduvent/productContract'
import { EDUMON_SESSION_CONTRACT } from '../edumon/productContract'
import { defineSimulationProduct, type SimulationProductAdapter, type SimulationProductId } from './SimulationProductAdapter'

const sharedCapabilities = {
  patientControls: true,
  alarms: true,
  scenarios: true,
  teaching: true,
  secondaryDisplays: true,
  waveforms: true,
} as const

const scenarioCapabilities = (productId: SimulationProductId) => ({
  productId,
  supportsBranches: true,
  supportsTransitions: true,
  supportsMediaStages: true,
  supportsQuestionStages: true,
})

export const SIMULATION_PRODUCTS: Record<SimulationProductId, SimulationProductAdapter> = {
  mv: defineSimulationProduct({
    id: 'mv',
    family: 'ventilation',
    label: 'LoppjuSIM-MV',
    route: '/eduvent',
    teachingEnvironment: 'mechanical-ventilation',
    capabilities: { ...sharedCapabilities, deviceControls: true },
    controlTabs: [
      { id: 'vent', label: 'Vent' },
      { id: 'patient', label: 'Patient' },
      { id: 'physio', label: 'Physio' },
      { id: 'teaching', label: 'Teaching' },
    ],
    secondaryDisplays: [
      { id: 'physiology', label: 'Physiological measurements', eyebrow: 'LoppjuSIM-MV secondary monitor' },
    ],
    alarmDefinitions: [
      { key: 'pressureLimit', label: 'Pressure limitation', unit: 'cmH₂O', priority: 'critical' },
      { key: 'peakPressure', label: 'Peak pressure', unit: 'cmH₂O', priority: 'critical' },
      { key: 'minuteVentilation', label: 'Minute ventilation', unit: 'L/min' },
      { key: 'tidalVolume', label: 'Tidal volume', unit: 'mL' },
      { key: 'respiratoryRate', label: 'Respiratory rate', unit: '/min' },
      { key: 'apneaTime', label: 'Apnoea time', unit: 's', priority: 'critical' },
    ],
    session: EDUVENT_SESSION_CONTRACT,
    scenario: scenarioCapabilities('mv'),
  }),
  anaesth: defineSimulationProduct({
    id: 'anaesth',
    family: 'monitoring',
    label: 'LoppjuSIM-Anaesth',
    route: '/edumon/ana',
    teachingEnvironment: 'anaesthesia',
    capabilities: { ...sharedCapabilities, deviceControls: false },
    controlTabs: [
      { id: 'actions', label: 'Actions' },
      { id: 'patient', label: 'Patient' },
      { id: 'physio', label: 'Physio' },
      { id: 'teaching', label: 'Teaching' },
    ],
    secondaryDisplays: [
      { id: 'gases', label: 'Anaesthetic gases' },
      { id: 'trends', label: 'Trends' },
      { id: 'teaching', label: 'Teaching' },
      { id: 'scenarios', label: 'Scenarios' },
    ],
    alarmDefinitions: [
      { key: 'heartRate', label: 'Heart rate', unit: '/min' },
      { key: 'map', label: 'MAP', unit: 'mmHg' },
      { key: 'spo2', label: 'SpO₂', unit: '%' },
    ],
    session: EDUMON_SESSION_CONTRACT,
    scenario: scenarioCapabilities('anaesth'),
  }),
  icu: defineSimulationProduct({
    id: 'icu',
    family: 'monitoring',
    label: 'LoppjuSIM-ICU',
    route: '/edumon/icu',
    teachingEnvironment: 'itu',
    capabilities: { ...sharedCapabilities, deviceControls: false },
    controlTabs: [
      { id: 'actions', label: 'Actions' },
      { id: 'patient', label: 'Patient' },
      { id: 'physio', label: 'Physio' },
      { id: 'teaching', label: 'Teaching' },
    ],
    secondaryDisplays: [
      { id: 'neuro', label: 'Neuro / ICP' },
      { id: 'trends', label: 'Trends' },
      { id: 'teaching', label: 'Teaching' },
      { id: 'scenarios', label: 'Scenarios' },
    ],
    alarmDefinitions: [
      { key: 'heartRate', label: 'Heart rate', unit: '/min' },
      { key: 'map', label: 'MAP', unit: 'mmHg' },
      { key: 'spo2', label: 'SpO₂', unit: '%' },
    ],
    session: EDUMON_SESSION_CONTRACT,
    scenario: scenarioCapabilities('icu'),
  }),
}

/** @deprecated Use SIMULATION_PRODUCTS. */
export const EDUSIM_PRODUCTS = SIMULATION_PRODUCTS

export function getSimulationProduct(productId: SimulationProductId): SimulationProductAdapter {
  return SIMULATION_PRODUCTS[productId]
}
