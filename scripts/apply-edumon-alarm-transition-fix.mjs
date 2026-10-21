import fs from 'node:fs'

function replace(path, from, to) {
  const text = fs.readFileSync(path, 'utf8')
  if (!text.includes(from)) throw new Error(`Missing pattern in ${path}: ${from.slice(0, 120)}`)
  fs.writeFileSync(path, text.replace(from, to))
}

// Shared transition selector used by both products.
replace('src/components/Controls.tsx',
  "import { loadPanelCollapsed, savePanelCollapsed } from '../panelCollapse'",
  "import { loadPanelCollapsed, savePanelCollapsed } from '../panelCollapse'\nimport { SimulationTransitionTimeControl } from './SimulationTransitionTimeControl'"
)
replace('src/components/Controls.tsx',
`      <div className="patient-shared-profile-controls">
        <div className="patient-transition-control">
          <label htmlFor={\`patient-transition-select-\${view}\`}>
            <span>Transition time</span>
            <select id={\`patient-transition-select-\${view}\`} value={transitionSeconds} onChange={(event) => onTransitionSecondsChange(Number(event.target.value))}>
              <option value={0}>Now</option>
              <option value={5}>5 s</option>
              <option value={10}>10 s</option>
              <option value={30}>30 s</option>
              <option value={60}>60 s</option>
            </select>
          </label>
        </div>
      </div>`,
`      <div className="patient-shared-profile-controls">
        <div className="patient-transition-control">
          <SimulationTransitionTimeControl value={transitionSeconds} onChange={onTransitionSecondsChange} />
        </div>
      </div>`
)
replace('src/components/Controls.tsx',
  `  const predictedBodyWeight = calculatePredictedBodyWeight(settings.sex ?? 'male', settings.heightCm ?? 170)`,
  `  const predictedBodyWeight = calculatePredictedBodyWeight(settings.sex ?? 'male', settings.heightCm ?? 170)\n  const safeMaxSpO2 = Number.isFinite(Number(settings.maxSpO2)) ? Number(settings.maxSpO2) : 100`
)
replace('src/components/Controls.tsx',
  `{showSpO2Ceiling && <Slider label="Maximum SpO₂" value={Math.round(settings.maxSpO2 ?? 100)} unit="%" min={80} max={100} step={1} onChange={(v) => patch({ maxSpO2: v })} />}`,
  `{showSpO2Ceiling && <Slider label="Maximum SpO₂" value={Math.round(safeMaxSpO2)} unit="%" min={80} max={100} step={1} onChange={(v) => patch({ maxSpO2: v })} />}`
)

