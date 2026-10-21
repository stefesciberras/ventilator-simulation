import fs from 'node:fs'

function read(path) { return fs.readFileSync(path, 'utf8') }
function write(path, text) { fs.writeFileSync(path, text) }
function replaceOnce(text, search, replacement, label) {
  const count = text.split(search).length - 1
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`)
  return text.replace(search, replacement)
}
function replaceRegexOnce(text, regex, replacement, label) {
  const matches = [...text.matchAll(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`))]
  if (matches.length !== 1) throw new Error(`${label}: expected one match, found ${matches.length}`)
  return text.replace(regex, replacement)
}

// ---- EDUVENT alarms: keep clinical threshold evaluation in App; move lifecycle/session/audio to shared core.
{
  const path = 'src/App.tsx'
  let s = read(path)
  s = replaceOnce(s,
    "import { SharedTeachingTab, TeachingCandidateOverlay, TeachingLaserPointerSurface, eduventTeachingHost, useTeachingAlarmSync, useTeachingPrompts, useTeachingQuestionLibrary, type TeachingMetricSnapshot } from './teaching'",
    "import { SharedTeachingTab, TeachingCandidateOverlay, TeachingLaserPointerSurface, eduventTeachingHost, useTeachingPrompts, useTeachingQuestionLibrary, type TeachingMetricSnapshot } from './teaching'\nimport { useSharedAlarmController, type SharedAlarmEvaluation } from './alarms/useSharedAlarmController'\nimport { SharedAlarmBanner } from './alarms/SharedAlarmBanner'",
    'App alarm imports')
  s = replaceOnce(s, "  const [alarmSilenced, setAlarmSilenced] = useState(false)\n  const [alarmClock, setAlarmClock] = useState(() => Date.now())\n  const [alarmLifecycle, setAlarmLifecycle] = useState<Record<string, { activeSince: number | null; resolvedAt: number | null; acknowledged: boolean }>>({})\n", '', 'App alarm local state')
  s = replaceOnce(s, "  const previousApneaAlarmActiveRef = useRef(false)\n", '', 'App apnea lifecycle ref')
  s = replaceOnce(s, "  const alarmSilenceTimeoutRef = useRef<number | null>(null)\n", '', 'App alarm silence timeout ref')
  s = replaceOnce(s, "  const audioContextRef = useRef<AudioContext | null>(null)\n", '', 'App audio ref')
  s = replaceRegexOnce(s,
    /\n  const teachingAlarmSync = useTeachingAlarmSync\([\s\S]*?\n  \)\n\n  const candidateControlsVisible/,
    '\n  const candidateControlsVisible',
    'App teaching alarm sync block')

  const sharedAlarmBlock = `  const alarmEvaluations = useMemo<SharedAlarmEvaluation[]>(() => [
    { key: 'apnea', label: 'APNOEA', active: apneaAlarmActive, priority: 'critical' },
    { key: 'pressureLimit', label: 'PRESSURE LIMIT', active: pressureLimitAlarmActive, priority: 'critical', immediateCritical: true },
    { key: 'pressure', label: 'HIGH PRESSURE', active: pressureAlarmActive, priority: 'critical', visible: !suppressSecondaryAlarmsForApnea },
    { key: 'minuteVentilationLow', label: 'LOW MINUTE VENTILATION', active: minuteVentilationLowAlarmActive, visible: !suppressSecondaryAlarmsForApnea },
    { key: 'minuteVentilationHigh', label: 'HIGH MINUTE VENTILATION', active: minuteVentilationHighAlarmActive, visible: !suppressSecondaryAlarmsForApnea },
    { key: 'tidalVolumeLow', label: 'LOW TIDAL VOLUME', active: tidalVolumeLowAlarmActive, visible: !suppressSecondaryAlarmsForApnea },
    { key: 'tidalVolumeHigh', label: 'HIGH TIDAL VOLUME', active: tidalVolumeHighAlarmActive, visible: !suppressSecondaryAlarmsForApnea },
    { key: 'respiratoryRateLow', label: 'LOW RESPIRATORY RATE', active: respiratoryRateLowAlarmActive, visible: !suppressSecondaryAlarmsForApnea },
    { key: 'respiratoryRateHigh', label: 'HIGH RESPIRATORY RATE', active: respiratoryRateHighAlarmActive, visible: !suppressSecondaryAlarmsForApnea },
    { key: 'oxygenFailure', label: 'OXYGEN FAILURE', active: oxygenFailureActive, priority: 'critical' },
  ], [apneaAlarmActive, pressureLimitAlarmActive, pressureAlarmActive, minuteVentilationLowAlarmActive, minuteVentilationHighAlarmActive, tidalVolumeLowAlarmActive, tidalVolumeHighAlarmActive, respiratoryRateLowAlarmActive, respiratoryRateHighAlarmActive, oxygenFailureActive, suppressSecondaryAlarmsForApnea])

  useEffect(() => {
    setAlarmOnsets((current) => {
      let changed = false
      const next = { ...current }
      for (const [key, active] of Object.entries(alarmConditions)) {
        if (active && next[key] == null) {
          next[key] = currentSimulationTime
          changed = true
          const previousHistory = alarmHistoryRef.current[key]
          alarmHistoryRef.current[key] = {
            everTriggered: true,
            triggerCount: (previousHistory?.triggerCount ?? 0) + 1,
            firstTriggeredAt: previousHistory?.firstTriggeredAt ?? currentSimulationTime,
            lastTriggeredAt: currentSimulationTime,
          }
        }
        if (!active && next[key] != null) { next[key] = null; changed = true }
      }
      return changed ? next : current
    })
  }, [apneaAlarmActive, pressureLimitAlarmActive, pressureAlarmActive, minuteVentilationLowAlarmActive, minuteVentilationHighAlarmActive, tidalVolumeLowAlarmActive, tidalVolumeHighAlarmActive, respiratoryRateLowAlarmActive, respiratoryRateHighAlarmActive, oxygenFailureActive, currentSimulationTime])

  const alarmController = useSharedAlarmController({
    role: teachingSession.role,
    sessionId: teachingSession.session?.id ?? null,
    policy: {
      syncAlarms: Boolean(teachingSession.session?.sync_alarms),
      candidateCanEditAlarms: Boolean(teachingSession.session?.candidate_can_edit_alarms),
      alarmsSilent: Boolean(teachingSession.session?.alarms_silent),
    },
    evaluations: alarmEvaluations,
    paused: simulationPaused,
    onAudibleLevelChange: setCandidateAlarmLevelForSession,
  })
  const alarmLifecycle = alarmController.lifecycle
  const audibleAlarmLevel: CandidateAlarmLevel = alarmController.audibleLevel
  const alarmLevel = alarmController.level
  const alarmSilenced = alarmController.silenced
  const visibleAlarmKeys = alarmController.visibleKeys
  const measurementAlarmNeedsAttention = alarmController.needsAttention
  const alarmLabels = alarmController.labels
`

  s = replaceRegexOnce(s,
    /  \/\/ Alarm annunciation is episode-scoped\.[\s\S]*?\n  useEffect\(\(\) => \{\n    if \(!audibleAlarmLevel \|\| alarmSilenced \|\| simulationPaused \|\| teachingSession\.candidateAlarmsSilent\) return[\s\S]*?\n  \}, \[audibleAlarmLevel, alarmSilenced, simulationPaused, teachingSession\.candidateAlarmsSilent\]\)\n/,
    sharedAlarmBlock,
    'App alarm lifecycle block')

  s = replaceOnce(s, "    if (alarmSilenceTimeoutRef.current != null) window.clearTimeout(alarmSilenceTimeoutRef.current)\n", '', 'App cleanup alarm timeout')
  s = replaceOnce(s, "    void audioContextRef.current?.close()\n", '', 'App cleanup audio')
  s = replaceRegexOnce(s,
    /  const silenceAlarm = \(durationMs = 120000\) => \{[\s\S]*?\n  \}\n\n  const clearAlarmSilenceLongPress/,
    "  const silenceAlarm = (durationMs = 120000) => alarmController.silenceFor(durationMs)\n\n  const clearAlarmSilenceLongPress",
    'App silence function')
  s = replaceRegexOnce(s,
    /\{alarmLevel && \(\n                <div className=\{`alarm-banner \$\{alarmLevel\}`\} role="alert">\n                  <strong>\{alarmLabels\.join\(' • '\)\}<\/strong>\n                  \{\(alarmSilenced \|\| teachingSession\.candidateAlarmsSilent\) && <span>ALARM SILENT<\/span>\}\n                <\/div>\n              \)\}/,
    '<SharedAlarmBanner level={alarmLevel} labels={alarmLabels} silenced={alarmSilenced || teachingSession.candidateAlarmsSilent} />',
    'App alarm banner')
  write(path, s)
}

