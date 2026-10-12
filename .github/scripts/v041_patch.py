from pathlib import Path

p = Path("src/App.tsx")
text = p.read_text()

text = text.replace(
'''interface AlarmLimits {
  apneaTime: number
  peakPressure: number
}''',
'''interface AlarmLimits {
  apneaTime: number
  peakPressure: number
  co2Min: number
  co2Max: number
  minuteVentilationMin: number
  minuteVentilationMax: number
  tidalVolumeMin: number
  tidalVolumeMax: number
  respiratoryRateMin: number
  respiratoryRateMax: number
}''')

text = text.replace(
"const initialAlarmLimits: AlarmLimits = { apneaTime: 30, peakPressure: 40 }",
'''const initialAlarmLimits: AlarmLimits = {
  apneaTime: 30,
  peakPressure: 40,
  co2Min: 30,
  co2Max: 50,
  minuteVentilationMin: 3,
  minuteVentilationMax: 12,
  tidalVolumeMin: 250,
  tidalVolumeMax: 600,
  respiratoryRateMin: 10,
  respiratoryRateMax: 25,
}''')

old_loader = '''    return {
      apneaTime: Math.max(15, Math.min(120, stored.apneaTime)),
      peakPressure: Math.max(0, Math.min(60, stored.peakPressure)),
    }'''
new_loader = '''    const co2Min = Math.max(0, Math.min(100, stored.co2Min))
    const co2Max = Math.max(co2Min, Math.min(100, stored.co2Max))
    const minuteVentilationMin = Math.max(0, Math.min(20, stored.minuteVentilationMin))
    const minuteVentilationMax = Math.max(minuteVentilationMin, Math.min(20, stored.minuteVentilationMax))
    const tidalVolumeMin = Math.max(0, Math.min(1000, stored.tidalVolumeMin))
    const tidalVolumeMax = Math.max(tidalVolumeMin, Math.min(1000, stored.tidalVolumeMax))
    const respiratoryRateMin = Math.max(0, Math.min(40, stored.respiratoryRateMin))
    const respiratoryRateMax = Math.max(respiratoryRateMin, Math.min(40, stored.respiratoryRateMax))
    return {
      apneaTime: Math.max(15, Math.min(120, stored.apneaTime)),
      peakPressure: Math.max(0, Math.min(60, stored.peakPressure)),
      co2Min,
      co2Max,
      minuteVentilationMin,
      minuteVentilationMax,
      tidalVolumeMin,
      tidalVolumeMax,
      respiratoryRateMin,
      respiratoryRateMax,
    }'''
if old_loader not in text:
    raise SystemExit("alarm loader marker not found")
text = text.replace(old_loader, new_loader, 1)

text = text.replace(
'''  const [alarmOnsets, setAlarmOnsets] = useState<{ apnea: number | null; pressure: number | null }>({ apnea: null, pressure: null })''',
'''  const [alarmOnsets, setAlarmOnsets] = useState<Record<string, number | null>>({
    apnea: null,
    pressure: null,
    co2Low: null,
    co2High: null,
    minuteVentilationLow: null,
    minuteVentilationHigh: null,
    tidalVolumeLow: null,
    tidalVolumeHigh: null,
    respiratoryRateLow: null,
    respiratoryRateHigh: null,
    oxygenFailure: null,
  })''')

marker = '''  const pressureAlarmActive = useMemo(
    () => isHighPressureAlarmActive(timeline, alarmLimits.peakPressure),
    [timeline, alarmLimits.peakPressure],
  )

  useEffect(() => {'''
