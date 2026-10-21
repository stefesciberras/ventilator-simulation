import fs from 'node:fs'

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`)
  return source.replace(oldText, newText)
}

const appPath = 'src/edumon/EdumonApp.tsx'
let s = fs.readFileSync(appPath, 'utf8')

s = replaceOnce(
  s,
  "import { TeachingLaserPointerSurface } from '../teaching'",
  "import { TeachingCandidateOverlay, TeachingLaserPointerSurface, TeachingMediaCandidateOverlay, useTeachingMediaPresentation, useTeachingPrompts } from '../teaching'",
  'teaching imports',
)
s = replaceOnce(
  s,
  "import { evaluateEdumonAlarms } from './alarmDefinitions'",
  "import { DEFAULT_EDUMON_ALARM_LIMITS, evaluateEdumonAlarms, type EdumonAlarmLimits } from './alarmDefinitions'\nimport { EdumonAlarmLimitsDialog } from './EdumonAlarmLimitsDialog'",
  'alarm imports',
)
s = replaceOnce(
  s,
  "const SAMPLE_RATE = 100\n",
  `const SAMPLE_RATE = 100
const EDUMON_ALARM_STORAGE_KEY = 'edumon.alarm-limits'

function loadEdumonAlarmLimits(): EdumonAlarmLimits {
  if (typeof window === 'undefined') return { ...DEFAULT_EDUMON_ALARM_LIMITS }
  try {
    const raw = window.localStorage.getItem(EDUMON_ALARM_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_EDUMON_ALARM_LIMITS }
    const stored = JSON.parse(raw) as Partial<EdumonAlarmLimits>
    return {
      heartRateLow: Number.isFinite(stored.heartRateLow) ? Number(stored.heartRateLow) : DEFAULT_EDUMON_ALARM_LIMITS.heartRateLow,
      heartRateHigh: Number.isFinite(stored.heartRateHigh) ? Number(stored.heartRateHigh) : DEFAULT_EDUMON_ALARM_LIMITS.heartRateHigh,
      mapLow: Number.isFinite(stored.mapLow) ? Number(stored.mapLow) : DEFAULT_EDUMON_ALARM_LIMITS.mapLow,
      mapHigh: Number.isFinite(stored.mapHigh) ? Number(stored.mapHigh) : DEFAULT_EDUMON_ALARM_LIMITS.mapHigh,
      spo2Low: Number.isFinite(stored.spo2Low) ? Number(stored.spo2Low) : DEFAULT_EDUMON_ALARM_LIMITS.spo2Low,
    }
  } catch {
    return { ...DEFAULT_EDUMON_ALARM_LIMITS }
  }
}
`,
  'alarm storage helper',
)
s = replaceOnce(
  s,
  `interface EdumonTeachingState {
  patient: MonitorPatientState
  simulationPaused: boolean
  simulationSpeed: EdumonSimulationSpeed
}`,
  `interface EdumonTeachingState {
  patient: MonitorPatientState
  simulationPaused: boolean
  simulationSpeed: EdumonSimulationSpeed
  alarmLimits: EdumonAlarmLimits
}`,
  'teaching state alarm limits',
)
s = replaceOnce(
  s,
  "  const [scenarioQuestionState, setScenarioQuestionState] = useState({ answered: false, correct: false })\n  const screenWakeLock = useScreenWakeLock()",
  "  const [scenarioQuestionState, setScenarioQuestionState] = useState({ answered: false, correct: false })\n  const [alarmLimits, setAlarmLimits] = useState<EdumonAlarmLimits>(loadEdumonAlarmLimits)\n  const [alarmLimitsOpen, setAlarmLimitsOpen] = useState(false)\n  const screenWakeLock = useScreenWakeLock()",
  'alarm state',
)
s = replaceOnce(
  s,
  "  const sharedTeachingState = useMemo<EdumonTeachingState>(() => ({ patient: patientState, simulationPaused, simulationSpeed }), [patientState, simulationPaused, simulationSpeed])",
  "  const sharedTeachingState = useMemo<EdumonTeachingState>(() => ({ patient: patientState, simulationPaused, simulationSpeed, alarmLimits }), [patientState, simulationPaused, simulationSpeed, alarmLimits])",
  'shared teaching state',
)
s = replaceOnce(
  s,
  `    setState: (next) => {
      setPatientState(next.patient)
      setSimulationPaused(next.simulationPaused)
      setSimulationSpeed(next.simulationSpeed)
    },
  })`,
  `    setState: (next) => {
      setPatientState(next.patient)
      setSimulationPaused(next.simulationPaused)
      setSimulationSpeed(next.simulationSpeed)
      setAlarmLimits(next.alarmLimits ?? DEFAULT_EDUMON_ALARM_LIMITS)
    },
  })`,
  'session state setter',
)
s = replaceOnce(
  s,
  "  const candidateCount = teachingSession.members.filter((member) => member.role === 'candidate').length",
  `  const teachingPrompts = useTeachingPrompts(teachingSession.role, teachingSession.session?.id ?? null, teachingHost)
  const liveTeachingMedia = useTeachingMediaPresentation(teachingSession.role, teachingSession.session?.id ?? null)
  const candidateCount = teachingSession.members.filter((member) => member.role === 'candidate').length`,
  'persistent teaching listeners',
)
s = replaceOnce(
  s,
  "  const edumonAlarmEvaluations = useMemo(() => evaluateEdumonAlarms(patientState, measurements.meanPressure), [patientState, measurements.meanPressure])",
  "  const edumonAlarmEvaluations = useMemo(() => evaluateEdumonAlarms(patientState, measurements.meanPressure, alarmLimits), [patientState, measurements.meanPressure, alarmLimits])",
  'alarm evaluator limits',
)
s = replaceOnce(
  s,
  "  const loadSavedScenario = async (id: string) => {",
  `  useEffect(() => {
    window.localStorage.setItem(EDUMON_ALARM_STORAGE_KEY, JSON.stringify(alarmLimits))
  }, [alarmLimits])

  useEffect(() => {
    if (alarmController.candidateLocked) setAlarmLimitsOpen(false)
  }, [alarmController.candidateLocked])

  const loadSavedScenario = async (id: string) => {`,
  'alarm persistence',
)
s = replaceOnce(
  s,
  "    <main className={`app-shell edumon-app-shell edumon-module-${module.id}`}>\n      <EdumonTopBar",
  `    <main className={\`app-shell edumon-app-shell edumon-module-\${module.id}\`}>
      <TeachingCandidateOverlay
        role={teachingSession.role}
        prompt={teachingPrompts.activePrompt}
        myResponse={teachingPrompts.myResponse}
        busy={teachingPrompts.busy}
        error={teachingPrompts.error}
        onSubmit={teachingPrompts.submitResponse}
      />
      <TeachingMediaCandidateOverlay role={teachingSession.role} presentation={liveTeachingMedia.activePresentation} />
      <EdumonTopBar`,
  'candidate overlays',
)
s = replaceOnce(
  s,
  `            <aside className="edumon-measurements metrics-panel" aria-label="Measured values">
              <ValuePanel label="HR"`,
  `            <aside className="edumon-measurements metrics-panel" aria-label="Measured values">
              <div className="metrics-actions">
                <button className="metrics-alarm-limits" type="button" disabled={alarmController.candidateLocked} onClick={() => setAlarmLimitsOpen(true)} title={alarmController.candidateLocked ? 'Alarm limits controlled by instructor' : 'Set alarm limits'}>Alarm limits</button>
              </div>
              <ValuePanel label="HR"`,
  'alarm limits button',
)
s = replaceOnce(
  s,
  `      {selectedAuxiliary && auxiliaryMonitor && (`,
  `      <EdumonAlarmLimitsDialog
        open={alarmLimitsOpen}
        limits={alarmLimits}
        disabled={alarmController.candidateLocked}
        onChange={setAlarmLimits}
        onClose={() => setAlarmLimitsOpen(false)}
      />

      {selectedAuxiliary && auxiliaryMonitor && (`,
  'alarm limits dialog',
)

fs.writeFileSync(appPath, s)

for (const [path, from, to] of [
  ['src/appVersion.ts', "0.83.0.11", "0.83.0.12"],
  ['src/edumon/appVersion.ts', "0.1.0.12", "0.1.0.13"],
]) {
  let version = fs.readFileSync(path, 'utf8')
  if (!version.includes(from)) throw new Error(`${path}: version ${from} not found`)
  version = version.replace(from, to)
  fs.writeFileSync(path, version)
}

console.log('Teaching media/questions and EDUMON alarm limits patch applied')
