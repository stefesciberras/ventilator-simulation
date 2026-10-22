import { useEffect, useMemo, useRef, useState } from 'react'
import { EDUMON_APP_VERSION } from './appVersion'
import { DEFAULT_MONITOR_STATE, type MonitorPatientState, type MonitorSample } from './types'
import { generateMonitorSamples, measurementsFor, RHYTHM_LABELS } from './monitorEngine'
import { SecondaryMonitorSurface } from '../components/SecondaryMonitorSurface'
import { EdumonTeachingLibraries } from './EdumonTeachingLibraries'
import { EdumonTopBar, type EdumonSimulationSpeed } from './EdumonTopBar'
import { EdumonWorkspacePanel } from './EdumonWorkspacePanel'
import { EDUMON_MODULES, moduleFromPath, type EdumonAuxiliaryMonitorId, type EdumonModuleDefinition } from './modules'
import { edumonAnaTeachingHost, edumonIcuTeachingHost } from '../teaching/hosts/edumon'
import { SimulationHardwareControls } from '../components/SimulationHardwareControls'
import { SimulationAboutDialog } from '../components/SimulationAboutDialog'
import { SimulationDiagnosticsMenu, type SimulationDiagnosticAction } from '../components/SimulationDiagnosticsMenu'
import { SimulationWorkspaceShell } from '../components/SimulationWorkspaceShell'
import { SimulationConsoleShell } from '../components/SimulationConsoleShell'
import { useSimulationDisplayControls } from '../components/useSimulationDisplayControls'
import { useScreenWakeLock } from '../useScreenWakeLock'
import { SharedBasicSessionPanel, ProductCandidateTelemetry, buildProductInstructorDashboard, useProductTeachingSession } from '../teaching/session'
import { useSharedAlarmController } from '../alarms/useSharedAlarmController'
import { SharedAlarmBanner } from '../alarms/SharedAlarmBanner'
import { DEFAULT_EDUMON_ALARM_LIMITS, evaluateEdumonAlarms, type EdumonAlarmLimits } from './alarmDefinitions'
import { EdumonAlarmLimitsDialog } from './EdumonAlarmLimitsDialog'
import { InstructorAccountButton, InstructorAccountDialog, useInstructorAccountAuth } from '../components/InstructorAccountAuth'
import { useTeachingScenarioRuntime, type TeachingScenarioTransition } from '../teaching/scenario/runtimeCore'
import { createEdumonScenarioRuntimeAdapter } from './scenarioAdapter'
import type { EdumonStoredScenario } from './scenarioTypes'
import { TeachingCandidateOverlay, TeachingLaserPointerSurface, TeachingMediaCandidateOverlay, useTeachingMediaPresentation, useTeachingPrompts } from '../teaching'
import { useProductScenarioLibrary } from '../teaching/scenario/useProductScenarioLibrary'
import { SharedScenarioRuntimePanel } from '../teaching/scenario/SharedScenarioRuntimePanel'
import { useSharedSelfDirectedScenario } from '../teaching/scenario/useSharedSelfDirectedScenario'
import { scenarioProductForEdumonModule } from '../teaching/scenario/products'
import { createSimulationPersistence, type SimulationPersistence } from '../core/SimulationPersistence'
import { copySimulationDiagnostic } from '../core/SimulationDiagnostics'
import { getSimulationProduct } from '../core/products'
import { autoscaleWaveformSamples, type WaveformAutoscaleOptions } from '../core/WaveformAutoscale'
import type { EdumonTeachingState } from './teachingState'
import './edumon.css'
import './edumon-console-parity.css'

const TRACE_WINDOW_SECONDS = 8
const SAMPLE_RATE = 100
const EDUMON_ALARM_STORAGE_KEY = 'edumon.alarm-limits'
const EDUMON_PATIENT_TRANSITION_STORAGE_KEY = 'edumon.patient-transition-seconds'

function loadEdumonAlarmLimits(persistence: SimulationPersistence): EdumonAlarmLimits {
  try {
    const stored = persistence.readJson<Partial<EdumonAlarmLimits>>('alarm-limits', {}, [EDUMON_ALARM_STORAGE_KEY])
    return {
      heartRateLow: Number.isFinite(stored.heartRateLow) ? Number(stored.heartRateLow) : DEFAULT_EDUMON_ALARM_LIMITS.heartRateLow,
      heartRateHigh: Number.isFinite(stored.heartRateHigh) ? Number(stored.heartRateHigh) : DEFAULT_EDUMON_ALARM_LIMITS.heartRateHigh,
      mapLow: Number.isFinite(stored.mapLow) ? Number(stored.mapLow) : DEFAULT_EDUMON_ALARM_LIMITS.mapLow,
      mapHigh: Number.isFinite(stored.mapHigh) ? Number(stored.mapHigh) : DEFAULT_EDUMON_ALARM_LIMITS.mapHigh,
      spo2Low: Number.isFinite(stored.spo2Low) ? Number(stored.spo2Low) : DEFAULT_EDUMON_ALARM_LIMITS.spo2Low,
      spo2High: Number.isFinite(stored.spo2High) ? Number(stored.spo2High) : DEFAULT_EDUMON_ALARM_LIMITS.spo2High,
    }
  } catch {
    return { ...DEFAULT_EDUMON_ALARM_LIMITS }
  }
}