replacement = '''  const pressureAlarmActive = useMemo(
    () => isHighPressureAlarmActive(timeline, alarmLimits.peakPressure),
    [timeline, alarmLimits.peakPressure],
  )
  const co2LowAlarmActive = endTidalCO2 != null && endTidalCO2 < alarmLimits.co2Min
  const co2HighAlarmActive = endTidalCO2 != null && endTidalCO2 > alarmLimits.co2Max
  const minuteVentilationAvailable = measures.minuteVentilation > 0 || currentSimulationTime >= 5
  const minuteVentilationLowAlarmActive = minuteVentilationAvailable && measures.minuteVentilation < alarmLimits.minuteVentilationMin
  const minuteVentilationHighAlarmActive = minuteVentilationAvailable && measures.minuteVentilation > alarmLimits.minuteVentilationMax
  const tidalVolumeAvailable = eventMeasures.tidalVolume > 0
  const tidalVolumeLowAlarmActive = tidalVolumeAvailable && eventMeasures.tidalVolume < alarmLimits.tidalVolumeMin
  const tidalVolumeHighAlarmActive = tidalVolumeAvailable && eventMeasures.tidalVolume > alarmLimits.tidalVolumeMax
  const respiratoryRateAvailable = eventMeasures.respiratoryRate > 0 || currentSimulationTime >= 5
  const respiratoryRateLowAlarmActive = respiratoryRateAvailable && eventMeasures.respiratoryRate < alarmLimits.respiratoryRateMin
  const respiratoryRateHighAlarmActive = respiratoryRateAvailable && eventMeasures.respiratoryRate > alarmLimits.respiratoryRateMax
  // Reserved for upcoming scenario/instructor controls.
  const oxygenFailureActive = false

  const alarmConditions = {
    apnea: apneaAlarmActive,
    pressure: pressureAlarmActive,
    co2Low: co2LowAlarmActive,
    co2High: co2HighAlarmActive,
    minuteVentilationLow: minuteVentilationLowAlarmActive,
    minuteVentilationHigh: minuteVentilationHighAlarmActive,
    tidalVolumeLow: tidalVolumeLowAlarmActive,
    tidalVolumeHigh: tidalVolumeHighAlarmActive,
    respiratoryRateLow: respiratoryRateLowAlarmActive,
    respiratoryRateHigh: respiratoryRateHighAlarmActive,
    oxygenFailure: oxygenFailureActive,
  }

  useEffect(() => {'''
if marker not in text:
    raise SystemExit("pressure alarm marker not found")
text = text.replace(marker, replacement, 1)

old_effect = '''  useEffect(() => {
    setAlarmOnsets((current) => {
      let changed = false
      const next = { ...current }
      if (apneaAlarmActive && next.apnea == null) { next.apnea = currentSimulationTime; changed = true }
      if (!apneaAlarmActive && next.apnea != null) { next.apnea = null; changed = true }
      if (pressureAlarmActive && next.pressure == null) { next.pressure = currentSimulationTime; changed = true }
      if (!pressureAlarmActive && next.pressure != null) { next.pressure = null; changed = true }
      return changed ? next : current
    })
  }, [apneaAlarmActive, pressureAlarmActive, currentSimulationTime])

  const activeAlarmOnsets = [alarmOnsets.apnea, alarmOnsets.pressure].filter((value): value is number => value != null)
  const earliestAlarmOnset = activeAlarmOnsets.length ? Math.min(...activeAlarmOnsets) : null
  const alarmLevel = (apneaAlarmActive || pressureAlarmActive)
    ? earliestAlarmOnset != null && currentSimulationTime - earliestAlarmOnset >= 15 ? 'red' : 'yellow'
    : null
  const alarmLabels = [
    pressureAlarmActive ? 'HIGH PRESSURE' : null,
    apneaAlarmActive ? 'APNOEA' : null,
  ].filter((value): value is string => value != null)'''
