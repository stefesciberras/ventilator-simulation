from pathlib import Path

app_path = Path('src/App.tsx')
app = app_path.read_text()

anchor = """  const eventMeasures = useMemo(\n    () => calculateEventMeasurements(measurementSamples, alarmLimits.apneaTime, currentSimulationTime),\n    [measurementSamples, alarmLimits.apneaTime, currentSimulationTime],\n  )\n"""
insert = anchor + """  let latestNonZeroVolumeTime: number | null = null\n  for (let index = measurementSamples.length - 1; index >= 0; index -= 1) {\n    const sample = measurementSamples[index]\n    if (sample.time < scenarioClockOriginRef.current) break\n    if (Math.abs(sample.volume) > 1) {\n      latestNonZeroVolumeTime = sample.time\n      break\n    }\n  }\n  const volumeZeroDuration = latestNonZeroVolumeTime == null\n    ? scenarioElapsedTime\n    : Math.max(0, currentSimulationTime - latestNonZeroVolumeTime)\n  const tidalVolumeDisplayAvailable = volumeZeroDuration <= 10\n"""
if app.count(anchor) != 1:
    raise SystemExit(f'eventMeasures anchor count {app.count(anchor)}')
app = app.replace(anchor, insert, 1)

old_alarm = """  const tidalVolumeAlarmValue = eventMeasures.tidalVolume\n  const tidalVolumeAvailable = tidalVolumeAlarmValue > 0\n  const tidalVolumeLowAlarmActive = tidalVolumeAvailable && tidalVolumeAlarmValue < alarmLimits.tidalVolumeMin\n  const tidalVolumeHighAlarmActive = tidalVolumeAvailable && tidalVolumeAlarmValue > alarmLimits.tidalVolumeMax\n  const respiratoryRateAvailable = eventMeasures.respiratoryRate > 0 || currentSimulationTime >= 5\n  const respiratoryRateLowAlarmActive = respiratoryRateAvailable && eventMeasures.respiratoryRate < alarmLimits.respiratoryRateMin\n  const respiratoryRateHighAlarmActive = respiratoryRateAvailable && eventMeasures.respiratoryRate > alarmLimits.respiratoryRateMax\n  // Reserved for upcoming scenario/instructor controls.\n  const oxygenFailureActive = false\n\n  const alarmConditions = {\n    apnea: apneaAlarmActive,\n    pressure: pressureAlarmActive,\n    minuteVentilationLow: minuteVentilationLowAlarmActive,\n    minuteVentilationHigh: minuteVentilationHighAlarmActive,\n    tidalVolumeLow: tidalVolumeLowAlarmActive,\n    tidalVolumeHigh: tidalVolumeHighAlarmActive,\n    respiratoryRateLow: respiratoryRateLowAlarmActive,\n    respiratoryRateHigh: respiratoryRateHighAlarmActive,\n    oxygenFailure: oxygenFailureActive,\n  }\n"""
new_alarm = """  const tidalVolumeAlarmValue = eventMeasures.tidalVolume\n  const tidalVolumeAvailable = tidalVolumeDisplayAvailable && tidalVolumeAlarmValue > 0\n  const tidalVolumeLowAlarmActive = tidalVolumeAvailable && tidalVolumeAlarmValue < alarmLimits.tidalVolumeMin\n  const tidalVolumeHighAlarmActive = tidalVolumeAvailable && tidalVolumeAlarmValue > alarmLimits.tidalVolumeMax\n  const respiratoryRateAvailable = eventMeasures.respiratoryRate > 0 || currentSimulationTime >= 5\n  const respiratoryRateLowAlarmActive = respiratoryRateAvailable && eventMeasures.respiratoryRate < alarmLimits.respiratoryRateMin\n  const respiratoryRateHighAlarmActive = respiratoryRateAvailable && eventMeasures.respiratoryRate > alarmLimits.respiratoryRateMax\n  // Reserved for upcoming scenario/instructor controls.\n  const oxygenFailureActive = false\n\n  // Once apnoea is established it is the dominant ventilatory alarm. Secondary\n  // pressure/volume/rate/minute-ventilation alarms are suppressed until breaths\n  // resume; oxygen failure remains independent and must still be annunciated.\n  const suppressSecondaryAlarmsForApnea = apneaAlarmActive\n  const alarmConditions = {\n    apnea: apneaAlarmActive,\n    pressure: !suppressSecondaryAlarmsForApnea && pressureAlarmActive,\n    minuteVentilationLow: !suppressSecondaryAlarmsForApnea && minuteVentilationLowAlarmActive,\n    minuteVentilationHigh: !suppressSecondaryAlarmsForApnea && minuteVentilationHighAlarmActive,\n    tidalVolumeLow: !suppressSecondaryAlarmsForApnea && tidalVolumeLowAlarmActive,\n    tidalVolumeHigh: !suppressSecondaryAlarmsForApnea && tidalVolumeHighAlarmActive,\n    respiratoryRateLow: !suppressSecondaryAlarmsForApnea && respiratoryRateLowAlarmActive,\n    respiratoryRateHigh: !suppressSecondaryAlarmsForApnea && respiratoryRateHighAlarmActive,\n    oxygenFailure: oxygenFailureActive,\n  }\n"""
if app.count(old_alarm) != 1:
    raise SystemExit(f'alarm block count {app.count(old_alarm)}')