type TraceKey = 'ecg' | 'arterialPressure' | 'pleth'

interface TraceSpec {
  key: TraceKey
  label: string
  unit: string
  className: string
  scaleDecimals: number
  autoscale: WaveformAutoscaleOptions
}

const TRACE_SPECS: TraceSpec[] = [
  { key: 'ecg', label: 'ECG II', unit: 'mV', className: 'ecg', scaleDecimals: 1, autoscale: { fallbackMin: -0.8, fallbackMax: 1.6, paddingFraction: 0.08, minimumSpan: 1.2, roundTo: 0.1 } },
  { key: 'arterialPressure', label: 'ART', unit: 'mmHg', className: 'art', scaleDecimals: 0, autoscale: { fallbackMin: 0, fallbackMax: 180, paddingFraction: 0.06, minimumSpan: 40, roundTo: 10, hardMin: 0 } },
  { key: 'pleth', label: 'SpO₂', unit: '', className: 'spo2', scaleDecimals: 1, autoscale: { fallbackMin: 0, fallbackMax: 1.2, paddingFraction: 0.08, minimumSpan: 0.3, roundTo: 0.1, includeZero: true, hardMin: 0 } },
]

function TraceCanvas({ samples, spec }: { samples: MonitorSample[]; spec: TraceSpec }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scale = useMemo(() => autoscaleWaveformSamples(samples, (sample) => sample[spec.key], spec.autoscale), [samples, spec])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const rect = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(rect.width * ratio))
    canvas.height = Math.max(1, Math.round(rect.height * ratio))
    context.setTransform(ratio, 0, 0, ratio, 0, 0)

    const width = rect.width
    const height = rect.height
    context.clearRect(0, 0, width, height)

    context.strokeStyle = 'rgba(255,255,255,0.055)'
    context.lineWidth = 1
    for (let column = 1; column < 8; column += 1) {
      const x = (width * column) / 8
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke()
    }
    for (let row = 1; row < 4; row += 1) {
      const y = (height * row) / 4
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke()
    }

    if (!samples.length) return
    const range = Math.max(0.001, scale.max - scale.min)
    const toY = (value: number) => height - ((value - scale.min) / range) * height

    context.strokeStyle = getComputedStyle(canvas).color
    context.lineWidth = spec.key === 'ecg' ? 1.8 : 2.1
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.beginPath()
    samples.forEach((sample, index) => {
      const x = (index / Math.max(1, samples.length - 1)) * width
      const y = Math.max(1, Math.min(height - 1, toY(sample[spec.key])))
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.stroke()
  }, [samples, spec, scale.min, scale.max])

  return (
    <div className={`edumon-trace edumon-trace-${spec.className} waveform-card`}>
      <div className="edumon-trace-label waveform-label"><strong>{spec.label}</strong>{spec.unit && <span>{spec.unit}</span>}</div>
      <canvas ref={canvasRef} aria-label={`${spec.label} waveform`} />
      <div className="waveform-scale" aria-hidden="true"><span>{scale.max.toFixed(spec.scaleDecimals)}</span><span>{scale.min.toFixed(spec.scaleDecimals)}</span></div>
    </div>
  )
}

function ValuePanel({ label, value, unit, detail, className }: { label: string; value: string; unit?: string; detail?: string; className: string }) {
  return (
    <div className={`edumon-value-panel edumon-value-${className} metric`}>
      <span className="edumon-value-label">{label}</span>
      <strong className="edumon-value-main">{value}</strong>
      {unit && <small className="edumon-value-unit">{unit}</small>}
      {detail && <div className="edumon-value-detail">{detail}</div>}
    </div>
  )
}

function EdumonLanding() {
  return (
    <main className="edumon-page edumon-landing">
      <section className="edumon-module-picker">
        <div className="edumon-module-picker-heading">
          <span>EDUSIM monitoring platform</span>
          <h1>EDUMON</h1>
          <p>Select the clinical monitor environment. Both modules share the same patient, waveform, teaching and scenario foundations.</p>
        </div>
        <div className="edumon-module-cards">
          {Object.values(EDUMON_MODULES).map((module) => (
            <a key={module.id} className="edumon-module-card" href={`/edumon/${module.id}`}>
              <span>{module.id === 'ana' ? 'ANA' : 'ICU'}</span>
              <strong>{module.productName}</strong>
              <p>{module.subtitle}</p>
              <div>{module.id === 'ana' ? 'Anaesthetic gases · MAC · BIS / TOF' : 'ICP / CPP · CVP · advanced ICU monitoring'}</div>
            </a>
          ))}
        </div>
      </section>
      <div className="edumon-version">EDUMON v{EDUMON_APP_VERSION}</div>
    </main>
  )
}

