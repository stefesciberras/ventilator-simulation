from pathlib import Path

def rep(path, old, new, count=-1):
    p=Path(path); s=p.read_text()
    if old not in s:
        raise SystemExit(f"missing pattern in {path}: {old[:100]!r}")
    p.write_text(s.replace(old,new,count))

p=Path("src/simulation/types.ts")
s=p.read_text()
s=s.replace("  musclePressure: number\n", "  musclePressure: number\n  co2: number\n  oesophagealPressure: number\n")
p.write_text(s)

rep("src/simulation/engine.ts", """  bipapHigh: boolean
  bipapPhaseStart: number
}""", """  bipapHigh: boolean
  bipapPhaseStart: number
  expirationStartTime: number
}""")
rep("src/simulation/engine.ts", """    bipapHigh: true,
    bipapPhaseStart: 0,
  }""", """    bipapHigh: true,
    bipapPhaseStart: 0,
    expirationStartTime: -100,
  }""")
rep("src/simulation/engine.ts", """function isRequestHeld(t: number, requestTime?: number | null, releaseTime?: number | null): boolean {""", """function capnogramValue(expiratory: boolean, elapsedExpiration: number, expiratoryResistance: number): number {
  if (!expiratory || elapsedExpiration < 0) return 0

  const obstruction = clamp((expiratoryResistance - 8) / 32, 0, 1)
  const deadSpaceDelay = 0.03 + 0.08 * obstruction
  if (elapsedExpiration <= deadSpaceDelay) return 0

  // Increased expiratory resistance slows phase II and progressively converts
  // the normal square capnogram into the sloping \"shark-fin\" of obstruction.
  const riseTime = 0.18 + 0.9 * obstruction
  const riseProgress = clamp((elapsedExpiration - deadSpaceDelay) / riseTime, 0, 1)
  const normalRise = 1 - Math.pow(1 - riseProgress, 4)
  const obstructedRise = Math.pow(riseProgress, 1.25)
  const riseShape = normalRise * (1 - obstruction) + obstructedRise * obstruction
  const etco2 = 36 + 4 * obstruction

  if (riseProgress < 1) return etco2 * riseShape

  const plateauElapsed = elapsedExpiration - deadSpaceDelay - riseTime
  const plateauSlope = 0.8 + 3.5 * obstruction
  return clamp(etco2 + plateauElapsed * plateauSlope, 0, 50)
}

function isRequestHeld(t: number, requestTime?: number | null, releaseTime?: number | null): boolean {""")
rep("src/simulation/engine.ts", """  state.lastBreathEnd = t
  state.suppressEffortUntil = t + postCycleReleaseGuard""", """  state.lastBreathEnd = t
  state.expirationStartTime = t
  state.suppressEffortUntil = t + postCycleReleaseGuard""")
rep("src/simulation/engine.ts", """      if (synchronizedCycleOff || nominalCycleOff || forcedCycleOff) {
        state.bipapHigh = false
        state.bipapPhaseStart = t
      }""", """      if (synchronizedCycleOff || nominalCycleOff || forcedCycleOff) {
        state.bipapHigh = false
        state.bipapPhaseStart = t
        state.expirationStartTime = t
      }""")
rep("src/simulation/engine.ts", """    if (high && !previousHigh) {
      state.breathStart = t
      breathTrigger = 'mandatory'
    }
  }

  const targetPressure""", """    if (high && !previousHigh) {
      state.breathStart = t
      breathTrigger = 'mandatory'
    } else if (!high && previousHigh) {
      state.expirationStartTime = t
    }
  }

  const targetPressure""")
rep("src/simulation/engine.ts", """    volume: state.volume * 1000,
    musclePressure: pmus,
    phase: high ? 'inspiration' : 'expiration',""", """    volume: state.volume * 1000,
    musclePressure: pmus,
    co2: capnogramValue(!high, t - state.expirationStartTime, patient.expiratoryResistance),
    oesophagealPressure: -5 - pmus,
    phase: high ? 'inspiration' : 'expiration',""", 1)