new_effect = '''  useEffect(() => {
    setAlarmOnsets((current) => {
      let changed = false
      const next = { ...current }
      for (const [key, active] of Object.entries(alarmConditions)) {
        if (active && next[key] == null) { next[key] = currentSimulationTime; changed = true }
        if (!active && next[key] != null) { next[key] = null; changed = true }
      }
      return changed ? next : current
    })
  }, [
    apneaAlarmActive,
    pressureAlarmActive,
    co2LowAlarmActive,
    co2HighAlarmActive,
    minuteVentilationLowAlarmActive,
    minuteVentilationHighAlarmActive,
    tidalVolumeLowAlarmActive,
    tidalVolumeHighAlarmActive,
    respiratoryRateLowAlarmActive,
    respiratoryRateHighAlarmActive,
    oxygenFailureActive,
    currentSimulationTime,
  ])

  const activeAlarmOnsets = Object.values(alarmOnsets).filter((value): value is number => value != null)
  const earliestAlarmOnset = activeAlarmOnsets.length ? Math.min(...activeAlarmOnsets) : null
  const anyAlarmActive = Object.values(alarmConditions).some(Boolean)
  const alarmLevel = anyAlarmActive
    ? earliestAlarmOnset != null && currentSimulationTime - earliestAlarmOnset >= 15 ? 'red' : 'yellow'
    : null
  const alarmLabels = [
    pressureAlarmActive ? 'HIGH PRESSURE' : null,
    apneaAlarmActive ? 'APNOEA' : null,
    co2LowAlarmActive ? 'LOW EtCO₂' : null,
    co2HighAlarmActive ? 'HIGH EtCO₂' : null,
    minuteVentilationLowAlarmActive ? 'LOW MINUTE VENTILATION' : null,
    minuteVentilationHighAlarmActive ? 'HIGH MINUTE VENTILATION' : null,
    tidalVolumeLowAlarmActive ? 'LOW TIDAL VOLUME' : null,
    tidalVolumeHighAlarmActive ? 'HIGH TIDAL VOLUME' : null,
    respiratoryRateLowAlarmActive ? 'LOW RESPIRATORY RATE' : null,
    respiratoryRateHighAlarmActive ? 'HIGH RESPIRATORY RATE' : null,
    oxygenFailureActive ? 'OXYGEN FAILURE' : null,
  ].filter((value): value is string => value != null)'''
if old_effect not in text:
    raise SystemExit("alarm effect marker not found")
text = text.replace(old_effect, new_effect, 1)

text = text.replace(
'''      alarms: { apneaActive: apneaAlarmActive, highPressureActive: pressureAlarmActive, level: alarmLevel, labels: alarmLabels, onsets: alarmOnsets },''',
'''      alarms: {
        apneaActive: apneaAlarmActive,
        highPressureActive: pressureAlarmActive,
        co2LowActive: co2LowAlarmActive,
        co2HighActive: co2HighAlarmActive,
        minuteVentilationLowActive: minuteVentilationLowAlarmActive,
        minuteVentilationHighActive: minuteVentilationHighAlarmActive,
        tidalVolumeLowActive: tidalVolumeLowAlarmActive,
        tidalVolumeHighActive: tidalVolumeHighAlarmActive,
        respiratoryRateLowActive: respiratoryRateLowAlarmActive,
        respiratoryRateHighActive: respiratoryRateHighAlarmActive,
        oxygenFailureActive,
        level: alarmLevel,
        labels: alarmLabels,
        onsets: alarmOnsets,
      },''')

text = text.replace("appVersion: '0.40'", "appVersion: '0.41'", 1)
text = text.replace('<span className="version">v0.40</span>', '<span className="version">v0.41</span>', 1)

old_dialog = '''                  <div className="alarm-slider-grid">
                    <label className="alarm-slider-card">
                      <span>Peak pressure</span>
                      <strong>{alarmLimits.peakPressure} <small>cmH₂O</small></strong>
                      <div className="vertical-slider-wrap">
                        <em>60</em>
                        <input
                          className="vertical-alarm-slider"
                          type="range"
                          min="0"
                          max="60"
                          step="1"
                          value={alarmLimits.peakPressure}
                          onChange={(event) => setAlarmLimits((current) => ({ ...current, peakPressure: Number(event.target.value) }))}
                        />
                        <em>0</em>
                      </div>
                    </label>
                    <label className="alarm-slider-card">
                      <span>Apnoea time</span>
                      <strong>{alarmLimits.apneaTime} <small>s</small></strong>
                      <div className="vertical-slider-wrap">
                        <em>120</em>
                        <input
                          className="vertical-alarm-slider"
                          type="range"
                          min="15"
                          max="120"
                          step="5"
                          value={alarmLimits.apneaTime}
                          onChange={(event) => setAlarmLimits((current) => ({ ...current, apneaTime: Number(event.target.value) }))}
                        />
                        <em>15</em>
                      </div>
                    </label>
                  </div>'''
