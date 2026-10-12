from pathlib import Path

p = Path("src/App.tsx")
text = p.read_text()

old = '''function DualAlarmSlider({ label, unit, min, max, step, low, high, onLowChange, onHighChange }: { label: string; unit: string; min: number; max: number; step: number; low: number; high: number; onLowChange: (value: number) => void; onHighChange: (value: number) => void }) {
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
new = '''function VerticalDualAlarmSlider({ label, unit, min, max, step, low, high, onLowChange, onHighChange }: { label: string; unit: string; min: number; max: number; step: number; low: number; high: number; onLowChange: (value: number) => void; onHighChange: (value: number) => void }) {
  const span = Math.max(0.0001, max - min)
  const lowPct = ((low - min) / span) * 100
  const highPct = ((high - min) / span) * 100
  return (
    <div className="alarm-slider-card vertical-dual-card">
      <span>{label}</span>
      <strong>{low}–{high} <small>{unit}</small></strong>
      <div className="vertical-dual-slider-wrap">
        <em>{max}</em>
        <div className="vertical-dual-range">
          <div className="vertical-dual-track" />
          <div className="vertical-dual-active" style={{ bottom: `${lowPct}%`, height: `${Math.max(0, highPct - lowPct)}%` }} />
          <input className="vertical-dual-input low" type="range" min={min} max={max} step={step} value={low} onChange={(event) => onLowChange(Number(event.target.value))} aria-label={`${label} minimum alarm limit`} />
          <input className="vertical-dual-input high" type="range" min={min} max={max} step={step} value={high} onChange={(event) => onHighChange(Number(event.target.value))} aria-label={`${label} maximum alarm limit`} />
        </div>
        <em>{min}</em>
      </div>
    </div>
  )
}
'''
if old not in text: raise SystemExit("dual slider component marker not found")
text = text.replace(old,new,1)

old = '''  const co2LowAlarmActive = endTidalCO2 != null && endTidalCO2 < alarmLimits.co2Min
  const co2HighAlarmActive = endTidalCO2 != null && endTidalCO2 > alarmLimits.co2Max
  const minuteVentilationAvailable = measures.minuteVentilation > 0 || currentSimulationTime >= 5