rep("src/simulation/engine.ts", """    volume: state.volume * 1000,
    musclePressure: pmus,
    phase: inspiration ? 'inspiration' : 'expiration',""", """    volume: state.volume * 1000,
    musclePressure: pmus,
    co2: capnogramValue(!inspiration, t - state.expirationStartTime, patient.expiratoryResistance),
    oesophagealPressure: -5 - pmus,
    phase: inspiration ? 'inspiration' : 'expiration',""", 1)
rep("src/components/Waveform.tsx", "type Signal = 'pressure' | 'flow' | 'volume'", "export type Signal = 'pressure' | 'flow' | 'volume' | 'co2' | 'oesophagealPressure'")
rep("src/components/Waveform.tsx", "  const valuePrecision = signal === 'flow' ? 1 : 0", "  const valuePrecision = signal === 'flow' || signal === 'co2' || signal === 'oesophagealPressure' ? 1 : 0")
rep("src/App.tsx", "import { Waveform } from './components/Waveform'", "import { Waveform } from './components/Waveform'\nimport type { Signal } from './components/Waveform'")
rep("src/App.tsx", """interface EventMeasurements {
  peakPressure: number
  tidalVolume: number
  respiratoryRate: number
}

const initialAlarmLimits""", """interface EventMeasurements {
  peakPressure: number
  tidalVolume: number
  respiratoryRate: number
}

type OptionalWaveform = Extract<Signal, 'volume' | 'co2' | 'oesophagealPressure'>

interface WaveformDisplaySettings {
  third: OptionalWaveform
  fourth: OptionalWaveform | null
}

const waveformOptions: Array<{ value: OptionalWaveform; label: string }> = [
  { value: 'volume', label: 'Volume' },
  { value: 'co2', label: 'CO₂' },
  { value: 'oesophagealPressure', label: 'Oesophageal pressure' },
]

const waveformConfig: Record<OptionalWaveform, { label: string; unit: string; min: number; max: number; accent: string }> = {
  volume: { label: 'Volume', unit: 'mL', min: 0, max: 900, accent: '#83e28f' },
  co2: { label: 'CO₂', unit: 'mmHg', min: 0, max: 50, accent: '#d9c85e' },
  oesophagealPressure: { label: 'Pes', unit: 'cmH₂O', min: -20, max: 5, accent: '#d790e8' },
}

const initialWaveformDisplay: WaveformDisplaySettings = { third: 'volume', fourth: null }

const initialAlarmLimits""")
rep("src/App.tsx", "const ALARM_STORAGE_KEY = 'eduvent.alarm-limits'", "const ALARM_STORAGE_KEY = 'eduvent.alarm-limits'\nconst WAVEFORM_STORAGE_KEY = 'eduvent.waveform-display'")
rep("src/App.tsx", "  const [alarmDialogOpen, setAlarmDialogOpen] = useState(false)", """  const [waveformDisplay, setWaveformDisplay] = useState<WaveformDisplaySettings>(() => {
    const stored = loadStoredSettings(WAVEFORM_STORAGE_KEY, initialWaveformDisplay)
    const valid = (value: unknown): value is OptionalWaveform =>
      value === 'volume' || value === 'co2' || value === 'oesophagealPressure'
    return {
      third: valid(stored.third) ? stored.third : 'volume',
      fourth: valid(stored.fourth) ? stored.fourth : null,
    }
  })
  const [alarmDialogOpen, setAlarmDialogOpen] = useState(false)""")
rep("src/App.tsx", """  useEffect(() => {
    window.localStorage.setItem(ALARM_STORAGE_KEY, JSON.stringify(alarmLimits))
  }, [alarmLimits])""", """  useEffect(() => {
    window.localStorage.setItem(ALARM_STORAGE_KEY, JSON.stringify(alarmLimits))
  }, [alarmLimits])

  useEffect(() => {
    window.localStorage.setItem(WAVEFORM_STORAGE_KEY, JSON.stringify(waveformDisplay))
  }, [waveformDisplay])""")