new_dialog = '''                  <div className="alarm-slider-grid">
                    <label className="alarm-slider-card">
                      <span>Peak pressure</span>
                      <strong>{alarmLimits.peakPressure} <small>cmH₂O</small></strong>
                      <div className="vertical-slider-wrap">
                        <em>60</em>
                        <input className="vertical-alarm-slider" type="range" min="0" max="60" step="1" value={alarmLimits.peakPressure} onChange={(event) => setAlarmLimits((current) => ({ ...current, peakPressure: Number(event.target.value) }))} />
                        <em>0</em>
                      </div>
                    </label>
                    <label className="alarm-slider-card">
                      <span>Apnoea time</span>
                      <strong>{alarmLimits.apneaTime} <small>s</small></strong>
                      <div className="vertical-slider-wrap">
                        <em>120</em>
                        <input className="vertical-alarm-slider" type="range" min="15" max="120" step="5" value={alarmLimits.apneaTime} onChange={(event) => setAlarmLimits((current) => ({ ...current, apneaTime: Number(event.target.value) }))} />
                        <em>15</em>
                      </div>
                    </label>
                  </div>
                  <div className="dual-alarm-section">
                    <DualAlarmSlider label="EtCO₂" unit="mmHg" min={0} max={100} step={1} low={alarmLimits.co2Min} high={alarmLimits.co2Max} onLowChange={(value) => setAlarmLimits((current) => ({ ...current, co2Min: Math.min(value, current.co2Max) }))} onHighChange={(value) => setAlarmLimits((current) => ({ ...current, co2Max: Math.max(value, current.co2Min) }))} />
                    <DualAlarmSlider label="Minute ventilation" unit="L/min" min={0} max={20} step={0.5} low={alarmLimits.minuteVentilationMin} high={alarmLimits.minuteVentilationMax} onLowChange={(value) => setAlarmLimits((current) => ({ ...current, minuteVentilationMin: Math.min(value, current.minuteVentilationMax) }))} onHighChange={(value) => setAlarmLimits((current) => ({ ...current, minuteVentilationMax: Math.max(value, current.minuteVentilationMin) }))} />
                    <DualAlarmSlider label="Tidal volume" unit="mL" min={0} max={1000} step={10} low={alarmLimits.tidalVolumeMin} high={alarmLimits.tidalVolumeMax} onLowChange={(value) => setAlarmLimits((current) => ({ ...current, tidalVolumeMin: Math.min(value, current.tidalVolumeMax) }))} onHighChange={(value) => setAlarmLimits((current) => ({ ...current, tidalVolumeMax: Math.max(value, current.tidalVolumeMin) }))} />
                    <DualAlarmSlider label="Respiratory rate" unit="/min" min={0} max={40} step={1} low={alarmLimits.respiratoryRateMin} high={alarmLimits.respiratoryRateMax} onLowChange={(value) => setAlarmLimits((current) => ({ ...current, respiratoryRateMin: Math.min(value, current.respiratoryRateMax) }))} onHighChange={(value) => setAlarmLimits((current) => ({ ...current, respiratoryRateMax: Math.max(value, current.respiratoryRateMin) }))} />
                    <div className="oxygen-failure-alarm-row"><span>Oxygen failure</span><strong>Enabled</strong><small>Scenario control coming in instructor mode</small></div>
                  </div>'''
if old_dialog not in text:
    raise SystemExit("alarm dialog marker not found")
text = text.replace(old_dialog, new_dialog, 1)

