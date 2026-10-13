from pathlib import Path

app_path = Path('src/App.tsx')
app = app_path.read_text()

anchor = "  const [candidateAlarmLevelForSession, setCandidateAlarmLevelForSession] = useState<CandidateAlarmLevel>(null)\n  const scenarioClockOriginRef = useRef(WINDOW_SAMPLES * DT)\n"
replacement = "  const [candidateAlarmLevelForSession, setCandidateAlarmLevelForSession] = useState<CandidateAlarmLevel>(null)\n  const scenarioClockOriginRef = useRef(WINDOW_SAMPLES * DT)\n  const previousApneaAlarmActiveRef = useRef(false)\n"
if anchor not in app:
    raise SystemExit('Could not find apnea ref anchor')
app = app.replace(anchor, replacement, 1)

alarm_anchor = """  const alarmConditions = {
    apnea: apneaAlarmActive,
    pressure: !suppressSecondaryAlarmsForApnea && pressureAlarmActive,
    minuteVentilationLow: !suppressSecondaryAlarmsForApnea && minuteVentilationLowAlarmActive,
    minuteVentilationHigh: !suppressSecondaryAlarmsForApnea && minuteVentilationHighAlarmActive,
    tidalVolumeLow: !suppressSecondaryAlarmsForApnea && tidalVolumeLowAlarmActive,
    tidalVolumeHigh: !suppressSecondaryAlarmsForApnea && tidalVolumeHighAlarmActive,
    respiratoryRateLow: !suppressSecondaryAlarmsForApnea && respiratoryRateLowAlarmActive,
    respiratoryRateHigh: !suppressSecondaryAlarmsForApnea && respiratoryRateHighAlarmActive,
    oxygenFailure: oxygenFailureActive,
  }

"""
recovery_block = alarm_anchor + """  // Alarm annunciation is episode-scoped. When a breath resolves apnoea, do not
  // resurrect alarm-lifecycle entries that were resolved/suppressed during the
  // apnoeic episode. Clear those stale annunciations immediately, then let the
  // ordinary alarm evaluator below add back only conditions that are genuinely
  // active in the recovered ventilation state. O2 failure is deliberately kept.
  const apneaJustResolved = previousApneaAlarmActiveRef.current && !apneaAlarmActive
  useEffect(() => {
    const wasActive = previousApneaAlarmActiveRef.current
    previousApneaAlarmActiveRef.current = apneaAlarmActive
    if (!wasActive || apneaAlarmActive) return

    const staleApneaEpisodeKeys = new Set([
      'apnea',
      'pressure',
      'co2Low',
      'co2High',
      'minuteVentilationLow',
      'minuteVentilationHigh',
      'tidalVolumeLow',
      'tidalVolumeHigh',
      'respiratoryRateLow',
      'respiratoryRateHigh',
    ])

    setAlarmLifecycle((current) => {
      let changed = false
      const next = { ...current }
      for (const key of staleApneaEpisodeKeys) {
        if (key in next) {
          delete next[key]
          changed = true
        }
      }
      return changed ? next : current
    })

    setAlarmOnsets((current) => {
      let changed = false
      const next = { ...current }
      for (const key of staleApneaEpisodeKeys) {
        if (next[key] != null) {
          next[key] = null
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [apneaAlarmActive])

"""
if alarm_anchor not in app:
    raise SystemExit('Could not find alarmConditions anchor')
app = app.replace(alarm_anchor, recovery_block, 1)

old_yellow = ".filter(([key, entry]) => alarmVisibleDuringApnea(key) && entry.resolvedAt != null && alarmClock - entry.resolvedAt < 10000)"
new_yellow = ".filter(([key, entry]) => !apneaJustResolved && alarmVisibleDuringApnea(key) && entry.resolvedAt != null && alarmClock - entry.resolvedAt < 10000)"
old_grey = ".filter(([key, entry]) => alarmVisibleDuringApnea(key) && entry.resolvedAt != null && alarmClock - entry.resolvedAt >= 10000 && alarmClock - entry.resolvedAt < 120000 && !entry.acknowledged)"
new_grey = ".filter(([key, entry]) => !apneaJustResolved && alarmVisibleDuringApnea(key) && entry.resolvedAt != null && alarmClock - entry.resolvedAt >= 10000 && alarmClock - entry.resolvedAt < 120000 && !entry.acknowledged)"
if old_yellow not in app or old_grey not in app:
    raise SystemExit('Could not find resolved alarm filters')
app = app.replace(old_yellow, new_yellow, 1).replace(old_grey, new_grey, 1)

app = app.replace("appVersion: '0.71'", "appVersion: '0.72'")
app = app.replace('<span className="version">v0.71</span>', '<span className="version">v0.72</span>')
app_path.write_text(app)

for filename in ['src/components/InstructorAccountControls.tsx', 'src/components/SessionPanel.tsx', 'src/diagnostics.ts']:
    path = Path(filename)
    text = path.read_text()
    text = text.replace('v0.71', 'v0.72').replace("'0.71'", "'0.72'")
    path.write_text(text)