function GasMonitorPreview() {
  return (
    <div className="edumon-extra-monitor-grid edumon-gas-monitor">
      <div><span>FiO₂</span><strong>50</strong><small>%</small></div>
      <div><span>EtO₂</span><strong>44</strong><small>%</small></div>
      <div><span>EtSevo</span><strong>1.8</strong><small>%</small></div>
      <div><span>FiSevo</span><strong>2.0</strong><small>%</small></div>
      <div className="wide"><span>MAC</span><strong>0.9</strong><small>age adjusted · preview</small></div>
      <p className="wide">Gas physiology and live analyser waveforms are deliberately not implemented yet.</p>
    </div>
  )
}

function NeuroMonitorPreview({ map }: { map: number | null }) {
  const icp = 14
  const cpp = map == null ? null : Math.max(0, map - icp)
  return (
    <div className="edumon-extra-monitor-grid edumon-neuro-monitor">
      <div><span>ICP</span><strong>{icp}</strong><small>mmHg</small></div>
      <div><span>CPP</span><strong>{cpp ?? '—'}</strong><small>mmHg</small></div>
      <div className="wide edumon-placeholder-waveform" aria-label="ICP waveform placeholder"><i /><i /><i /><i /><i /><i /></div>
      <p className="wide">CPP is derived from the current monitor MAP minus ICP. The dedicated ICP waveform engine will be added later.</p>
    </div>
  )
}

function interpolateMonitorPatientState(from: MonitorPatientState, to: MonitorPatientState, fraction: number): MonitorPatientState {
  const f = Math.max(0, Math.min(1, fraction))
  const lerp = (a: number, b: number) => a + (b - a) * f
  return { rhythm: f < 0.5 ? from.rhythm : to.rhythm, heartRate: lerp(from.heartRate, to.heartRate), systolicPressure: lerp(from.systolicPressure, to.systolicPressure), diastolicPressure: lerp(from.diastolicPressure, to.diastolicPressure), spo2: lerp(from.spo2, to.spo2), peripheralPerfusion: lerp(from.peripheralPerfusion, to.peripheralPerfusion) }
}

function TrendsPreview() {
  return (
    <div className="edumon-trends-preview">
      <div className="edumon-trend-line"><span>HR</span><i style={{ width: '72%' }} /></div>
      <div className="edumon-trend-line"><span>MAP</span><i style={{ width: '64%' }} /></div>
      <div className="edumon-trend-line"><span>SpO₂</span><i style={{ width: '91%' }} /></div>
      <p>The modal is reusable for extra monitor pages as well as teaching media.</p>
    </div>
  )
}