// ---- EDUMON: shared alarm controller + shared self-directed envelope/presentation.
{
  const path = 'src/edumon/EdumonApp.tsx'
  let s = read(path)
  s = replaceOnce(s,
    "import { SharedBasicSessionPanel, deriveAlarmSessionSemantics, useProductTeachingSession, useTeachingAlarmSync } from '../teaching/session'",
    "import { SharedBasicSessionPanel, useProductTeachingSession } from '../teaching/session'\nimport { useSharedAlarmController } from '../alarms/useSharedAlarmController'\nimport { SharedAlarmBanner } from '../alarms/SharedAlarmBanner'\nimport { evaluateEdumonAlarms } from './alarmDefinitions'",
    'EDUMON alarm imports')
  s = replaceOnce(s,
    "import { selfDirectedAssignmentUrl, startSelfDirectedRun, updateSelfDirectedRun } from '../selfDirectedAssignments'",
    "import { useSharedSelfDirectedScenario } from '../teaching/scenario/useSharedSelfDirectedScenario'",
    'EDUMON assignment import')
  s = replaceOnce(s, "  const [alarmSilencedUntil, setAlarmSilencedUntil] = useState<number | null>(null)\n  const [alarmSilenceRemaining, setAlarmSilenceRemaining] = useState(0)\n", '', 'EDUMON alarm state')
  s = replaceOnce(s, "  const launchedAssignmentRef = useRef<string | null>(null)\n  const [selfDirectedRunId, setSelfDirectedRunId] = useState<string | null>(null)\n", '', 'EDUMON assignment state')
  s = replaceOnce(s, "  const alarmSilenceTimeoutRef = useRef<number | null>(null)\n", '', 'EDUMON alarm timeout ref')
  s = replaceRegexOnce(s,
    /\n  useEffect\(\(\) => \{\n    if \(alarmSilencedUntil == null\)[\s\S]*?\n  \}, \[alarmSilencedUntil\]\)\n\n  useEffect\(\(\) => \(\) => \{[\s\S]*?\n  \}, \[\]\)\n/,
    '\n',
    'EDUMON local alarm countdown effects')
  s = replaceRegexOnce(s,
    /  const alarmSemantics = deriveAlarmSessionSemantics[\s\S]*?\n  const alarmSync = useTeachingAlarmSync\([^\n]*\n/,
    '',
    'EDUMON old alarm session block')

  s = replaceOnce(s,
    "  const scenarioRuntime = useTeachingScenarioRuntime(edumonScenarioAdapter)\n",
    `  const scenarioRuntime = useTeachingScenarioRuntime(edumonScenarioAdapter)
  const edumonAlarmEvaluations = useMemo(() => evaluateEdumonAlarms(patientState, measurements.meanPressure), [patientState, measurements.meanPressure])
  const alarmController = useSharedAlarmController({
    role: teachingSession.role,
    sessionId: teachingSession.session?.id ?? null,
    policy: { syncAlarms: true, candidateCanEditAlarms: false, alarmsSilent: false },
    evaluations: edumonAlarmEvaluations,
    paused: simulationPaused,
  })
`,
    'EDUMON add alarm controller')

  s = replaceRegexOnce(s,
    /\n  useEffect\(\(\) => \{\n    const code = new URLSearchParams\(window\.location\.search\)\.get\('assignment'\)[\s\S]*?\n  \}, \[scenarioProduct\]\)\n\n  useEffect\(\(\) => \{\n    setScenarioQuestionState\(\{ answered: false, correct: false \}\)[\s\S]*?\n  \}, \[scenarioRuntime\.stageIndex, scenarioRuntime\.status, selfDirectedRunId\]\)\n/,
    `
  const selfDirected = useSharedSelfDirectedScenario<EdumonStoredScenario>({
    product: scenarioProduct,
    stageIndex: scenarioRuntime.stageIndex,
    status: scenarioRuntime.status,
    complete: scenarioRuntime.status === 'complete',
    onStart: async (run) => { await scenarioRuntime.start(run.scenario.definition, elapsed) },
    onClear: () => scenarioRuntime.stop(),
  })

  useEffect(() => {
    setScenarioQuestionState({ answered: false, correct: false })
  }, [scenarioRuntime.stageIndex])
`,
    'EDUMON shared assignment runtime')

  s = replaceRegexOnce(s,
    /\n  const silenceAlarm = \(durationMs: number\) => \{[\s\S]*?\n  const alarmSilenceLabel = alarmSilenceRemaining > 0 \? `\$\{alarmMinutes\}:\$\{String\(alarmSeconds\)\.padStart\(2, '0'\)\}` : undefined\n/,
    '\n  const silenceAlarm = (durationMs: number) => alarmController.silenceFor(durationMs)\n',
    'EDUMON silence function')
  s = replaceOnce(s, "            alarmSilenced={alarmSilenceRemaining > 0}\n            alarmDisabled={alarmSemantics.candidateLocked}\n            alarmLabel={alarmSilenceLabel}\n", "            alarmSilenced={alarmController.silenced}\n            alarmDisabled={alarmController.candidateLocked}\n            alarmLabel={alarmController.silenceLabel}\n", 'EDUMON hardware alarm state')
  s = replaceOnce(s,
    "          display={<div className=\"edumon-monitor-body\">",
    "          status={<div className=\"alarm-row\"><div className=\"alarm-slot\" aria-live=\"polite\"><SharedAlarmBanner level={alarmController.level} labels={alarmController.labels} silenced={alarmController.silenced} /></div></div>}\n          display={<div className=\"edumon-monitor-body\">",
    'EDUMON alarm banner')
  s = replaceOnce(s,
    "          notes={scenarioRuntime.stage.notes}\n          content={scenarioRuntime.stage.content}\n",
    "          instructions={scenarioRuntime.stage.notes}\n          content={scenarioRuntime.stage.content}\n          selfDirected={selfDirected.active}\n          complete={selfDirected.active && scenarioRuntime.status === 'complete'}\n",
    'EDUMON shared runtime presentation flags')
  s = replaceOnce(s,
    "          onClose={() => { scenarioRuntime.stop(); setSelfDirectedRunId(null) }}",
    "          onClose={() => { if (selfDirected.active) selfDirected.clear(); else scenarioRuntime.stop() }}",
    'EDUMON runtime close')
  write(path, s)
}

// ---- EDUVENT: shared panel now resolves media and renders self-directed completion.
{
  const path = 'src/eduvent/useEduventInstructorScenarioRuntime.tsx'
  let s = read(path)
  s = replaceOnce(s,
    "import { createCaseMediaSignedUrl, listCaseMediaByIds, releaseSessionCaseMedia } from '../caseMedia'",
    "import { releaseSessionCaseMedia } from '../caseMedia'",
    'EDUVENT runtime media import')
  s = replaceOnce(s, "  const [mediaUrl, setMediaUrl] = useState<string | null>(null)\n", '', 'EDUVENT media URL state')
  s = replaceOnce(s, "    setMediaUrl(null)\n", '', 'EDUVENT media reset')
  s = replaceRegexOnce(s,
    /    if \(selfDirectedRun && type === 'media' && stage\.media\?\.mediaId\) \{[\s\S]*?\n    \}\n    if \(!selfDirectedRun && options\.role === 'instructor'/,
    "    if (selfDirectedRun) return\n    if (options.role === 'instructor'",
    'EDUVENT self-directed media loader removal')
  s = replaceOnce(s,
    "    content={runtime.stage.content?.kind === 'media' && mediaUrl ? contentFor(runtime.stage.snapshot, mediaUrl) : runtime.stage.content}\n",
    "    content={runtime.stage.content}\n    selfDirected={Boolean(selfDirectedRun)}\n    complete={Boolean(selfDirectedRun) && finalStage}\n    completionMessage=\"You have reached an endpoint in this scenario.\"\n",
    'EDUVENT panel self-directed flags')
  write(path, s)
}

// Versions.
{
  const path = 'src/appVersion.ts'; let s = read(path); s = s.replace(/0\.83\.0\.10/, '0.83.0.11'); write(path, s)
}
{
  const path = 'src/edumon/appVersion.ts'; let s = read(path); s = s.replace(/0\.1\.0\.11/, '0.1.0.12'); write(path, s)
}

console.log('Shared runtime/alarm refactor applied')