insert_after = '''function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{unit}</small></div>
}
'''
dual_component = '''
function DualAlarmSlider({ label, unit, min, max, step, low, high, onLowChange, onHighChange }: { label: string; unit: string; min: number; max: number; step: number; low: number; high: number; onLowChange: (value: number) => void; onHighChange: (value: number) => void }) {
  const span = Math.max(0.0001, max - min)
  const lowPct = ((low - min) / span) * 100
  const highPct = ((high - min) / span) * 100
  return (
    <div className="dual-alarm-card">
      <div className="dual-alarm-heading"><span>{label}</span><strong>{low}–{high} <small>{unit}</small></strong></div>
      <div className="dual-range-wrap">
        <div className="dual-range-track" />
        <div className="dual-range-active" style={{ left: `${lowPct}%`, width: `${Math.max(0, highPct - lowPct)}%` }} />
        <input className="dual-range-input low" type="range" min={min} max={max} step={step} value={low} onChange={(event) => onLowChange(Number(event.target.value))} aria-label={`${label} minimum alarm limit`} />
        <input className="dual-range-input high" type="range" min={min} max={max} step={step} value={high} onChange={(event) => onHighChange(Number(event.target.value))} aria-label={`${label} maximum alarm limit`} />
      </div>
      <div className="dual-range-scale"><span>{min}</span><span>{max}</span></div>
    </div>
  )
}
'''
if insert_after not in text:
    raise SystemExit("metric insertion marker not found")
text = text.replace(insert_after, insert_after + dual_component, 1)
p.write_text(text)

p = Path("src/alarm.css")
css = p.read_text()
old = ".alarm-dialog { width: min(410px, 94%); padding: 16px;"
new = ".alarm-dialog { width: min(560px, 96%); max-height: min(82vh, 720px); overflow-y: auto; padding: 16px;"
if old not in css:
    raise SystemExit("alarm dialog css marker not found")
css = css.replace(old, new, 1)
css += '''
.dual-alarm-section { display: grid; gap: 10px; padding: 4px 0 8px; }
.dual-alarm-card { padding: 10px 12px 8px; border: 1px solid #2c3b44; border-radius: 9px; background: #0b1217; }
.dual-alarm-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 9px; }
.dual-alarm-heading > span { color: #a9b8bf; font-size: 10px; text-transform: uppercase; letter-spacing: .07em; }
.dual-alarm-heading > strong { color: #eef6f8; font-size: 14px; }
.dual-alarm-heading small { color: #82949d; font-size: 9px; font-weight: 500; }
.dual-range-wrap { position: relative; height: 24px; margin: 0 2px; }
.dual-range-track, .dual-range-active { position: absolute; top: 10px; height: 5px; border-radius: 999px; pointer-events: none; }
.dual-range-track { left: 0; right: 0; background: #3f4b52; }
.dual-range-active { background: #e6b83c; }
.dual-range-input { position: absolute; inset: 0; width: 100% !important; height: 24px; margin: 0; background: transparent; pointer-events: none; appearance: none; -webkit-appearance: none; }
.dual-range-input::-webkit-slider-runnable-track { height: 5px; background: transparent; }
.dual-range-input::-webkit-slider-thumb { width: 16px; height: 16px; margin-top: -5.5px; border: 2px solid #f7dda0; border-radius: 50%; background: #d8a92b; pointer-events: auto; -webkit-appearance: none; cursor: ew-resize; box-shadow: 0 1px 4px rgba(0,0,0,.55); }
.dual-range-input::-moz-range-track { height: 5px; background: transparent; }
.dual-range-input::-moz-range-thumb { width: 14px; height: 14px; border: 2px solid #f7dda0; border-radius: 50%; background: #d8a92b; pointer-events: auto; cursor: ew-resize; box-shadow: 0 1px 4px rgba(0,0,0,.55); }
.dual-range-input.low { z-index: 3; }
.dual-range-input.high { z-index: 4; }
.dual-range-scale { display: flex; justify-content: space-between; color: #667982; font-size: 9px; }
.oxygen-failure-alarm-row { display: grid; grid-template-columns: 1fr auto; gap: 3px 12px; padding: 10px 12px; border: 1px solid #2c3b44; border-radius: 9px; background: #0b1217; }
.oxygen-failure-alarm-row span { color: #a9b8bf; font-size: 10px; text-transform: uppercase; letter-spacing: .07em; }
.oxygen-failure-alarm-row strong { color: #eef6f8; font-size: 12px; }
.oxygen-failure-alarm-row small { grid-column: 1 / -1; color: #667982; font-size: 9px; }
'''
p.write_text(css)