function EdumonMonitor({ module }: { module: EdumonModuleDefinition }) {
  const productId = scenarioProductForEdumonModule(module.id)
  const persistence = useMemo(() => createSimulationPersistence(productId), [productId])
  const [patientState, setPatientState] = useState<MonitorPatientState>(DEFAULT_MONITOR_STATE)
  const [patientTransitionSeconds, setPatientTransitionSeconds] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = persistence.readNumber('patient-transition-seconds', 0, [EDUMON_PATIENT_TRANSITION_STORAGE_KEY])
    return [0, 5, 10, 30, 60].includes(stored) ? stored : 0
  })
  const effectivePatientRef = useRef<MonitorPatientState>({ ...DEFAULT_MONITOR_STATE })
  const patientTransitionRef = useRef<{ from: MonitorPatientState; to: MonitorPatientState; start: number; duration: number } | null>(null)
  const scenarioPatientBaselineRef = useRef<MonitorPatientState>({ ...DEFAULT_MONITOR_STATE })
  const simulationPausedRef = useRef(false)
  const simulationSpeedRef = useRef<EdumonSimulationSpeed>(1)
  const scenarioTransitionRef = useRef<{ from: MonitorPatientState; to: MonitorPatientState; start: number; defaultPolicy: TeachingScenarioTransition; overrides: Record<string, TeachingScenarioTransition> } | null>(null)
  const [elapsed, setElapsed] = useState(TRACE_WINDOW_SECONDS)
  const [simulationPaused, setSimulationPaused] = useState(false)
  const [simulationSpeed, setSimulationSpeed] = useState<EdumonSimulationSpeed>(1)
  simulationPausedRef.current = simulationPaused
  simulationSpeedRef.current = simulationSpeed
  const [frozen, setFrozen] = useState(false)
  const [frozenSamples, setFrozenSamples] = useState<MonitorSample[] | null>(null)
  const [laserActive, setLaserActive] = useState(false)
  const [auxiliaryMonitor, setAuxiliaryMonitor] = useState<EdumonAuxiliaryMonitorId | null>(null)
  const [topPanel, setTopPanel] = useState<'scenario' | 'about' | null>(null)
  const [selectedSavedScenarioId, setSelectedSavedScenarioId] = useState('')
  const launchedScenarioRef = useRef<string | null>(null)
  const [scenarioQuestionState, setScenarioQuestionState] = useState({ answered: false, correct: false })
  const [scenarioMediaState, setScenarioMediaState] = useState({ ended: false, acknowledged: false })
  const [alarmLimits, setAlarmLimits] = useState<EdumonAlarmLimits>(() => loadEdumonAlarmLimits(persistence))
  const [alarmLimitsOpen, setAlarmLimitsOpen] = useState(false)
  const screenWakeLock = useScreenWakeLock()

  useEffect(() => {
    if (frozen || simulationPaused) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const deltaSeconds = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      setElapsed((current) => current + deltaSeconds * simulationSpeed)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [frozen, simulationPaused, simulationSpeed])


  const effectivePatientState = (() => {
    const scenarioTransition = scenarioTransitionRef.current
    if (scenarioTransition) {
      const keys: Array<keyof Pick<MonitorPatientState, 'heartRate' | 'systolicPressure' | 'diastolicPressure' | 'spo2' | 'peripheralPerfusion'>> = ['heartRate', 'systolicPressure', 'diastolicPressure', 'spo2', 'peripheralPerfusion']
      const next: MonitorPatientState = { ...scenarioTransition.to, rhythm: scenarioTransition.to.rhythm }
      let running = false
      for (const key of keys) {
        const policy = scenarioTransition.overrides[key] ?? scenarioTransition.defaultPolicy
        if (policy.mode !== 'linear' || policy.durationSeconds <= 0) { next[key] = scenarioTransition.to[key]; continue }
        const progress = Math.max(0, Math.min(1, (elapsed - scenarioTransition.start) / Math.max(policy.durationSeconds, 0.001)))
        next[key] = scenarioTransition.from[key] + (scenarioTransition.to[key] - scenarioTransition.from[key]) * progress
        if (progress < 1) running = true
      }
      effectivePatientRef.current = next
      if (!running) scenarioTransitionRef.current = null
      return next
    }
    const transition = patientTransitionRef.current
    if (!transition) { effectivePatientRef.current = { ...patientState }; return patientState }
    const progress = (elapsed - transition.start) / Math.max(transition.duration, 0.001)
    const next = interpolateMonitorPatientState(transition.from, transition.to, progress)
    effectivePatientRef.current = next
    if (progress >= 1) { effectivePatientRef.current = { ...transition.to }; patientTransitionRef.current = null; return transition.to }
    return next
  })()
  const liveSamples = useMemo(() => generateMonitorSamples(effectivePatientState, elapsed, TRACE_WINDOW_SECONDS, SAMPLE_RATE), [effectivePatientState, elapsed])
  const samples = frozenSamples ?? liveSamples
  const measurements = measurementsFor(effectivePatientState)
  const teachingHost = module.id === 'ana' ? edumonAnaTeachingHost : edumonIcuTeachingHost
  const sharedTeachingState = useMemo<EdumonTeachingState>(() => ({ patient: patientState, patientTransitionSeconds, simulationPaused, simulationSpeed, alarmLimits }), [patientState, patientTransitionSeconds, simulationPaused, simulationSpeed, alarmLimits])
  const teachingSession = useProductTeachingSession<EdumonTeachingState>({
    productId: teachingHost.appId,
    state: sharedTeachingState,
    setState: (next) => {
      setPatientState(next.patient)
      setPatientTransitionSeconds(next.patientTransitionSeconds ?? 0)
      setSimulationPaused(next.simulationPaused)
      setSimulationSpeed(next.simulationSpeed)
      setAlarmLimits(next.alarmLimits ?? DEFAULT_EDUMON_ALARM_LIMITS)
    },
  })
  const teachingPrompts = useTeachingPrompts(teachingSession.role, teachingSession.session?.id ?? null, teachingHost)
  const liveTeachingMedia = useTeachingMediaPresentation(teachingSession.role, teachingSession.session?.id ?? null)
  const candidateCount = teachingSession.members.filter((member) => member.role === 'candidate').length
  const candidateLocked = teachingSession.role === 'candidate'
  const accountChangeLocked = teachingSession.role !== 'standalone'
  const accountAuth = useInstructorAccountAuth({ locked: accountChangeLocked })
  const instructorAuthenticated = Boolean(accountAuth.account)
  const scenarioProduct = scenarioProductForEdumonModule(module.id)
  const product = getSimulationProduct(scenarioProduct)
  const scenarioLibrary = useProductScenarioLibrary<EdumonStoredScenario>(scenarioProduct, instructorAuthenticated)
  const savedScenarios = scenarioLibrary.items
  const savedScenariosBusy = scenarioLibrary.busy
  const savedScenarioMessage = scenarioLibrary.message ?? (!savedScenariosBusy && instructorAuthenticated && !savedScenarios.length ? 'No saved scenarios for this simulator yet. Create one in Scenario Builder.' : null)
  useEffect(() => { setSelectedSavedScenarioId((current) => savedScenarios.some((row) => row.id === current) ? current : (savedScenarios[0]?.id ?? '')) }, [savedScenarios])

  const displayControls = useSimulationDisplayControls<MonitorSample[]>({
    role: teachingSession.role,
    sessionId: teachingSession.session?.id ?? null,
    frozen,
    setFrozen,
    frozenSnapshot: frozenSamples,
    setFrozenSnapshot: setFrozenSamples,
    captureSnapshot: () => liveSamples,
    laserEnabled: laserActive,
    setLaserEnabled: setLaserActive,
  })

  const edumonScenarioAdapter = useMemo(() => createEdumonScenarioRuntimeAdapter((snapshot, stageContext) => {
    const stage = stageContext.stage
    const applied = stage.appliedVariableIds ? new Set(stage.appliedVariableIds) : null
    const applies = (id: string) => !applied || applied.has(id)
    const targetPatient: MonitorPatientState = { ...effectivePatientRef.current }
    if (applies('rhythm')) targetPatient.rhythm = snapshot.patient.rhythm
    if (applies('heartRate')) targetPatient.heartRate = snapshot.patient.heartRate
    if (applies('systolicPressure')) targetPatient.systolicPressure = snapshot.patient.systolicPressure
    if (applies('diastolicPressure')) targetPatient.diastolicPressure = snapshot.patient.diastolicPressure
    if (applies('spo2')) targetPatient.spo2 = snapshot.patient.spo2
    if (applies('peripheralPerfusion')) targetPatient.peripheralPerfusion = snapshot.patient.peripheralPerfusion
    scenarioPatientBaselineRef.current = { ...targetPatient }
    const transition = stage.transition ?? { mode: 'immediate' as const }
    const overrides = stage.transitionOverrides ?? {}
    const hasLinear = ['heartRate', 'systolicPressure', 'diastolicPressure', 'spo2', 'peripheralPerfusion'].some((key) => {
      if (!applies(key)) return false
      const policy = overrides[key] ?? transition
      return policy.mode === 'linear' && policy.durationSeconds > 0
    })
    patientTransitionRef.current = null
    if (hasLinear) {
      scenarioTransitionRef.current = {
        from: { ...effectivePatientRef.current },
        to: targetPatient,
        start: stageContext.stageStartedSimulationTime,
        defaultPolicy: transition,
        overrides,
      }
    } else {
      scenarioTransitionRef.current = null
      effectivePatientRef.current = { ...targetPatient }
    }
    setPatientState(targetPatient)
    setSimulationPaused(applies('simulationPaused') ? snapshot.simulationPaused : simulationPausedRef.current)
    setSimulationSpeed(applies('simulationSpeed') ? snapshot.simulationSpeed : simulationSpeedRef.current)
  }), [])
  const scenarioRuntime = useTeachingScenarioRuntime(edumonScenarioAdapter)
  const edumonAlarmEvaluations = useMemo(() => evaluateEdumonAlarms(effectivePatientState, measurements.meanPressure, alarmLimits), [effectivePatientState, measurements.meanPressure, alarmLimits])
  const alarmController = useSharedAlarmController({
    role: teachingSession.role,
    sessionId: teachingSession.session?.id ?? null,
    policy: { syncAlarms: true, candidateCanEditAlarms: false, alarmsSilent: false },
    evaluations: edumonAlarmEvaluations,
    paused: simulationPaused,
  })

  useEffect(() => {
    persistence.writeJson('alarm-limits', alarmLimits)
  }, [alarmLimits, persistence])

  useEffect(() => { persistence.writeNumber('patient-transition-seconds', patientTransitionSeconds) }, [patientTransitionSeconds, persistence])
  useEffect(() => {
    if (scenarioTransitionRef.current) return
    if (patientTransitionSeconds <= 0) { effectivePatientRef.current = { ...patientState }; patientTransitionRef.current = null; return }
    patientTransitionRef.current = { from: { ...effectivePatientRef.current }, to: { ...patientState }, start: elapsed, duration: patientTransitionSeconds }
  }, [patientState, patientTransitionSeconds])

  useEffect(() => {
    if (alarmController.candidateLocked) setAlarmLimitsOpen(false)
  }, [alarmController.candidateLocked])

  const loadSavedScenario = async (id: string) => {
    const row = savedScenarios.find((item) => item.id === id)
    if (!row) return false
    await scenarioRuntime.start(row.scenario.definition, elapsed)
    return true
  }

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('scenario')
    if (!requested || !instructorAuthenticated || teachingSession.role !== 'standalone' || launchedScenarioRef.current === requested) return
    if (!savedScenarios.some((row) => row.id === requested)) return
    launchedScenarioRef.current = requested
    void loadSavedScenario(requested)
  }, [instructorAuthenticated, teachingSession.role, savedScenarios])

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
    setScenarioMediaState({ ended: false, acknowledged: false })
  }, [scenarioRuntime.stageIndex])

  const selectedAuxiliary = module.auxiliaryMonitors.find((item) => item.id === auxiliaryMonitor) ?? null

  useEffect(() => {
    if (scenarioRuntime.status !== 'running') return
    void scenarioRuntime.evaluate({ simulationTime: elapsed, state: sharedTeachingState, measurements, questionAnswered: scenarioQuestionState.answered, questionCorrect: scenarioQuestionState.correct, mediaEnded: scenarioMediaState.ended, mediaAcknowledged: scenarioMediaState.acknowledged, stageBaselinePatient: scenarioPatientBaselineRef.current }, elapsed)
  }, [scenarioRuntime, elapsed, sharedTeachingState, measurements, scenarioQuestionState, scenarioMediaState])

  const sessionPanel = (
    <SharedBasicSessionPanel
      role={teachingSession.role}
      session={teachingSession.session}
      members={teachingSession.members}
      connection={teachingSession.connection}
      error={teachingSession.error}
      instructorAuthenticated={instructorAuthenticated}
      recoverableInstructor={teachingSession.recoverableInstructor}
      recoverableCandidate={teachingSession.recoverableCandidate}
      onStartInstructor={teachingSession.startInstructor}
      onResumeInstructor={teachingSession.resumeInstructor}
      onJoinCandidate={teachingSession.joinCandidate}
      onResumeCandidate={teachingSession.resumeCandidate}
      onLeaveSession={teachingSession.leaveSession}
      onEndInstructorSession={teachingSession.endInstructorSession}
      productId={teachingHost.appId}
      productLabel={module.productName}
      productDescription={module.subtitle}
      instructorDashboard={buildProductInstructorDashboard(product, teachingSession.session, {
        simulationPaused,
        onSimulationPausedChange: setSimulationPaused,
        collapseStorageKey: `${product.id}-instructor-dashboard`,
      })}
      renderCandidateTelemetry={(member) => <ProductCandidateTelemetry product={product} member={member} />}
      instructorStart={{
        currentTitle: `${RHYTHM_LABELS[patientState.rhythm]} · HR ${patientState.heartRate} · ${patientState.systolicPressure}/${patientState.diastolicPressure} · SpO₂ ${patientState.spo2}%`,
        currentSummary: 'Configure the patient monitor in standalone mode before opening the room.',
        currentChips: [RHYTHM_LABELS[patientState.rhythm], `HR ${patientState.heartRate}`, `MAP ${measurements.meanPressure ?? "—"}`, `SpO₂ ${patientState.spo2}%`],
        savedOptions: savedScenarios.map((row) => { const snapshot = row.scenario.definition.stages[0]?.snapshot; return { id: row.id, title: row.name, summary: row.scenario.description || 'Saved monitor scenario', chips: snapshot ? [RHYTHM_LABELS[snapshot.patient.rhythm], `HR ${snapshot.patient.heartRate}`, `SpO₂ ${snapshot.patient.spo2}%`] : [] } }),
        selectedSavedId: selectedSavedScenarioId,
        onSelectedSavedIdChange: setSelectedSavedScenarioId,
        savedBusy: savedScenariosBusy,
        savedMessage: savedScenarioMessage,
        onStartCurrent: teachingSession.startInstructor,
        onLoadSaved: loadSavedScenario,
        onStartSaved: async (id) => { if (await loadSavedScenario(id)) { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); await teachingSession.startInstructor() } },
      }}
    />
  )

  const toggleFreeze = displayControls.toggleFreeze
  const toggleLaser = displayControls.toggleLaser

  const silenceAlarm = (durationMs: number) => alarmController.silenceFor(durationMs)

  const copyEdumonMonitorDiagnostics = async () => {
    await copySimulationDiagnostic<MonitorSample>({
      productId,
      productLabel: module.productName,
      appVersion: EDUMON_APP_VERSION,
      kind: 'monitor-state',
      payload: { simulationTime: elapsed, patient: patientState, measurements, simulationPaused, simulationSpeed },
      waveform: {
        source: frozenSamples ? 'frozen' : 'live',
        sampleIntervalSeconds: 1 / SAMPLE_RATE,
        samples,
        columns: ['time', 'ecg', 'arterialPressure', 'pleth'],
        units: { time: 's', ecg: 'mV', arterialPressure: 'mmHg', pleth: 'relative' },
        sampleTimeSeconds: (sample) => sample.time,
        serializeSample: (sample) => [sample.time, sample.ecg, sample.arterialPressure, sample.pleth],
      },
    })
  }
  const copyEdumonSessionDiagnostics = async () => {
    await copySimulationDiagnostic({
      productId,
      productLabel: module.productName,
      appVersion: EDUMON_APP_VERSION,
      kind: 'session-scenario-state',
      payload: { role: teachingSession.role, session: teachingSession.session, members: teachingSession.members, scenarioRuntime: scenarioRuntime.runtimeSnapshot },
    })
  }
  const edumonDiagnosticActions: SimulationDiagnosticAction[] = [
    { id: 'monitor', label: 'Monitor State', description: 'Patient settings, measurements and timing', onSelect: copyEdumonMonitorDiagnostics },
    { id: 'session', label: 'Session / Scenario State', description: 'Teaching session and scenario runtime state', onSelect: copyEdumonSessionDiagnostics },
  ]

  return (
    <main className={`app-shell edumon-app-shell edumon-module-${module.id}`}>
      <TeachingCandidateOverlay
        role={teachingSession.role}
        prompt={teachingPrompts.activePrompt}
        myResponse={teachingPrompts.myResponse}
        busy={teachingPrompts.busy}
        error={teachingPrompts.error}
        onSubmit={teachingPrompts.submitResponse}
      />
      <TeachingMediaCandidateOverlay role={teachingSession.role} presentation={liveTeachingMedia.activePresentation} />
      <EdumonTopBar
        module={module}
        simulationPaused={simulationPaused}
        simulationSpeed={simulationSpeed}
        elapsedSeconds={elapsed}
        onPausedChange={setSimulationPaused}
        onSpeedChange={setSimulationSpeed}
        simulationControlsLocked={candidateLocked}
        onScenario={() => setTopPanel('scenario')}
        accountAction={<InstructorAccountButton auth={accountAuth} />}
        diagnosticsAction={<SimulationDiagnosticsMenu actions={edumonDiagnosticActions} />}
        onAbout={() => setTopPanel('about')}
      />

      <SimulationWorkspaceShell
        workspaceClassName="edumon-workspace"
        switcherClassName="edumon-mobile-workspace-switcher"
        displayPageClassName="mobile-page-monitor"
        controlsPageClassName="mobile-page-controls"
        displayLabel="Display"
        controlsLabel="Controls"
        ariaLabel="EDUMON workspace pages"
        allowSwipeFromCanvas
        display={(
        <SimulationConsoleShell
          ariaLabel={`${module.productName} patient monitor`}
          className="edumon-console"
          hardwareControls={<SimulationHardwareControls
            className="edumon-console-top-actions"
            laserActive={laserActive}
            onLaserToggle={toggleLaser}
            laserDisabled={displayControls.laserDisabled}
            frozen={frozen}
            onFreezeToggle={toggleFreeze}
            freezeDisabled={displayControls.freezeDisabled}
            alarmSilenced={alarmController.silenced}
            alarmDisabled={alarmController.candidateLocked}
            alarmLabel={alarmController.silenceLabel}
            onAlarmSilence={silenceAlarm}
            alarmTimerClassName="edumon-alarm-silence-timer"
          />}
          status={<div className="alarm-row"><div className="alarm-slot" aria-live="polite"><SharedAlarmBanner level={alarmController.level} labels={alarmController.labels} silenced={alarmController.silenced} /></div></div>}
          display={<div className="edumon-monitor-body">
            <div className="edumon-waveform-area waveforms">
              {TRACE_SPECS.map((spec) => <TraceCanvas key={spec.key} samples={samples} spec={spec} />)}
              {frozen && <div className="edumon-freeze-indicator">FROZEN</div>}
            </div>

            <aside className="edumon-measurements metrics-panel" aria-label="Measured values">
              <div className="metrics-actions">
                <button className="metrics-alarm-limits" type="button" disabled={alarmController.candidateLocked} onClick={() => setAlarmLimitsOpen(true)} title={alarmController.candidateLocked ? 'Alarm limits controlled by instructor' : 'Set alarm limits'}>Alarm limits</button>
              </div>
              <ValuePanel label="HR" value={measurements.heartRate == null ? '—' : `${measurements.heartRate}`} unit="bpm" className="ecg" />
              <ValuePanel label="ART" value={measurements.systolicPressure == null ? '—/—' : `${measurements.systolicPressure}/${measurements.diastolicPressure}`} unit="mmHg" detail={measurements.meanPressure == null ? 'MAP —' : `MAP ${measurements.meanPressure}`} className="art" />
              <ValuePanel label="SpO₂" value={measurements.spo2 == null ? '—' : `${measurements.spo2}`} unit="%" className="spo2" />
            </aside>
            <TeachingLaserPointerSurface role={teachingSession.role} sessionId={teachingSession.session?.id ?? null} enabled={laserActive} onEnabledChange={setLaserActive} />
            <EdumonAlarmLimitsDialog open={alarmLimitsOpen} limits={alarmLimits} disabled={alarmController.candidateLocked} contained onChange={setAlarmLimits} onClose={() => setAlarmLimitsOpen(false)} />
          </div>}
          footer={<div className="edumon-control-strip" aria-label="Monitor controls">
            <button type="button" className="edumon-control-tile disabled" disabled title="NIBP will be enabled in a later EDUMON milestone"><span>NIBP</span><strong>Inactive</strong><small>Manual / cycle</small></button>
            {module.auxiliaryMonitors.map((item) => (
              <button key={item.id} type="button" className="edumon-control-tile" onClick={() => setAuxiliaryMonitor(item.id)}><span>Extra monitor</span><strong>{item.shortLabel}</strong><small>{item.description}</small></button>
            ))}
          </div>}
        />

        )}
        controls={<EdumonWorkspacePanel patientState={patientState} onPatientStateChange={setPatientState} transitionSeconds={patientTransitionSeconds} onTransitionSecondsChange={setPatientTransitionSeconds} teachingHost={teachingHost} teachingRole={teachingSession.role} teachingSessionId={teachingSession.session?.id ?? null} candidateCount={candidateCount} controlsLocked={candidateLocked} sessionPanel={sessionPanel} meanPressure={measurements.meanPressure} />}
      />

      {scenarioRuntime.scenario && scenarioRuntime.stage && scenarioRuntime.status !== 'idle' && (
        <SharedScenarioRuntimePanel
          scenarioName={scenarioRuntime.scenario.name}
          stageName={scenarioRuntime.stage.name}
          stageNumber={scenarioRuntime.stageIndex + 1}
          stageCount={scenarioRuntime.scenario.stages.length}
          instructions={scenarioRuntime.stage.notes}
          content={scenarioRuntime.stage.content}
          selfDirected={selfDirected.active}
          complete={selfDirected.active && scenarioRuntime.status === 'complete'}
          manualAdvanceAvailable={scenarioRuntime.stage.triggers.some((trigger) => trigger.type === 'manual')}
          onAdvance={async () => { await scenarioRuntime.advance(elapsed) }}
          onQuestionResult={(answered, correct) => setScenarioQuestionState({ answered, correct })}
          onMediaEvent={(event) => setScenarioMediaState((current) => event === 'ended' ? { ...current, ended: true } : { ...current, acknowledged: true })}
          onClose={() => { if (selfDirected.active) selfDirected.clear(); else scenarioRuntime.stop() }}
        />
      )}


      {selectedAuxiliary && auxiliaryMonitor && (
        <SecondaryMonitorSurface title={selectedAuxiliary.label} onClose={() => setAuxiliaryMonitor(null)}>
          {auxiliaryMonitor === 'ana-gases' && <GasMonitorPreview />}
          {auxiliaryMonitor === 'icu-neuro' && <NeuroMonitorPreview map={measurements.meanPressure} />}
          {auxiliaryMonitor === 'trends' && <TrendsPreview />}
          {auxiliaryMonitor === 'teaching' && <EdumonTeachingLibraries host={teachingHost} role={teachingSession.role} sessionId={teachingSession.session?.id ?? null} candidateCount={candidateCount} />}
        </SecondaryMonitorSurface>
      )}

      {topPanel === 'scenario' && <SecondaryMonitorSurface title="Scenarios and sessions" onClose={() => setTopPanel(null)}>{sessionPanel}</SecondaryMonitorSurface>}
      <InstructorAccountDialog auth={accountAuth} locked={accountChangeLocked} />
      <SimulationAboutDialog open={topPanel === 'about'} productLabel={module.productName} title={module.subtitle} description="An interactive patient-monitor simulator for anaesthesia, acute care and intensive-care education." version={EDUMON_APP_VERSION} onClose={() => setTopPanel(null)} wakeLock={screenWakeLock} diagnostics={edumonDiagnosticActions} />
    </main>
  )
}

export function EdumonApp() {
  const moduleId = moduleFromPath(window.location.pathname)
  if (!moduleId) return <EdumonLanding />
  return <EdumonMonitor module={EDUMON_MODULES[moduleId]} />
}