rep("src/App.tsx", '<span className="version">v0.26</span>', '<span className="version">v0.27</span>')
rep("src/App.tsx", """            <div className="waveforms">
              <Waveform samples={samples} signal="pressure" label="Paw" unit="cmH₂O" min={0} max={45} accent="#f6df63" frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} showTime showSimvSyncWindow={ventilator.showSimvSyncWindow} />
              <Waveform samples={samples} signal="flow" label="Flow" unit="L/min" min={-80} max={80} accent="#69d8f1" frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} />
              <Waveform samples={samples} signal="volume" label="Volume" unit="mL" min={0} max={900} accent="#83e28f" frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} />
            </div>""", """            <div className={`waveforms ${waveformDisplay.fourth ? 'four-traces' : ''}`}>
              <Waveform samples={samples} signal="pressure" label="Paw" unit="cmH₂O" min={0} max={45} accent="#f6df63" frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} showTime showSimvSyncWindow={ventilator.showSimvSyncWindow} />
              <Waveform samples={samples} signal="flow" label="Flow" unit="L/min" min={-80} max={80} accent="#69d8f1" frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} />

              <div className="waveform-options-bar">
                <label>
                  <span>Trace 3</span>
                  <select value={waveformDisplay.third} onChange={(event) => setWaveformDisplay((current) => ({ ...current, third: event.target.value as OptionalWaveform }))}>
                    {waveformOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                {waveformDisplay.fourth ? (
                  <>
                    <label>
                      <span>Trace 4</span>
                      <select value={waveformDisplay.fourth} onChange={(event) => setWaveformDisplay((current) => ({ ...current, fourth: event.target.value as OptionalWaveform }))}>
                        {waveformOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <button type="button" onClick={() => setWaveformDisplay((current) => ({ ...current, fourth: null }))}>− 4th trace</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setWaveformDisplay((current) => ({ ...current, fourth: current.third === 'volume' ? 'co2' : 'volume' }))}>+ 4th trace</button>
                )}
              </div>

              {(() => {
                const config = waveformConfig[waveformDisplay.third]
                return <Waveform samples={samples} signal={waveformDisplay.third} label={config.label} unit={config.unit} min={config.min} max={config.max} accent={config.accent} frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} />
              })()}
              {waveformDisplay.fourth && (() => {
                const config = waveformConfig[waveformDisplay.fourth]
                return <Waveform samples={samples} signal={waveformDisplay.fourth} label={config.label} unit={config.unit} min={config.min} max={config.max} accent={config.accent} frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} />
              })()}
            </div>""")
p=Path("src/styles.css")
s=p.read_text()
anchor=".waveforms { padding: 8px 15px 0; min-width: 0; }\n"
addition=anchor+""".waveforms.four-traces .waveform-card { height: 120px; }
.waveform-options-bar { min-height: 38px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 5px 4px 3px; border-bottom: 1px solid #1b262c; }
.waveform-options-bar label { display: flex; align-items: center; gap: 6px; }
.waveform-options-bar label > span { font-size: 9px; color: #738690; text-transform: uppercase; letter-spacing: .08em; }
.waveform-options-bar select { min-width: 116px; height: 27px; border: 1px solid #344751; border-radius: 6px; background: #101a20; color: #dce8ed; padding: 2px 22px 2px 7px; font-size: 10px; }
.waveform-options-bar button { height: 27px; padding: 3px 8px; border-radius: 6px; font-size: 9px; color: #9fb3bc; background: #111a20; }
"""
if anchor not in s: raise SystemExit("CSS anchor missing")
s=s.replace(anchor, addition, 1)
p.write_text(s)
