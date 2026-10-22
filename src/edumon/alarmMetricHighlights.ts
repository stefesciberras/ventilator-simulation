import type { SharedAlarmMetricHighlightRule } from '../components/SharedAlarmMetricHighlight'

/**
 * EDUMON owns alarm semantics; the shared EDUSIM component owns presentation.
 * Keep only the mapping between EDUMON alarm labels and measured-value panels here.
 */
export const EDUMON_ALARM_METRIC_HIGHLIGHTS: readonly SharedAlarmMetricHighlightRule[] = [
  {
    selector: '.edumon-value-ecg',
    yellowLabels: ['LOW HEART RATE', 'HIGH HEART RATE'],
  },
  {
    selector: '.edumon-value-art',
    yellowLabels: ['HIGH ARTERIAL PRESSURE'],
    redLabels: ['LOW ARTERIAL PRESSURE'],
  },
  {
    selector: '.edumon-value-spo2',
    yellowLabels: ['HIGH SpO₂'],
    redLabels: ['LOW SpO₂'],
  },
]
