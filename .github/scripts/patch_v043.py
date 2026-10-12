from pathlib import Path

p = Path('src/App.tsx')
text = p.read_text()

# Mobile: capture pointer interaction on both handles so vertical dragging is owned by the control.
text = text.replace(
'''<input className="vertical-dual-input low" type="range" min={min} max={max} step={step} value={low} onChange={(event) => onLowChange(Number(event.target.value))} aria-label={`${label} minimum alarm limit`} />''',
'''<input className="vertical-dual-input low" type="range" min={min} max={max} step={step} value={low} onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onChange={(event) => onLowChange(Number(event.target.value))} aria-label={`${label} minimum alarm limit`} />''',
1)
text = text.replace(
'''<input className="vertical-dual-input high" type="range" min={min} max={max} step={step} value={high} onChange={(event) => onHighChange(Number(event.target.value))} aria-label={`${label} maximum alarm limit`} />''',
'''<input className="vertical-dual-input high" type="range" min={min} max={max} step={step} value={high} onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onChange={(event) => onHighChange(Number(event.target.value))} aria-label={`${label} maximum alarm limit`} />''',
1)

# Record whether each alarm has ever actually transitioned into an active state during this simulation.
old = '''  const alarmSilenceTimeoutRef = useRef<number | null>(null)\n  const audioContextRef = useRef<AudioContext | null>(null)\n'''
new = '''  const alarmSilenceTimeoutRef = useRef<number | null>(null)\n  const audioContextRef = useRef<AudioContext | null>(null)\n  const alarmHistoryRef = useRef<Record<string, { everTriggered: boolean; triggerCount: number; firstTriggeredAt: number | null; lastTriggeredAt: number | null }>>({})\n'''
if old not in text: raise SystemExit('refs marker not found')
text = text.replace(old, new, 1)

old = '''      for (const [key, active] of Object.entries(alarmConditions)) {\n        if (active && next[key] == null) { next[key] = currentSimulationTime; changed = true }\n        if (!active && next[key] != null) { next[key] = null; changed = true }\n      }\n'''
new = '''      for (const [key, active] of Object.entries(alarmConditions)) {\n        if (active && next[key] == null) {\n          next[key] = currentSimulationTime\n          changed = true\n          const previousHistory = alarmHistoryRef.current[key]\n          alarmHistoryRef.current[key] = {\n            everTriggered: true,\n            triggerCount: (previousHistory?.triggerCount ?? 0) + 1,\n            firstTriggeredAt: previousHistory?.firstTriggeredAt ?? currentSimulationTime,\n            lastTriggeredAt: currentSimulationTime,\n          }\n        }\n        if (!active && next[key] != null) { next[key] = null; changed = true }\n      }\n'''
if old not in text: raise SystemExit('alarm onset marker not found')
text = text.replace(old, new, 1)

# Give the tidal-volume alarm a named source value to make it explicit that it is driven by completed expired VT,
# not by the raw volume scalar peak.
old = '''  const tidalVolumeAvailable = eventMeasures.tidalVolume > 0\n  const tidalVolumeLowAlarmActive = tidalVolumeAvailable && eventMeasures.tidalVolume < alarmLimits.tidalVolumeMin\n  const tidalVolumeHighAlarmActive = tidalVolumeAvailable && eventMeasures.tidalVolume > alarmLimits.tidalVolumeMax\n'''
new = '''  const tidalVolumeAlarmValue = eventMeasures.tidalVolume\n  const tidalVolumeAvailable = tidalVolumeAlarmValue > 0\n  const tidalVolumeLowAlarmActive = tidalVolumeAvailable && tidalVolumeAlarmValue < alarmLimits.tidalVolumeMin\n  const tidalVolumeHighAlarmActive = tidalVolumeAvailable && tidalVolumeAlarmValue > alarmLimits.tidalVolumeMax\n'''
if old not in text: raise SystemExit('tidal alarm marker not found')
text = text.replace(old, new, 1)