// Make shared alarm-limit modal optionally container-scoped and harden dual endpoints.
replace('src/alarms/SharedAlarmLimits.tsx',
`export function VerticalDualAlarmSlider({ label, unit, min, max, step, low, high, disabled=false, onLowChange, onHighChange }:{ label:string; unit:string; min:number; max:number; step:number; low:number; high:number; disabled?:boolean; onLowChange:(value:number)=>void; onHighChange:(value:number)=>void }) {
 const span=Math.max(.0001,max-min), lowPct=((low-min)/span)*100, highPct=((high-min)/span)*100; const dragging=useRef<'low'|'high'|null>(null); const sliderHeight=190, handleSize=20, travel=sliderHeight-handleSize; const lowTop=(1-lowPct/100)*travel, highTop=(1-highPct/100)*travel; const precision=step<1?Math.max(0,Math.ceil(-Math.log10(step))):0;`,
`export function VerticalDualAlarmSlider({ label, unit, min, max, step, low, high, disabled=false, onLowChange, onHighChange }:{ label:string; unit:string; min:number; max:number; step:number; low:number; high:number; disabled?:boolean; onLowChange:(value:number)=>void; onHighChange:(value:number)=>void }) {
 const finiteLow=Number.isFinite(low)?low:min, finiteHigh=Number.isFinite(high)?high:max; const safeLow=Math.min(Math.max(min,finiteLow),Math.max(min,finiteHigh)), safeHigh=Math.max(Math.min(max,finiteHigh),safeLow); const span=Math.max(.0001,max-min), lowPct=((safeLow-min)/span)*100, highPct=((safeHigh-min)/span)*100; const dragging=useRef<'low'|'high'|null>(null); const sliderHeight=190, handleSize=20, travel=sliderHeight-handleSize; const lowTop=(1-lowPct/100)*travel, highTop=(1-highPct/100)*travel; const precision=step<1?Math.max(0,Math.ceil(-Math.log10(step))):0;`
)
replace('src/alarms/SharedAlarmLimits.tsx',
` const setValue=(handle:'low'|'high',value:number)=>{if(disabled)return; const next=quantise(value); if(handle==='low')onLowChange(Math.min(next,high)); else onHighChange(Math.max(next,low))};`,
` const setValue=(handle:'low'|'high',value:number)=>{if(disabled)return; const next=quantise(value); if(handle==='low')onLowChange(Math.min(next,safeHigh)); else onHighChange(Math.max(next,safeLow))};`
)
replace('src/alarms/SharedAlarmLimits.tsx',
` const start=(event:React.PointerEvent<HTMLDivElement>)=>{if(disabled)return; event.preventDefault(); const value=fromPointer(event.clientY,event.currentTarget); const handle:'low'|'high'=Math.abs(value-low)<=Math.abs(value-high)?'low':'high'; dragging.current=handle; event.currentTarget.setPointerCapture(event.pointerId); setValue(handle,value)};`,
` const start=(event:React.PointerEvent<HTMLDivElement>)=>{if(disabled)return; event.preventDefault(); const value=fromPointer(event.clientY,event.currentTarget); const handle:'low'|'high'=Math.abs(value-safeLow)<=Math.abs(value-safeHigh)?'low':'high'; dragging.current=handle; event.currentTarget.setPointerCapture(event.pointerId); setValue(handle,value)};`
)
replace('src/alarms/SharedAlarmLimits.tsx',
` return <div className={\`alarm-slider-card vertical-dual-card shared-alarm-limit-card \${disabled?'disabled':''}\`}><span>{label}</span><strong>{low}–{high} <small>{unit}</small></strong><div className="vertical-dual-slider-wrap"><em>{max}</em><div className="vertical-dual-range" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}><div className="vertical-dual-track"/><div className="vertical-dual-active" style={{bottom:\`\${10+lowPct*1.7}px\`,height:\`\${Math.max(0,highPct-lowPct)*1.7}px\`}}/><div className="vertical-dual-handle low" style={{top:\`\${lowTop}px\`}} role="slider" tabIndex={disabled?-1:0} aria-disabled={disabled} aria-label={\`\${label} minimum alarm limit\`} aria-valuemin={min} aria-valuemax={high} aria-valuenow={low} onKeyDown={(e)=>key('low',low,e)}/><div className="vertical-dual-handle high" style={{top:\`\${highTop}px\`}} role="slider" tabIndex={disabled?-1:0} aria-disabled={disabled} aria-label={\`\${label} maximum alarm limit\`} aria-valuemin={low} aria-valuemax={max} aria-valuenow={high} onKeyDown={(e)=>key('high',high,e)}/></div><em>{min}</em></div></div>`,
` return <div className={\`alarm-slider-card vertical-dual-card shared-alarm-limit-card \${disabled?'disabled':''}\`}><span>{label}</span><strong>{safeLow}–{safeHigh} <small>{unit}</small></strong><div className="vertical-dual-slider-wrap"><em className="upper-limit-label">{max}</em><div className="vertical-dual-range" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}><div className="vertical-dual-track"/><div className="vertical-dual-active" style={{bottom:\`\${10+lowPct*1.7}px\`,height:\`\${Math.max(0,highPct-lowPct)*1.7}px\`}}/><div className="vertical-dual-handle high" style={{top:\`\${highTop}px\`}} role="slider" tabIndex={disabled?-1:0} aria-disabled={disabled} aria-label={\`\${label} maximum alarm limit\`} aria-valuemin={safeLow} aria-valuemax={max} aria-valuenow={safeHigh} onKeyDown={(e)=>key('high',safeHigh,e)}/><div className="vertical-dual-handle low" style={{top:\`\${lowTop}px\`}} role="slider" tabIndex={disabled?-1:0} aria-disabled={disabled} aria-label={\`\${label} minimum alarm limit\`} aria-valuemin={min} aria-valuemax={safeHigh} aria-valuenow={safeLow} onKeyDown={(e)=>key('low',safeLow,e)}/></div><em className="lower-limit-label">{min}</em></div></div>`
)
replace('src/alarms/SharedAlarmLimits.tsx',
`export function SharedAlarmLimitsDialog<T extends object>({open,values,definitions,disabled=false,title='Alarm limits',lockedMessage='Alarm limits are controlled by the instructor.',onChange,onClose}:{open:boolean;values:T;definitions:SharedAlarmLimitPairDefinition<T>[];disabled?:boolean;title?:string;lockedMessage?:string;onChange:(values:T)=>void;onClose:()=>void}) {
 if(!open)return null; const update=(d:SharedAlarmLimitPairDefinition<T>,low:number,high:number)=>onChange({...values,[d.lowKey]:low,[d.highKey]:high});
 return <div className="alarm-dialog-backdrop" onClick={onClose}>`,
`export function SharedAlarmLimitsDialog<T extends object>({open,values,definitions,disabled=false,contained=false,title='Alarm limits',lockedMessage='Alarm limits are controlled by the instructor.',onChange,onClose}:{open:boolean;values:T;definitions:SharedAlarmLimitPairDefinition<T>[];disabled?:boolean;contained?:boolean;title?:string;lockedMessage?:string;onChange:(values:T)=>void;onClose:()=>void}) {
 if(!open)return null; const update=(d:SharedAlarmLimitPairDefinition<T>,low:number,high:number)=>onChange({...values,[d.lowKey]:low,[d.highKey]:high});
 return <div className={\`alarm-dialog-backdrop shared-alarm-limits-backdrop \${contained?'contained':''}\`} onClick={onClose}>`
)