'''
new = '''  const minuteVentilationAvailable = measures.minuteVentilation > 0 || currentSimulationTime >= 5
'''
if old not in text: raise SystemExit("co2 alarm marker not found")
text = text.replace(old,new,1)

old = '''  const alarmConditions = {
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
'''
new = '''  const alarmConditions = {
    apnea: apneaAlarmActive,
    pressure: pressureAlarmActive,
    minuteVentilationLow: minuteVentilationLowAlarmActive,
    minuteVentilationHigh: minuteVentilationHighAlarmActive,
    tidalVolumeLow: tidalVolumeLowAlarmActive,
    tidalVolumeHigh: tidalVolumeHighAlarmActive,
    respiratoryRateLow: respiratoryRateLowAlarmActive,
    respiratoryRateHigh: respiratoryRateHighAlarmActive,
    oxygenFailure: oxygenFailureActive,
  }
'''
if old not in text: raise SystemExit("alarmConditions marker not found")
text = text.replace(old,new,1)

old = '''    co2LowAlarmActive,
    co2HighAlarmActive,
    minuteVentilationLowAlarmActive,
'''
new = '''    minuteVentilationLowAlarmActive,
'''
if old not in text: raise SystemExit("effect deps co2 marker not found")
text = text.replace(old,new,1)

old = '''  const activeAlarmOnsets = Object.values(alarmOnsets).filter((value): value is number => value != null)
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
'''
new = '''  const anyAlarmActive = Object.values(alarmConditions).some(Boolean)
  const criticalAlarmKeys = ['pressure', 'apnea', 'oxygenFailure'] as const
  const criticalEscalated = criticalAlarmKeys.some((key) => {
    if (!alarmConditions[key]) return false
    const onset = alarmOnsets[key]
    return onset != null && currentSimulationTime - onset >= 15
  })
  const alarmLevel = anyAlarmActive ? (criticalEscalated ? 'red' : 'yellow') : null
  const alarmLabels = [
    pressureAlarmActive ? 'HIGH PRESSURE' : null,
    apneaAlarmActive ? 'APNOEA' : null,
    minuteVentilationLowAlarmActive ? 'LOW MINUTE VENTILATION' : null,
'''
if old not in text: raise SystemExit("alarm level marker not found")
text = text.replace(old,new,1)

old = '''        co2LowActive: co2LowAlarmActive,
        co2HighActive: co2HighAlarmActive,
        minuteVentilationLowActive: minuteVentilationLowAlarmActive,
'''
new = '''        minuteVentilationLowActive: minuteVentilationLowAlarmActive,
'''
if old not in text: raise SystemExit("diagnostic co2 alarm marker not found")
text = text.replace(old,new,1)

old = '''                  <div className="alarm-slider-grid">
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
                  </div>
'''
new = '''                  <div className="alarm-slider-grid five-alarm-grid">
                    <label className="alarm-slider-card critical-alarm-card">
                      <span>Peak pressure</span>
                      <small className="alarm-priority">Critical</small>
                      <strong>{alarmLimits.peakPressure} <small>cmH₂O</small></strong>
                      <div className="vertical-slider-wrap">
                        <em>60</em>
                        <input className="vertical-alarm-slider" type="range" min="0" max="60" step="1" value={alarmLimits.peakPressure} onChange={(event) => setAlarmLimits((current) => ({ ...current, peakPressure: Number(event.target.value) }))} />
                        <em>0</em>
                      </div>
                    </label>
                    <VerticalDualAlarmSlider label="Minute ventilation" unit="L/min" min={0} max={20} step={0.5} low={alarmLimits.minuteVentilationMin} high={alarmLimits.minuteVentilationMax} onLowChange={(value) => setAlarmLimits((current) => ({ ...current, minuteVentilationMin: Math.min(value, current.minuteVentilationMax) }))} onHighChange={(value) => setAlarmLimits((current) => ({ ...current, minuteVentilationMax: Math.max(value, current.minuteVentilationMin) }))} />
                    <VerticalDualAlarmSlider label="Tidal volume" unit="mL" min={0} max={1000} step={10} low={alarmLimits.tidalVolumeMin} high={alarmLimits.tidalVolumeMax} onLowChange={(value) => setAlarmLimits((current) => ({ ...current, tidalVolumeMin: Math.min(value, current.tidalVolumeMax) }))} onHighChange={(value) => setAlarmLimits((current) => ({ ...current, tidalVolumeMax: Math.max(value, current.tidalVolumeMin) }))} />
                    <VerticalDualAlarmSlider label="Respiratory rate" unit="/min" min={0} max={40} step={1} low={alarmLimits.respiratoryRateMin} high={alarmLimits.respiratoryRateMax} onLowChange={(value) => setAlarmLimits((current) => ({ ...current, respiratoryRateMin: Math.min(value, current.respiratoryRateMax) }))} onHighChange={(value) => setAlarmLimits((current) => ({ ...current, respiratoryRateMax: Math.max(value, current.respiratoryRateMin) }))} />
                    <label className="alarm-slider-card critical-alarm-card">
                      <span>Apnoea time</span>
                      <small className="alarm-priority">Critical</small>
                      <strong>{alarmLimits.apneaTime} <small>s</small></strong>
                      <div className="vertical-slider-wrap">
                        <em>120</em>
                        <input className="vertical-alarm-slider" type="range" min="15" max="120" step="5" value={alarmLimits.apneaTime} onChange={(event) => setAlarmLimits((current) => ({ ...current, apneaTime: Number(event.target.value) }))} />
                        <em>15</em>
                      </div>
                    </label>
                  </div>
'''
if old not in text: raise SystemExit("alarm dialog marker not found")
text = text.replace(old,new,1)

if "appVersion: '0.41'" not in text: raise SystemExit("version marker 1 not found")
text = text.replace("appVersion: '0.41'", "appVersion: '0.42'", 1)
if '<span className="version">v0.41</span>' not in text: raise SystemExit("version marker 2 not found")
text = text.replace('<span className="version">v0.41</span>', '<span className="version">v0.42</span>', 1)
p.write_text(text)

p = Path("src/alarm.css")
css = p.read_text()
if "width: min(560px, 96%);" not in css: raise SystemExit("dialog width marker not found")
css = css.replace("width: min(560px, 96%);", "width: min(760px, 98%);", 1)
oldgrid = ".alarm-slider-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; padding: 6px 0 10px; }"
if oldgrid not in css: raise SystemExit("grid marker not found")
css = css.replace(oldgrid, ".alarm-slider-grid { display: grid; grid-template-columns: repeat(5,minmax(110px,1fr)); gap: 10px; padding: 6px 0 10px; overflow-x: auto; }",1)
css += r'''
.alarm-priority { display: block; min-height: 14px; margin-top: -5px; color: #d4a83d; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
.critical-alarm-card { border-color: #665126; }
.vertical-dual-card > strong { margin-top: 4px; }
.vertical-dual-slider-wrap { height: 220px; display: grid; grid-template-rows: auto 1fr auto; justify-items: center; gap: 5px; }
.vertical-dual-slider-wrap em { color: #667982; font-size: 9px; font-style: normal; }
.vertical-dual-range { position: relative; width: 34px; height: 190px; }
.vertical-dual-track, .vertical-dual-active { position: absolute; left: 14px; width: 6px; border-radius: 999px; pointer-events: none; }
.vertical-dual-track { top: 0; bottom: 0; background: #3f4b52; }
.vertical-dual-active { background: #e6b83c; }
.vertical-dual-input { position: absolute; inset: 0; width: 34px !important; height: 190px; margin: 0; writing-mode: vertical-lr; direction: rtl; appearance: none; -webkit-appearance: none; background: transparent; pointer-events: none; }
.vertical-dual-input::-webkit-slider-runnable-track { width: 6px; background: transparent; }
.vertical-dual-input::-webkit-slider-thumb { width: 16px; height: 16px; margin-left: -5px; border: 2px solid #f7dda0; border-radius: 50%; background: #d8a92b; pointer-events: auto; -webkit-appearance: none; cursor: ns-resize; box-shadow: 0 1px 4px rgba(0,0,0,.55); }
.vertical-dual-input::-moz-range-track { width: 6px; background: transparent; }
.vertical-dual-input::-moz-range-thumb { width: 14px; height: 14px; border: 2px solid #f7dda0; border-radius: 50%; background: #d8a92b; pointer-events: auto; cursor: ns-resize; box-shadow: 0 1px 4px rgba(0,0,0,.55); }
.vertical-dual-input.low { z-index: 3; }
.vertical-dual-input.high { z-index: 4; }
@media (max-width: 760px) {
  .alarm-dialog { width: min(96vw, 760px); }
  .alarm-slider-grid { grid-template-columns: repeat(5,110px); }
}
'''
p.write_text(css)
