from pathlib import Path

app = Path('src/App.tsx')
text = app.read_text()

old = "if (!window.matchMedia('(max-width: 680px)').matches || event.touches.length !== 1) {"
new = "if (!window.matchMedia('(max-width: 680px), (orientation: landscape) and (max-width: 1100px)').matches || event.touches.length !== 1) {"
if old not in text:
    raise SystemExit('mobile swipe breakpoint not found')
text = text.replace(old, new, 1)

needle = "<div className=\"about-version-row\"><span>Version</span><strong>v{APP_VERSION}</strong></div>"
replacement = """<div className=\"about-version-row\"><span>Version</span><strong>v{APP_VERSION}</strong></div>\n            <div className=\"about-diagnostics\">\n              <span className=\"about-section-label\">Diagnostics</span>\n              <div className=\"about-diagnostic-actions\">\n                <button type=\"button\" onClick={() => void copyDiagnostics()}>Simulation Logs</button>\n                <button type=\"button\" onClick={() => void copyScenarioSnapshotDiagnostics()}>Scenario Debug Snapshot</button>\n              </div>\n            </div>"""
if needle not in text:
    raise SystemExit('about version row not found')
text = text.replace(needle, replacement, 1)
app.write_text(text)

styles = Path('src/styles.css')
css = styles.read_text()
css += r'''\n\n/* v0.82.8.5 tablet-landscape compact workspace */\n@media (orientation: landscape) and (min-width: 681px) and (max-width: 1100px) {\n  .version,\n  .top-diagnostic-menu { display: none !important; }\n\n  .topbar {\n    grid-template-columns: minmax(0, 1fr) auto auto;\n    gap: 10px;\n  }\n  .brand-block h1 { font-size: clamp(18px, 2.25vw, 24px); }\n  .top-simulation-controls { gap: 6px; }\n  .top-simulation-pause { min-width: 150px; padding-inline: 12px; }\n\n  .mobile-workspace-switcher {\n    display: grid;\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n    gap: 5px;\n    margin: 0 0 8px;\n    padding: 4px;\n    border: 1px solid #293b45;\n    border-radius: 10px;\n    background: rgba(10, 16, 20, .96);\n  }\n  .mobile-workspace-switcher button {\n    min-width: 0;\n    min-height: 36px;\n    padding: 7px 8px;\n    font-size: 10px;\n    font-weight: 800;\n    text-transform: uppercase;\n    color: #8da4ae;\n    background: #111a20;\n    border-color: transparent;\n  }\n  .mobile-workspace-switcher button.active {\n    color: #e2f8ff;\n    border-color: #5bbbdc;\n    background: #17313d;\n  }\n\n  .workspace { display: block; touch-action: pan-y; }\n  .workspace.mobile-page-ventilator .control-panel { display: none; }\n  .workspace.mobile-page-settings .ventilator-console { display: none; }\n  .workspace.mobile-page-settings .control-panel { display: block; }\n  .control-panel { max-height: none; }\n}\n\n.about-diagnostics { display: grid; gap: 8px; margin-top: 12px; }\n.about-section-label { color: #8fa2ab; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }\n.about-diagnostic-actions { display: flex; flex-wrap: wrap; gap: 8px; }\n.about-diagnostic-actions button { flex: 1 1 180px; }\n'''
styles.write_text(css)

version = Path('src/appVersion.ts')
v = version.read_text().replace("0.82.8.4", "0.82.8.5")
version.write_text(v)
