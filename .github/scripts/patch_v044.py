from pathlib import Path

app_path = Path('src/App.tsx')
app = app_path.read_text()
old = '''function VerticalDualAlarmSlider({ label, unit, min, max, step, low, high, onLowChange, onHighChange }: { label: string; unit: string; min: number; max: number; step: number; low: number; high: number; onLowChange: (value: number) => void; onHighChange: (value: number) => void }) {
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
          <input className="vertical-dual-input low" type="range" min={min} max={max} step={step} value={low} onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onChange={(event) => onLowChange(Number(event.target.value))} aria-label={`${label} minimum alarm limit`} />
          <input className="vertical-dual-input high" type="range" min={min} max={max} step={step} value={high} onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onChange={(event) => onHighChange(Number(event.target.value))} aria-label={`${label} maximum alarm limit`} />
        </div>
        <em>{min}</em>
      </div>
    </div>
  )
}
'''
new = '''function VerticalDualAlarmSlider({ label, unit, min, max, step, low, high, onLowChange, onHighChange }: { label: string; unit: string; min: number; max: number; step: number; low: number; high: number; onLowChange: (value: number) => void; onHighChange: (value: number) => void }) {
  const span = Math.max(0.0001, max - min)
  const lowPct = ((low - min) / span) * 100
  const highPct = ((high - min) / span) * 100
  const dragging = useRef<'low' | 'high' | null>(null)
  const sliderHeight = 190
  const handleSize = 20
  const travel = sliderHeight - handleSize
  const lowTop = (1 - lowPct / 100) * travel
  const highTop = (1 - highPct / 100) * travel
  const precision = step < 1 ? Math.max(0, Math.ceil(-Math.log10(step))) : 0

  const quantise = (value: number) => {
    const stepped = min + Math.round((value - min) / step) * step
    return Number(Math.min(max, Math.max(min, stepped)).toFixed(precision))
  }
  const setHandleValue = (handle: 'low' | 'high', value: number) => {
    const next = quantise(value)
    if (handle === 'low') onLowChange(Math.min(next, high))
    else onHighChange(Math.max(next, low))
  }
  const valueFromPointer = (clientY: number, track: HTMLDivElement) => {
    const rect = track.getBoundingClientRect()
    const usableTop = rect.top + handleSize / 2
    const usableHeight = Math.max(1, rect.height - handleSize)
    const fraction = Math.min(1, Math.max(0, (usableTop + usableHeight - clientY) / usableHeight))
    return quantise(min + fraction * span)
  }
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const value = valueFromPointer(event.clientY, event.currentTarget)
    const handle: 'low' | 'high' = Math.abs(value - low) <= Math.abs(value - high) ? 'low' : 'high'
    dragging.current = handle
    event.currentTarget.setPointerCapture(event.pointerId)
    setHandleValue(handle, value)
  }
  const continueDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    event.preventDefault()
    setHandleValue(dragging.current, valueFromPointer(event.clientY, event.currentTarget))
  }
  const stopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const onHandleKey = (handle: 'low' | 'high', value: number, event: React.KeyboardEvent<HTMLDivElement>) => {
    const direction = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -1 : 0
    if (!direction) return
    event.preventDefault()
    setHandleValue(handle, value + direction * step)
  }

  return (
    <div className="alarm-slider-card vertical-dual-card">
      <span>{label}</span>
      <strong>{low}–{high} <small>{unit}</small></strong>
      <div className="vertical-dual-slider-wrap">
        <em>{max}</em>
        <div className="vertical-dual-range" onPointerDown={startDrag} onPointerMove={continueDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
          <div className="vertical-dual-track" />
          <div className="vertical-dual-active" style={{ bottom: `${10 + lowPct * 1.7}px`, height: `${Math.max(0, highPct - lowPct) * 1.7}px` }} />
          <div className="vertical-dual-handle low" style={{ top: `${lowTop}px` }} role="slider" tabIndex={0} aria-label={`${label} minimum alarm limit`} aria-valuemin={min} aria-valuemax={high} aria-valuenow={low} onKeyDown={(event) => onHandleKey('low', low, event)} />
          <div className="vertical-dual-handle high" style={{ top: `${highTop}px` }} role="slider" tabIndex={0} aria-label={`${label} maximum alarm limit`} aria-valuemin={low} aria-valuemax={max} aria-valuenow={high} onKeyDown={(event) => onHandleKey('high', high, event)} />
        </div>
        <em>{min}</em>
      </div>
    </div>
  )
}
'''
if old not in app:
    raise SystemExit('VerticalDualAlarmSlider block not found')
