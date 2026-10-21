import { defineSimulationProduct, type SimulationProductAdapter, type SimulationProductId } from './SimulationProductAdapter'

const sharedCapabilities = {
  patientControls: true,
  alarms: true,
  scenarios: true,
  teaching: true,
  secondaryDisplays: true,
  waveforms: true,
} as const

export const EDUSIM_PRODUCTS: Record<SimulationProductId, SimulationProductAdapter> = {
  eduvent: defineSimulationProduct({
    id: 'eduvent',
    family: 'EDUVENT',
    label: 'EDUVENT',
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
      { id: 'physiology', label: 'Physiological measurements', eyebrow: 'EDUVENT secondary monitor' },
    ],
    alarmDefinitions: [
      { key: 'pressureLimit', label: 'Pressure limitation', unit: 'cmH₂O', priority: 'critical' },
      { key: 'peakPressure', label: 'Peak pressure', unit: 'cmH₂O', priority: 'critical' },
      { key: 'minuteVentilation', label: 'Minute ventilation', unit: 'L/min' },
      { key: 'tidalVolume', label: 'Tidal volume', unit: 'mL' },
      { key: 'respiratoryRate', label: 'Respiratory rate', unit: '/min' },
      { key: 'apneaTime', label: 'Apnoea time', unit: 's', priority: 'critical' },
    ],
  }),
  'edumon-ana': defineSimulationProduct({
    id: 'edumon-ana',
    family: 'EDUMON',
    label: 'EDUMON-Ana',
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
  }),
  'edumon-icu': defineSimulationProduct({
    id: 'edumon-icu',
    family: 'EDUMON',
    label: 'EDUMON-ICU',
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
  }),
}

export function getSimulationProduct(productId: SimulationProductId): SimulationProductAdapter {
  return EDUSIM_PRODUCTS[productId]
}
