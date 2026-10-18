import fs from 'node:fs'

function edit(path, changes) {
  let text = fs.readFileSync(path, 'utf8')
  for (const { from, to, label } of changes) {
    if (!text.includes(from)) throw new Error(`${path}: missing ${label}`)
    text = text.replace(from, to)
  }
  fs.writeFileSync(path, text)
}

edit('src/teaching/TeachingLaserPointer.tsx', [
  {
    label: 'export metric snapshot type',
    from: "interface TeachingMetricSnapshot {\n",
    to: "export interface TeachingMetricSnapshot {\n",
  },
  {
    label: 'surface callback prop signature',
    from: "  onEnabledChange,\n}: {\n  role: TeachingRole\n  sessionId: string | null\n  enabled: boolean\n  onEnabledChange?: (enabled: boolean) => void\n}) {",
    to: "  onEnabledChange,\n  onSharedMetricsChange,\n}: {\n  role: TeachingRole\n  sessionId: string | null\n  enabled: boolean\n  onEnabledChange?: (enabled: boolean) => void\n  onSharedMetricsChange?: (metrics: TeachingMetricSnapshot[] | null) => void\n}) {",
  },
  {
    label: 'publish metrics effect',
    from: "  const displayed = isController ? localPointer : remotePointer\n  const sharedSnapshot = role === 'candidate' ? remoteSnapshot : localSnapshot\n",
    to: "  const displayed = isController ? localPointer : remotePointer\n  const sharedSnapshot = role === 'candidate' ? remoteSnapshot : localSnapshot\n\n  useEffect(() => {\n    onSharedMetricsChange?.(sharedSnapshot?.metrics?.length ? sharedSnapshot.metrics : null)\n    return () => onSharedMetricsChange?.(null)\n  }, [sharedSnapshot, onSharedMetricsChange])\n",
  },
  {
    label: 'remove metrics position',
    from: "  const sharedMetricsPosition = (() => {\n    const surface = surfaceRef.current\n    if (!surface || !sharedSnapshot || !sharedSnapshot.metrics.length) return null\n    const surfaceRect = surface.getBoundingClientRect()\n    const rect = regionRectFor(surface, 'metrics')\n    return {\n      left: `${rect.left - surfaceRect.left}px`,\n      top: `${rect.top - surfaceRect.top}px`,\n      width: `${rect.width}px`,\n      height: `${rect.height}px`,\n    }\n  })()\n",
    to: "",
  },
  {
    label: 'remove synthetic metrics overlay',
    from: "        {sharedSnapshot && sharedMetricsPosition && (\n          <div className=\"teaching-shared-metrics-frame\" style={sharedMetricsPosition}>\n            <span className=\"teaching-shared-metrics-badge\">Instructor measured values</span>\n            <div className=\"teaching-shared-metrics-list\">\n              {sharedSnapshot.metrics.map((metric, index) => (\n                <div key={`${sharedSnapshot.frameId}-metric-${index}`} className={`teaching-shared-metric ${metric.className.includes('metric-alarm-red') ? 'alarm-red' : metric.className.includes('metric-alarm-yellow') ? 'alarm-yellow' : ''}`}>\n                  <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.unit}</small>\n                </div>\n              ))}\n            </div>\n          </div>\n        )}\n",
    to: "",
  },
])

edit('src/teaching/useTeachingSharedWaveformFreeze.ts', [
  {
    label: 'candidate reset on channel change',
    from: "    setActiveState(false)\n    activeRef.current = false\n\n    if (!sessionId || role === 'standalone') return\n",
    to: "    setActiveState(false)\n    activeRef.current = false\n    if (role === 'candidate') candidateHandlerRef.current(false)\n\n    if (!sessionId || role === 'standalone') return\n",
  },
  {
    label: 'authoritative heartbeat',
    from: "  const setActive = useCallback((next: boolean) => {\n",
    to: "  useEffect(() => {\n    if (role !== 'instructor' || !sessionId) return\n    const timer = window.setInterval(() => broadcastState(activeRef.current), 1000)\n    return () => window.clearInterval(timer)\n  }, [broadcastState, role, sessionId])\n\n  const setActive = useCallback((next: boolean) => {\n",
  },
  {
    label: 'repeat immediate resume state',
    from: "    broadcastState(next)\n  }, [broadcastState, role, sessionId])\n",
    to: "    broadcastState(next)\n    if (!next) {\n      window.setTimeout(() => broadcastState(false), 120)\n      window.setTimeout(() => broadcastState(false), 400)\n    }\n  }, [broadcastState, role, sessionId])\n",
  },
])

