from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:160]!r}')
    p.write_text(text.replace(old, new, 1))

# CO2 kinetics and delayed no-flow washout.
engine = Path('src/simulation/engine.ts')
text = engine.read_text()
text = text.replace(
"""  // At VCO2 250 mL/min, 1.1 L/kg PBW gives an apnoeic rise of about 3 mmHg/min
  // in a typical adult. VCO2 scales the rise directly.
  const co2BufferCapacityL = Math.max(30, pbw * 1.1)
""",
"""  // For teaching, use a deliberately smaller effective buffered store than a
  // full physiologic model: at VCO2 250 mL/min, 0.55 L/kg PBW gives an apnoeic
  // rise of about 6 mmHg/min in a typical adult. VCO2 scales the rise directly.
  const co2BufferCapacityL = Math.max(15, pbw * 0.55)
""",
1,
)
old_airway = """  // A sidestream/mainstream capnogram samples gas moving past the airway sensor.
  // Once expiratory flow has effectively stopped, the airway/sampling volume is
  // no longer replenished from alveoli and its displayed CO2 slowly washes out,
  // even though the patient's internal CO2 store continues to rise.
  const target = activeExpiratoryFlow
    ? capnogramSourceValue(true, elapsedExpiration, patient, complianceL, state.alveolarCo2)
    : 0
  const sensorResponseSeconds = activeExpiratoryFlow ? 0.10 : expiratory ? 4.0 : 0.15
  const fraction = 1 - Math.exp(-dt / sensorResponseSeconds)
  state.airwayCo2 = clamp(state.airwayCo2 + (target - state.airwayCo2) * fraction, 0, 150)
  return state.airwayCo2
"""
new_airway = """  // During an ordinary expiration, do not wash the sampled airway CO2 away just
  // because expiratory flow has fallen below the terminal-flow threshold. Hold
  // the last sampled value for the first 8 seconds of expiration. Only a truly
  // prolonged expiration/apnoeic interval starts the slow no-flow washout.
  if (!activeExpiratoryFlow && expiratory && elapsedExpiration < 8) return state.airwayCo2

  const target = activeExpiratoryFlow
    ? capnogramSourceValue(true, elapsedExpiration, patient, complianceL, state.alveolarCo2)
    : 0
  const sensorResponseSeconds = activeExpiratoryFlow ? 0.10 : expiratory ? 4.0 : 0.15
  const fraction = 1 - Math.exp(-dt / sensorResponseSeconds)
  state.airwayCo2 = clamp(state.airwayCo2 + (target - state.airwayCo2) * fraction, 0, 150)
  return state.airwayCo2
"""
if old_airway not in text:
    raise SystemExit('airway CO2 anchor not found')
text = text.replace(old_airway, new_airway, 1)
engine.write_text(text)

# Stabilise autoscale around clinically useful minimum display ranges.
wave = Path('src/components/Waveform.tsx')
text = wave.read_text()
text = text.replace(
"""    const largestMagnitude = Math.max(Math.abs(observedMin), Math.abs(observedMax))
    const limit = Math.max(10, roundedUpToTen(largestMagnitude))
    return { min: -limit, max: limit }
""",
"""    const largestMagnitude = Math.max(Math.abs(observedMin), Math.abs(observedMax))
    const limit = Math.max(50, roundedUpToTen(largestMagnitude))
    return { min: -limit, max: limit }
""",
1,
)
text = text.replace(
"""  let scaledMin = observedMin < 0 ? roundedDownToTen(observedMin) : 0
  let scaledMax = observedMax > 0 ? roundedUpToTen(observedMax) : 0

  if (scaledMax - scaledMin < 10) {
""",
"""  let scaledMin = observedMin < 0 ? roundedDownToTen(observedMin) : 0
  let scaledMax = observedMax > 0 ? roundedUpToTen(observedMax) : 0

  const minimumUpperRange = signal === 'pressure' || signal === 'co2'
    ? 30
    : signal === 'volume'
      ? 200
      : 10
  scaledMax = Math.max(minimumUpperRange, scaledMax)

  if (scaledMax - scaledMin < 10) {
""",
1,
)
wave.write_text(text)