fs.appendFileSync('src/alarms/SharedAlarmLimits.css', `\n.shared-alarm-limits-backdrop.contained{position:absolute;inset:0;width:auto;height:auto;z-index:40}.shared-alarm-limits-backdrop.contained .shared-alarm-limits-dialog{max-width:calc(100% - 24px);max-height:calc(100% - 24px)}.shared-alarm-limit-card .upper-limit-label{order:0}.shared-alarm-limit-card .lower-limit-label{order:2}\n`)
replace('src/components/SimulationConsoleShell.css',
`.simulation-console-display {
  flex: 1 1 auto;`,
`.simulation-console-display {
  position: relative;
  flex: 1 1 auto;`
)

// EDUMON alarm dialog uses the shared contained modal.
replace('src/edumon/EdumonAlarmLimitsDialog.tsx',
`interface Props{open:boolean;limits:EdumonAlarmLimits;disabled?:boolean;onChange:(limits:EdumonAlarmLimits)=>void;onClose:()=>void}`,
`interface Props{open:boolean;limits:EdumonAlarmLimits;disabled?:boolean;contained?:boolean;onChange:(limits:EdumonAlarmLimits)=>void;onClose:()=>void}`
)
replace('src/edumon/EdumonAlarmLimitsDialog.tsx',
`export function EdumonAlarmLimitsDialog({open,limits,disabled=false,onChange,onClose}:Props){return <SharedAlarmLimitsDialog open={open} values={limits} definitions={DEFINITIONS} disabled={disabled} onChange={onChange} onClose={onClose}/>} `,
`export function EdumonAlarmLimitsDialog({open,limits,disabled=false,contained=false,onChange,onClose}:Props){return <SharedAlarmLimitsDialog open={open} values={limits} definitions={DEFINITIONS} disabled={disabled} contained={contained} onChange={onChange} onClose={onClose}/>} `
)

// EDUMON patient transition UI.
replace('src/edumon/EdumonWorkspacePanel.tsx',
`import { SimulationControlPanel, SimulationProfileStrip, type SimulationControlTab } from '../components/SimulationControlPanel'`,
`import { SimulationControlPanel, SimulationProfileStrip, type SimulationControlTab } from '../components/SimulationControlPanel'\nimport { SimulationTransitionTimeControl } from '../components/SimulationTransitionTimeControl'`
)
replace('src/edumon/EdumonWorkspacePanel.tsx',
`  onPatientStateChange: (state: MonitorPatientState) => void
  teachingHost: TeachingHostAdapter`,
`  onPatientStateChange: (state: MonitorPatientState) => void
  transitionSeconds: number
  onTransitionSecondsChange: (seconds: number) => void
  teachingHost: TeachingHostAdapter`
)
replace('src/edumon/EdumonWorkspacePanel.tsx',
`  patientState,
  onPatientStateChange,
  teachingHost,`,
`  patientState,
  onPatientStateChange,
  transitionSeconds,
  onTransitionSecondsChange,
  teachingHost,`
)
replace('src/edumon/EdumonWorkspacePanel.tsx',
`          <div className="control-section-title"><h2>Patient</h2><span className="edumon-profile-badge">{controlsLocked ? 'Instructor controlled' : profile}</span></div>
          <label className="edumon-rhythm-control">`,
`          <div className="control-section-title"><h2>Patient</h2><span className="edumon-profile-badge">{controlsLocked ? 'Instructor controlled' : profile}</span></div>
          <SimulationTransitionTimeControl value={transitionSeconds} onChange={onTransitionSecondsChange} disabled={controlsLocked} />
          <label className="edumon-rhythm-control">`
)