app = app.replace(old, new)
app = app.replace("appVersion: '0.43'", "appVersion: '0.44'")
app = app.replace('<span className="version">v0.43</span>', '<span className="version">v0.44</span>')
old_metrics = '''            <aside className="metrics-panel" aria-label="Measured values">
              <div className="metrics-title">Measured</div>
              <div className="metrics-actions">
                <button className="metrics-alarm-limits" type="button" onClick={() => setAlarmDialogOpen(true)} title="Set alarm limits">Alarm limits</button>
              </div>'''
new_metrics = '''            <aside className="metrics-panel" aria-label="Measured values">
              <div className="metrics-actions">
                <button className="metrics-alarm-limits" type="button" onClick={() => setAlarmDialogOpen(true)} title="Set alarm limits">Alarm limits</button>
              </div>
              <div className="metrics-title">Measured</div>'''
if old_metrics not in app:
    raise SystemExit('metrics header block not found')
app = app.replace(old_metrics, new_metrics)
app_path.write_text(app)

styles_path = Path('src/styles.css')
styles = styles_path.read_text()
old_scale = '.waveform-scale { position: absolute; right: 5px; top: 52px; bottom: 4px; display: flex; flex-direction: column; justify-content: space-between; font-size: 9px; color: #61727a; pointer-events: none; }'
new_scale = '.waveform-scale { position: absolute; right: 5px; top: 2px; bottom: 2px; display: flex; flex-direction: column; justify-content: space-between; font-size: 9px; line-height: 1; color: #61727a; pointer-events: none; }'
if old_scale not in styles:
    raise SystemExit('waveform scale CSS not found')
styles = styles.replace(old_scale, new_scale)
old_metric = '.metric span { display: block; font-size: 9px; color: #83939b; text-transform: uppercase; letter-spacing: .08em; }'
new_metric = '.metric span { display: block; font-size: 9px; color: #83939b; text-transform: none; letter-spacing: .08em; }'
if old_metric not in styles:
    raise SystemExit('metric label CSS not found')
styles = styles.replace(old_metric, new_metric)
styles_path.write_text(styles)

alarm_path = Path('src/alarm.css')
alarm = alarm_path.read_text()
old_css = '''.vertical-dual-range { position: relative; width: 34px; height: 190px; }
.vertical-dual-track, .vertical-dual-active { position: absolute; left: 14px; width: 6px; border-radius: 999px; pointer-events: none; }
.vertical-dual-track { top: 0; bottom: 0; background: #3f4b52; }
.vertical-dual-active { background: #e6b83c; }
.vertical-dual-input { position: absolute; inset: 0; width: 34px !important; height: 190px; margin: 0; writing-mode: vertical-lr; direction: rtl; appearance: none; -webkit-appearance: none; background: transparent; pointer-events: none; }
.vertical-dual-input::-webkit-slider-runnable-track { width: 6px; background: transparent; }
.vertical-dual-input::-webkit-slider-thumb { width: 16px; height: 16px; margin-left: -5px; border: 2px solid #f7dda0; border-radius: 50%; background: #d8a92b; pointer-events: auto; -webkit-appearance: none; cursor: ns-resize; box-shadow: 0 1px 4px rgba(0,0,0,.55); }
.vertical-dual-input::-moz-range-track { width: 6px; background: transparent; }
.vertical-dual-input::-moz-range-thumb { width: 14px; height: 14px; border: 2px solid #f7dda0; border-radius: 50%; background: #d8a92b; pointer-events: auto; cursor: ns-resize; box-shadow: 0 1px 4px rgba(0,0,0,.55); }
.vertical-dual-input.low { z-index: 3; }
.vertical-dual-input.high { z-index: 4; }'''
new_css = '''.vertical-dual-range { position: relative; width: 46px; height: 190px; touch-action: none; cursor: ns-resize; }
.vertical-dual-track, .vertical-dual-active { position: absolute; left: 20px; width: 6px; border-radius: 999px; pointer-events: none; }
.vertical-dual-track { top: 10px; bottom: 10px; background: #3f4b52; }
.vertical-dual-active { background: #e6b83c; }
.vertical-dual-handle { position: absolute; left: 13px; z-index: 3; width: 20px; height: 20px; border: 2px solid #f7dda0; border-radius: 50%; background: #d8a92b; box-shadow: 0 1px 4px rgba(0,0,0,.55); pointer-events: none; }
.vertical-dual-handle:focus-visible { outline: 2px solid #8edcff; outline-offset: 2px; }
.vertical-dual-handle.high { z-index: 4; }'''
if old_css not in alarm:
    raise SystemExit('vertical dual CSS block not found')
alarm = alarm.replace(old_css, new_css)
alarm = alarm.replace('  .vertical-dual-input,\n', '')
alarm = alarm.replace('.vertical-dual-input { -webkit-tap-highlight-color: transparent; }', '.vertical-dual-range { -webkit-tap-highlight-color: transparent; }')
alarm_path.write_text(alarm)
