from pathlib import Path

component_path = Path('src/components/InteractiveVentilatorStrip.tsx')
text = component_path.read_text()
text = text.replace("import { useEffect, useMemo, useRef, useState } from 'react'\n", "import { useEffect, useMemo, useRef, useState } from 'react'\nimport { createPortal } from 'react-dom'\n", 1)
text = text.replace(
"  const [activeKey, setActiveKey] = useState<SettingKey | null>(null)\n  const settleTimerRef = useRef<number | null>(null)\n",
"  const [activeKey, setActiveKey] = useState<SettingKey | null>(null)\n  const settleTimerRef = useRef<number | null>(null)\n  const stripRef = useRef<HTMLDivElement>(null)\n  const [overlayTarget, setOverlayTarget] = useState<HTMLElement | null>(null)\n",
1,
)
cleanup = """  useEffect(() => () => {\n    if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)\n  }, [])\n\n"""
replacement = cleanup + """  useEffect(() => {\n    const consoleElement = stripRef.current?.closest('.ventilator-console')\n    setOverlayTarget(consoleElement?.querySelector<HTMLElement>('.waveforms') ?? null)\n  }, [])\n\n"""
if cleanup not in text:
    raise SystemExit('cleanup anchor not found')
text = text.replace(cleanup, replacement, 1)
text = text.replace(
"    <div className={`interactive-vent-strip ${disabled ? 'disabled' : ''}`} aria-label=\"Ventilator display controls\">",
"    <div ref={stripRef} className={`interactive-vent-strip ${disabled ? 'disabled' : ''}`} aria-label=\"Ventilator display controls\">",
1,
)
old_slider = """      {activeControl && !disabled && (\n        <div className=\"interactive-slider-panel\" role=\"group\" aria-label={`Adjust ${activeControl.label}`}>\n          <span>{activeControl.label}</span>\n          <input\n            className=\"interactive-vent-slider\"\n            type=\"range\"\n            min={activeControl.min}\n            max={activeControl.max}\n            step={activeControl.step}\n            value={activeControl.value}\n            onPointerDown={(event) => {\n              event.currentTarget.setPointerCapture(event.pointerId)\n              armSettleTimer()\n            }}\n            onPointerUp={armSettleTimer}\n            onPointerCancel={armSettleTimer}\n            onKeyDown={armSettleTimer}\n            onInput={(event) => applyValue(activeControl.key, Number(event.currentTarget.value))}\n            onChange={(event) => applyValue(activeControl.key, Number(event.currentTarget.value))}\n          />\n          <strong>{activeControl.display}</strong>\n        </div>\n      )}\n"""
new_slider = """      {activeControl && !disabled && overlayTarget && createPortal(\n        <div className=\"interactive-slider-panel\" role=\"group\" aria-label={`Adjust ${activeControl.label}`}>\n          <span>{activeControl.label}</span>\n          <input\n            className=\"interactive-vent-slider\"\n            type=\"range\"\n            min={activeControl.min}\n            max={activeControl.max}\n            step={activeControl.step}\n            value={activeControl.value}\n            onPointerDown={(event) => {\n              event.currentTarget.setPointerCapture(event.pointerId)\n              armSettleTimer()\n            }}\n            onPointerUp={armSettleTimer}\n            onPointerCancel={armSettleTimer}\n            onKeyDown={armSettleTimer}\n            onInput={(event) => applyValue(activeControl.key, Number(event.currentTarget.value))}\n            onChange={(event) => applyValue(activeControl.key, Number(event.currentTarget.value))}\n          />\n          <strong>{activeControl.display}</strong>\n        </div>,\n        overlayTarget,\n      )}\n"""
if old_slider not in text:
    raise SystemExit('slider block anchor not found')
text = text.replace(old_slider, new_slider, 1)
component_path.write_text(text)

css_path = Path('src/interactive-vent-controls.css')
css = css_path.read_text()
if '.waveforms {\n  position: relative;\n}' not in css:
    css = ".waveforms {\n  position: relative;\n}\n\n" + css
css = css.replace("  bottom: calc(100% + 6px);", "  bottom: 10px;", 1)
css = css.replace("    bottom: calc(100% + 5px);", "    bottom: 8px;", 1)
css_path.write_text(css)

app_path = Path('src/App.tsx')
app = app_path.read_text().replace("appVersion: '0.76'", "appVersion: '0.77'", 1).replace('<span className=\"version\">v0.76</span>', '<span className=\"version\">v0.77</span>', 1)
app_path.write_text(app)

session_path = Path('src/components/SessionPanel.tsx')
session = session_path.read_text().replace("version.textContent = 'v0.76'", "version.textContent = 'v0.77'", 1)
session_path.write_text(session)