# Enrich diagnostics with per-alarm source values, configured limits, current state and historical trigger status.
old = '''  const copyDiagnostics = async () => {\n    const copied = await copyDiagnosticSnapshot({\n      appVersion: '0.42',\n'''
new = '''  const copyDiagnostics = async () => {\n    const historyFor = (key: string) => alarmHistoryRef.current[key] ?? { everTriggered: false, triggerCount: 0, firstTriggeredAt: null, lastTriggeredAt: null }\n    const finiteVolumes = samples.map((sample) => sample.volume).filter(Number.isFinite)\n    const waveformVolumeMin = finiteVolumes.length ? Math.min(...finiteVolumes) : null\n    const waveformVolumeMax = finiteVolumes.length ? Math.max(...finiteVolumes) : null\n    const alarmEvaluations = [\n      { key: 'pressure', label: 'Peak pressure', priority: 'critical', value: eventMeasures.peakPressure, unit: 'cmH2O', limits: { high: alarmLimits.peakPressure }, active: pressureAlarmActive, history: historyFor('pressure') },\n      { key: 'minuteVentilation', label: 'Minute ventilation', priority: 'non-critical', value: measures.minuteVentilation, unit: 'L/min', limits: { low: alarmLimits.minuteVentilationMin, high: alarmLimits.minuteVentilationMax }, active: minuteVentilationLowAlarmActive || minuteVentilationHighAlarmActive, lowActive: minuteVentilationLowAlarmActive, highActive: minuteVentilationHighAlarmActive, history: { low: historyFor('minuteVentilationLow'), high: historyFor('minuteVentilationHigh') } },\n      { key: 'tidalVolume', label: 'Expired tidal volume', priority: 'non-critical', value: tidalVolumeAlarmValue, unit: 'mL', limits: { low: alarmLimits.tidalVolumeMin, high: alarmLimits.tidalVolumeMax }, active: tidalVolumeLowAlarmActive || tidalVolumeHighAlarmActive, lowActive: tidalVolumeLowAlarmActive, highActive: tidalVolumeHighAlarmActive, history: { low: historyFor('tidalVolumeLow'), high: historyFor('tidalVolumeHigh') } },\n      { key: 'respiratoryRate', label: 'Respiratory rate', priority: 'non-critical', value: eventMeasures.respiratoryRate, unit: '/min', limits: { low: alarmLimits.respiratoryRateMin, high: alarmLimits.respiratoryRateMax }, active: respiratoryRateLowAlarmActive || respiratoryRateHighAlarmActive, lowActive: respiratoryRateLowAlarmActive, highActive: respiratoryRateHighAlarmActive, history: { low: historyFor('respiratoryRateLow'), high: historyFor('respiratoryRateHigh') } },\n      { key: 'apnea', label: 'Apnoea', priority: 'critical', value: latestBreathStart == null ? currentSimulationTime : currentSimulationTime - latestBreathStart, unit: 's since breath', limits: { high: alarmLimits.apneaTime }, active: apneaAlarmActive, history: historyFor('apnea') },\n    ]\n    const copied = await copyDiagnosticSnapshot({\n      appVersion: '0.43',\n'''
if old not in text: raise SystemExit('copy diagnostic marker not found')
text = text.replace(old, new, 1)

old = '''        oxygenFailureActive,\n        level: alarmLevel,\n        labels: alarmLabels,\n        onsets: alarmOnsets,\n      },\n      measurements: {\n'''
new = '''        oxygenFailureActive,\n        level: alarmLevel,\n        labels: alarmLabels,\n        onsets: alarmOnsets,\n        evaluations: alarmEvaluations,\n      },\n      measurements: {\n'''
if old not in text: raise SystemExit('diagnostic alarm marker not found')
text = text.replace(old, new, 1)

old = '''        autoPeepCmH2O: measures.autoPeep,\n      },\n      cursor: { index: traceCursor, selectedSample: selectedSample ?? null },\n'''
new = '''        autoPeepCmH2O: measures.autoPeep,\n      },\n      waveformSummary: {\n        visibleVolumeMinMl: waveformVolumeMin,\n        visibleVolumeMaxMl: waveformVolumeMax,\n        tidalVolumeAlarmSourceMl: tidalVolumeAlarmValue,\n        tidalVolumeAlarmLimitsMl: { low: alarmLimits.tidalVolumeMin, high: alarmLimits.tidalVolumeMax },\n      },\n      cursor: { index: traceCursor, selectedSample: selectedSample ?? null },\n'''
if old not in text: raise SystemExit('diagnostic waveform summary marker not found')
text = text.replace(old, new, 1)

if '<span className="version">v0.42</span>' not in text: raise SystemExit('version marker not found')
text = text.replace('<span className="version">v0.42</span>', '<span className="version">v0.43</span>', 1)
p.write_text(text)

p = Path('src/alarm.css')
css = p.read_text()
css += '''\n/* Mobile alarm controls: prevent the page from stealing vertical drags from range handles. */\n.vertical-dual-slider-wrap,\n.vertical-dual-range,\n.vertical-dual-input,\n.vertical-slider-wrap,\n.vertical-alarm-slider {\n  touch-action: none;\n  overscroll-behavior: contain;\n  -webkit-user-select: none;\n  user-select: none;\n}\n.vertical-dual-input { -webkit-tap-highlight-color: transparent; }\n'''
p.write_text(css)