# Simulation clock and v0.70 UI/version.
app = Path('src/App.tsx')
text = app.read_text()
text = text.replace(
"""function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
""",
"""function formatSimulationClock(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
""",
1,
)
text = text.replace(
"""  const [diagnosticCopied, setDiagnosticCopied] = useState(false)
  const [candidateAlarmLevelForSession, setCandidateAlarmLevelForSession] = useState<CandidateAlarmLevel>(null)
""",
"""  const [diagnosticCopied, setDiagnosticCopied] = useState(false)
  const [candidateAlarmLevelForSession, setCandidateAlarmLevelForSession] = useState<CandidateAlarmLevel>(null)
  const scenarioClockOriginRef = useRef(WINDOW_SAMPLES * DT)
""",
1,
)
text = text.replace(
"""  const loadInstructorScenario = (scenario: InstructorScenarioSnapshot) => {
    setVentilator({ ...scenario.ventilator })
""",
"""  const loadInstructorScenario = (scenario: InstructorScenarioSnapshot) => {
    scenarioClockOriginRef.current = simulationTimeRef.current
    setVentilator({ ...scenario.ventilator })
""",
1,
)
text = text.replace(
"""  const currentSimulationTime = latestSample?.time ?? simulationTimeRef.current
  const eventMeasures = useMemo(
""",
"""  const currentSimulationTime = latestSample?.time ?? simulationTimeRef.current
  const scenarioElapsedTime = Math.max(0, currentSimulationTime - scenarioClockOriginRef.current)
  const eventMeasures = useMemo(
""",
1,
)
old_top = """        <button
          className={`top-simulation-pause ${frozen ? 'paused' : ''}`}
          type="button"
          onClick={toggleFreeze}
          aria-label={frozen ? 'Resume whole simulation' : 'Pause whole simulation'}
          title={frozen ? 'Resume whole simulation' : 'Pause whole simulation'}
        >
          <PauseIcon paused={frozen} />
          <span>{frozen ? 'RESUME SIMULATION' : 'PAUSE SIMULATION'}</span>
        </button>
"""
new_top = """        <div className="top-simulation-controls">
          <button
            className={`top-simulation-pause ${frozen ? 'paused' : ''}`}
            type="button"
            onClick={toggleFreeze}
            aria-label={frozen ? 'Resume whole simulation' : 'Pause whole simulation'}
            title={frozen ? 'Resume whole simulation' : 'Pause whole simulation'}
          >
            <PauseIcon paused={frozen} />
            <span>{frozen ? 'RESUME SIMULATION' : 'PAUSE SIMULATION'}</span>
          </button>
          <div className={`simulation-clock ${frozen ? 'paused' : ''}`} aria-label={`Simulation time ${formatSimulationClock(scenarioElapsedTime)}`}>
            <span>TIME</span>
            <strong>{formatSimulationClock(scenarioElapsedTime)}</strong>
          </div>
        </div>
"""
if old_top not in text:
    raise SystemExit('top pause anchor not found')
text = text.replace(old_top, new_top, 1)
text = text.replace("appVersion: '0.69'", "appVersion: '0.70'")
text = text.replace('v0.69', 'v0.70')
app.write_text(text)

# Clock styling.
styles = Path('src/styles.css')
text = styles.read_text()
anchor = ".top-simulation-pause.paused { color: #ffe39b; border-color: #b28a38; background: linear-gradient(#40351c,#2a2214); }\n"
addition = """.top-simulation-pause.paused { color: #ffe39b; border-color: #b28a38; background: linear-gradient(#40351c,#2a2214); }
.top-simulation-controls { justify-self: center; display: flex; align-items: stretch; gap: 9px; }
.simulation-clock { min-width: 82px; min-height: 56px; padding: 8px 11px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid #3b505c; border-radius: 10px; background: #111a20; box-shadow: inset 0 1px 0 rgba(255,255,255,.05); font-variant-numeric: tabular-nums; }
.simulation-clock span { font-size: 8px; line-height: 1; letter-spacing: .16em; color: #718791; font-weight: 800; }
.simulation-clock strong { margin-top: 5px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 17px; line-height: 1; letter-spacing: .03em; color: #d8eef5; }
.simulation-clock.paused { border-color: #806a37; background: #211c12; }
.simulation-clock.paused strong { color: #ffe39b; }
"""
if anchor not in text:
    raise SystemExit('clock CSS anchor not found')
text = text.replace(anchor, addition, 1)
styles.write_text(text)

# Keep all visible version strings aligned.
for path in [
    'src/diagnostics.ts',
    'src/components/SessionPanel.tsx',
    'src/components/InstructorAccountControls.tsx',
]:
    p = Path(path)
    if p.exists():
        p.write_text(p.read_text().replace('0.69', '0.70'))

print('v0.70 patch applied')