app = app.replace(old_alarm, new_alarm, 1)

old_keys = """  const activeAlarmKeys = Object.entries(alarmConditions).filter(([, active]) => active).map(([key]) => key)\n  const resolvedYellowKeys = Object.entries(alarmLifecycle)\n    .filter(([, entry]) => entry.resolvedAt != null && alarmClock - entry.resolvedAt < 10000)\n    .map(([key]) => key)\n  const greyAlarmKeys = Object.entries(alarmLifecycle)\n    .filter(([, entry]) => entry.resolvedAt != null && alarmClock - entry.resolvedAt >= 10000 && alarmClock - entry.resolvedAt < 120000 && !entry.acknowledged)\n    .map(([key]) => key)\n"""
new_keys = """  const alarmVisibleDuringApnea = (key: string) => !apneaAlarmActive || key === 'apnea' || key === 'oxygenFailure'\n  const activeAlarmKeys = Object.entries(alarmConditions).filter(([, active]) => active).map(([key]) => key)\n  const resolvedYellowKeys = Object.entries(alarmLifecycle)\n    .filter(([key, entry]) => alarmVisibleDuringApnea(key) && entry.resolvedAt != null && alarmClock - entry.resolvedAt < 10000)\n    .map(([key]) => key)\n  const greyAlarmKeys = Object.entries(alarmLifecycle)\n    .filter(([key, entry]) => alarmVisibleDuringApnea(key) && entry.resolvedAt != null && alarmClock - entry.resolvedAt >= 10000 && alarmClock - entry.resolvedAt < 120000 && !entry.acknowledged)\n    .map(([key]) => key)\n"""
if app.count(old_keys) != 1:
    raise SystemExit(f'alarm key block count {app.count(old_keys)}')
app = app.replace(old_keys, new_keys, 1)

old_vte = '<Metric label="VTe" value={eventMeasures.tidalVolume.toFixed(0)} unit="mL" />'
new_vte = '<Metric label="VTe" value={tidalVolumeDisplayAvailable ? eventMeasures.tidalVolume.toFixed(0) : \'—\'} unit={tidalVolumeDisplayAvailable ? \'mL\' : \'\'} />'
if app.count(old_vte) != 1:
    raise SystemExit(f'VTe display count {app.count(old_vte)}')
app = app.replace(old_vte, new_vte, 1)

app = app.replace("appVersion: '0.70'", "appVersion: '0.71'")
app = app.replace('v0.70', 'v0.71')
app_path.write_text(app)

for path_string in [
    'src/diagnostics.ts',
    'src/components/InstructorAccountControls.tsx',
    'src/components/SessionPanel.tsx',
]:
    path = Path(path_string)
    text = path.read_text()
    text = text.replace("'0.70'", "'0.71'").replace('v0.70', 'v0.71')
    path.write_text(text)

print('v0.71 patch applied')