edit('src/App.tsx', [
  {
    label: 'import metric snapshot type',
    from: "import { TeachingCandidateOverlay, TeachingInstructorWorkspace, TeachingLaserPointerSurface, TeachingMediaInstructorPanel, eduventTeachingHost, useTeachingPrompts, useTeachingQuestionLibrary } from './teaching'",
    to: "import { TeachingCandidateOverlay, TeachingInstructorWorkspace, TeachingLaserPointerSurface, TeachingMediaInstructorPanel, eduventTeachingHost, useTeachingPrompts, useTeachingQuestionLibrary, type TeachingMetricSnapshot } from './teaching'",
  },
  {
    label: 'laser metric state',
    from: "  const [teachingLaserEnabled, setTeachingLaserEnabled] = useState(false)\n",
    to: "  const [teachingLaserEnabled, setTeachingLaserEnabled] = useState(false)\n  const [teachingLaserMetrics, setTeachingLaserMetrics] = useState<TeachingMetricSnapshot[] | null>(null)\n",
  },
  {
    label: 'clear metrics when laser off',
    from: "  useEffect(() => {\n    if (teachingSession.role !== 'instructor') setTeachingLaserEnabled(false)\n  }, [teachingSession.role])\n",
    to: "  useEffect(() => {\n    if (teachingSession.role !== 'instructor') setTeachingLaserEnabled(false)\n  }, [teachingSession.role])\n\n  useEffect(() => {\n    if (!teachingLaserEnabled && teachingSession.role !== 'candidate') setTeachingLaserMetrics(null)\n  }, [teachingLaserEnabled, teachingSession.role])\n",
  },
  {
    label: 'laser metrics lookup helper',
    from: "  const currentInstructorScenario: InstructorScenarioSnapshot = {\n",
    to: "  const teachingMetric = (label: string) => teachingLaserMetrics?.find((metric) => metric.label === label) ?? null\n\n  const currentInstructorScenario: InstructorScenarioSnapshot = {\n",
  },
  {
    label: 'laser callback',
    from: "              enabled={teachingLaserEnabled}\n              onEnabledChange={setTeachingLaserEnabled}\n            />",
    to: "              enabled={teachingLaserEnabled}\n              onEnabledChange={setTeachingLaserEnabled}\n              onSharedMetricsChange={setTeachingLaserMetrics}\n            />",
  },
  {
    label: 'normal metric panel values',
    from: "              <Metric label=\"Ppeak\" value={eventMeasures.peakPressure.toFixed(0)} unit=\"cmH₂O\" alarmLevel={ppeakMetricAlarm} />\n              <Metric label=\"VTe\" value={tidalVolumeDisplayAvailable ? eventMeasures.tidalVolume.toFixed(0) : '-'} unit={tidalVolumeDisplayAvailable ? 'mL' : ''} alarmLevel={tidalVolumeMetricAlarm} />\n              <Metric label=\"RR\" value={eventMeasures.respiratoryRate.toFixed(0)} unit=\"/min\" alarmLevel={respiratoryRateMetricAlarm} />\n              <Metric label=\"MV\" value={measures.minuteVentilation.toFixed(1)} unit=\"L/min\" alarmLevel={minuteVentilationMetricAlarm} />\n              <Metric label=\"PEEP\" value={measures.peep.toFixed(0)} unit=\"cmH₂O\" />\n              <Metric label=\"Pmean\" value={slowDisplayMeasurements.meanPressure == null ? '—' : slowDisplayMeasurements.meanPressure.toFixed(1)} unit=\"cmH₂O\" />\n              <Metric label=\"I:E measured\" value={measuredIERatio == null ? '—' : `1:${measuredIERatio.toFixed(1)}`} unit=\"\" />",
    to: "              <Metric label=\"Ppeak\" value={teachingMetric('Ppeak')?.value ?? eventMeasures.peakPressure.toFixed(0)} unit={teachingMetric('Ppeak')?.unit ?? 'cmH₂O'} alarmLevel={teachingMetric('Ppeak')?.className.includes('metric-alarm-red') ? 'red' : teachingMetric('Ppeak')?.className.includes('metric-alarm-yellow') ? 'yellow' : ppeakMetricAlarm} />\n              <Metric label=\"VTe\" value={teachingMetric('VTe')?.value ?? (tidalVolumeDisplayAvailable ? eventMeasures.tidalVolume.toFixed(0) : '-')} unit={teachingMetric('VTe')?.unit ?? (tidalVolumeDisplayAvailable ? 'mL' : '')} alarmLevel={teachingMetric('VTe')?.className.includes('metric-alarm-red') ? 'red' : teachingMetric('VTe')?.className.includes('metric-alarm-yellow') ? 'yellow' : tidalVolumeMetricAlarm} />\n              <Metric label=\"RR\" value={teachingMetric('RR')?.value ?? eventMeasures.respiratoryRate.toFixed(0)} unit={teachingMetric('RR')?.unit ?? '/min'} alarmLevel={teachingMetric('RR')?.className.includes('metric-alarm-red') ? 'red' : teachingMetric('RR')?.className.includes('metric-alarm-yellow') ? 'yellow' : respiratoryRateMetricAlarm} />\n              <Metric label=\"MV\" value={teachingMetric('MV')?.value ?? measures.minuteVentilation.toFixed(1)} unit={teachingMetric('MV')?.unit ?? 'L/min'} alarmLevel={teachingMetric('MV')?.className.includes('metric-alarm-red') ? 'red' : teachingMetric('MV')?.className.includes('metric-alarm-yellow') ? 'yellow' : minuteVentilationMetricAlarm} />\n              <Metric label=\"PEEP\" value={teachingMetric('PEEP')?.value ?? measures.peep.toFixed(0)} unit={teachingMetric('PEEP')?.unit ?? 'cmH₂O'} />\n              <Metric label=\"Pmean\" value={teachingMetric('Pmean')?.value ?? (slowDisplayMeasurements.meanPressure == null ? '—' : slowDisplayMeasurements.meanPressure.toFixed(1))} unit={teachingMetric('Pmean')?.unit ?? 'cmH₂O'} />\n              <Metric label=\"I:E measured\" value={teachingMetric('I:E measured')?.value ?? (measuredIERatio == null ? '—' : `1:${measuredIERatio.toFixed(1)}`)} unit={teachingMetric('I:E measured')?.unit ?? ''} />",
  },
  {
    label: 'gas metrics override',
    from: "              <GasMetric\n                etco2={endTidalCO2 == null ? '-' : endTidalCO2.toFixed(0)}\n                spo2={latestSample?.spo2 == null ? '—' : latestSample.spo2.toFixed(0)}\n                spo2AlarmLevel={spo2MetricAlarm}\n              />",
    to: "              <GasMetric\n                etco2={teachingMetric('EtCO₂')?.value ?? (endTidalCO2 == null ? '-' : endTidalCO2.toFixed(0))}\n                spo2={teachingMetric('SpO₂')?.value ?? (latestSample?.spo2 == null ? '—' : latestSample.spo2.toFixed(0))}\n                spo2AlarmLevel={teachingMetric('SpO₂')?.className.includes('metric-alarm-red') ? 'red' : teachingMetric('SpO₂')?.className.includes('metric-alarm-yellow') ? 'yellow' : spo2MetricAlarm}\n              />",
  },
])

edit('src/appVersion.ts', [
  { label: 'version bump', from: "export const APP_VERSION = '0.82.9.4'", to: "export const APP_VERSION = '0.82.9.5'" },
])

console.log('Applied v0.82.9.5 fixes')