// EDUMON target -> effective patient interpolation.
replace('src/edumon/EdumonApp.tsx',
`const EDUMON_ALARM_STORAGE_KEY = 'edumon.alarm-limits'`,
`const EDUMON_ALARM_STORAGE_KEY = 'edumon.alarm-limits'\nconst EDUMON_PATIENT_TRANSITION_STORAGE_KEY = 'edumon.patient-transition-seconds'`
)
replace('src/edumon/EdumonApp.tsx',
`interface EdumonTeachingState {
  patient: MonitorPatientState
  simulationPaused: boolean`,
`interface EdumonTeachingState {
  patient: MonitorPatientState
  patientTransitionSeconds: number
  simulationPaused: boolean`
)
replace('src/edumon/EdumonApp.tsx',
`function TrendsPreview() {`,
`function interpolateMonitorPatientState(from: MonitorPatientState, to: MonitorPatientState, fraction: number): MonitorPatientState {
  const f = Math.max(0, Math.min(1, fraction))
  const lerp = (a: number, b: number) => a + (b - a) * f
  return {
    rhythm: f < 0.5 ? from.rhythm : to.rhythm,
    heartRate: lerp(from.heartRate, to.heartRate),
    systolicPressure: lerp(from.systolicPressure, to.systolicPressure),
    diastolicPressure: lerp(from.diastolicPressure, to.diastolicPressure),
    spo2: lerp(from.spo2, to.spo2),
    peripheralPerfusion: lerp(from.peripheralPerfusion, to.peripheralPerfusion),
  }
}

function TrendsPreview() {`
)
replace('src/edumon/EdumonApp.tsx',
`  const [patientState, setPatientState] = useState<MonitorPatientState>(DEFAULT_MONITOR_STATE)
  const [elapsed, setElapsed] = useState(TRACE_WINDOW_SECONDS)`,
`  const [patientState, setPatientState] = useState<MonitorPatientState>(DEFAULT_MONITOR_STATE)
  const [patientTransitionSeconds, setPatientTransitionSeconds] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = Number(window.localStorage.getItem(EDUMON_PATIENT_TRANSITION_STORAGE_KEY) ?? 0)
    return [0, 5, 10, 30, 60].includes(stored) ? stored : 0
  })
  const effectivePatientRef = useRef<MonitorPatientState>({ ...DEFAULT_MONITOR_STATE })
  const patientTransitionRef = useRef<{ from: MonitorPatientState; to: MonitorPatientState; start: number; duration: number } | null>(null)
  const [elapsed, setElapsed] = useState(TRACE_WINDOW_SECONDS)`
)
replace('src/edumon/EdumonApp.tsx',
`  const liveSamples = useMemo(() => generateMonitorSamples(patientState, elapsed, TRACE_WINDOW_SECONDS, SAMPLE_RATE), [patientState, elapsed])
  const samples = frozenSamples ?? liveSamples
  const measurements = measurementsFor(patientState)`,
`  const effectivePatientState = (() => {
    const transition = patientTransitionRef.current
    if (!transition) {
      effectivePatientRef.current = { ...patientState }
      return patientState
    }
    const progress = (elapsed - transition.start) / Math.max(transition.duration, 0.001)
    const next = interpolateMonitorPatientState(transition.from, transition.to, progress)
    effectivePatientRef.current = next
    if (progress >= 1) {
      effectivePatientRef.current = { ...transition.to }
      patientTransitionRef.current = null
      return transition.to
    }
    return next
  })()
  const liveSamples = useMemo(() => generateMonitorSamples(effectivePatientState, elapsed, TRACE_WINDOW_SECONDS, SAMPLE_RATE), [effectivePatientState, elapsed])
  const samples = frozenSamples ?? liveSamples
  const measurements = measurementsFor(effectivePatientState)`
)
replace('src/edumon/EdumonApp.tsx',
`  const sharedTeachingState = useMemo<EdumonTeachingState>(() => ({ patient: patientState, simulationPaused, simulationSpeed, alarmLimits }), [patientState, simulationPaused, simulationSpeed, alarmLimits])`,
`  const sharedTeachingState = useMemo<EdumonTeachingState>(() => ({ patient: patientState, patientTransitionSeconds, simulationPaused, simulationSpeed, alarmLimits }), [patientState, patientTransitionSeconds, simulationPaused, simulationSpeed, alarmLimits])`
)
replace('src/edumon/EdumonApp.tsx',
`      setPatientState(next.patient)
      setSimulationPaused(next.simulationPaused)`,
`      setPatientState(next.patient)
      setPatientTransitionSeconds(next.patientTransitionSeconds ?? 0)
      setSimulationPaused(next.simulationPaused)`
)
replace('src/edumon/EdumonApp.tsx',
`  const edumonAlarmEvaluations = useMemo(() => evaluateEdumonAlarms(patientState, measurements.meanPressure, alarmLimits), [patientState, measurements.meanPressure, alarmLimits])`,
`  const edumonAlarmEvaluations = useMemo(() => evaluateEdumonAlarms(effectivePatientState, measurements.meanPressure, alarmLimits), [effectivePatientState, measurements.meanPressure, alarmLimits])`
)
replace('src/edumon/EdumonApp.tsx',
`  useEffect(() => {
    window.localStorage.setItem(EDUMON_ALARM_STORAGE_KEY, JSON.stringify(alarmLimits))
  }, [alarmLimits])`,
`  useEffect(() => {
    window.localStorage.setItem(EDUMON_ALARM_STORAGE_KEY, JSON.stringify(alarmLimits))
  }, [alarmLimits])

  useEffect(() => {
    window.localStorage.setItem(EDUMON_PATIENT_TRANSITION_STORAGE_KEY, String(patientTransitionSeconds))
  }, [patientTransitionSeconds])

  useEffect(() => {
    if (patientTransitionSeconds <= 0) {
      effectivePatientRef.current = { ...patientState }
      patientTransitionRef.current = null
      return
    }
    patientTransitionRef.current = {
      from: { ...effectivePatientRef.current },
      to: { ...patientState },
      start: elapsed,
      duration: patientTransitionSeconds,
    }
  }, [patientState, patientTransitionSeconds])`
)
replace('src/edumon/EdumonApp.tsx',
`            <TeachingLaserPointerSurface role={teachingSession.role} sessionId={teachingSession.session?.id ?? null} enabled={laserActive} onEnabledChange={setLaserActive} />
          </div>}`,
`            <TeachingLaserPointerSurface role={teachingSession.role} sessionId={teachingSession.session?.id ?? null} enabled={laserActive} onEnabledChange={setLaserActive} />
            <EdumonAlarmLimitsDialog
              open={alarmLimitsOpen}
              limits={alarmLimits}
              disabled={alarmController.candidateLocked}
              contained
              onChange={setAlarmLimits}
              onClose={() => setAlarmLimitsOpen(false)}
            />
          </div>}`
)
replace('src/edumon/EdumonApp.tsx',
`        controls={<EdumonWorkspacePanel patientState={patientState} onPatientStateChange={setPatientState} teachingHost={teachingHost} teachingRole={teachingSession.role} teachingSessionId={teachingSession.session?.id ?? null} candidateCount={candidateCount} controlsLocked={candidateLocked} sessionPanel={sessionPanel} meanPressure={measurements.meanPressure} />}`,
`        controls={<EdumonWorkspacePanel patientState={patientState} onPatientStateChange={setPatientState} transitionSeconds={patientTransitionSeconds} onTransitionSecondsChange={setPatientTransitionSeconds} teachingHost={teachingHost} teachingRole={teachingSession.role} teachingSessionId={teachingSession.session?.id ?? null} candidateCount={candidateCount} controlsLocked={candidateLocked} sessionPanel={sessionPanel} meanPressure={measurements.meanPressure} />}`
)
replace('src/edumon/EdumonApp.tsx',
`      <EdumonAlarmLimitsDialog
        open={alarmLimitsOpen}
        limits={alarmLimits}
        disabled={alarmController.candidateLocked}
        onChange={setAlarmLimits}
        onClose={() => setAlarmLimitsOpen(false)}
      />

`,
``
)

// Defensive EDUVENT migration for malformed legacy Maximum SpO2 values.
replace('src/App.tsx',
`    if (stored.effortRisePercent === 30 && stored.effortRelaxationPercent === 35) {
      return { ...stored, effortRisePercent: 50, effortRelaxationPercent: 50 }
    }
    return stored`,
`    const safeStored = { ...stored, maxSpO2: Number.isFinite(Number(stored.maxSpO2)) ? Number(stored.maxSpO2) : 100 }
    if (safeStored.effortRisePercent === 30 && safeStored.effortRelaxationPercent === 35) {
      return { ...safeStored, effortRisePercent: 50, effortRelaxationPercent: 50 }
    }
    return safeStored`
)

// Versions.
replace('src/appVersion.ts', "export const APP_VERSION = '0.83.0.13'", "export const APP_VERSION = '0.83.0.14'")
replace('src/edumon/appVersion.ts', "export const EDUMON_APP_VERSION = '0.1.0.14'", "export const EDUMON_APP_VERSION = '0.1.0.15'")

console.log('Applied EDUMON alarm scope, patient transition, and alarm slider fixes')
