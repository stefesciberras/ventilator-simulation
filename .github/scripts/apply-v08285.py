from pathlib import Path

app = Path('src/App.tsx')
text = app.read_text()

old = "if (!window.matchMedia('(max-width: 680px)').matches || event.touches.length !== 1) {"
new = "if (!window.matchMedia('(max-width: 680px), (orientation: landscape) and (max-width: 1100px)').matches || event.touches.length !== 1) {"
if old not in text:
    raise SystemExit('mobile swipe breakpoint not found')
text = text.replace(old, new, 1)

needle = "<div className=\"about-version-row\"><span>Version</span><strong>v{APP_VERSION}</strong></div>"
replacement = """<div className=\"about-version-row\"><span>Version</span><strong>v{APP_VERSION}</strong></div>
            <div className=\"about-diagnostics\">
              <span className=\"about-section-label\">Diagnostics</span>
              <div className=\"about-diagnostic-actions\">
                <button type=\"button\" onClick={() => void copyDiagnostics()}>Simulation Logs</button>
                <button type=\"button\" onClick={() => void copyScenarioSnapshotDiagnostics()}>Scenario Debug Snapshot</button>
              </div>
            </div>"""
if needle not in text:
    raise SystemExit('about version row not found')
text = text.replace(needle, replacement, 1)
app.write_text(text)

styles = Path('src/styles.css')
css = styles.read_text()
css += '''

/* v0.82.8.5 tablet-landscape compact workspace */
@media (orientation: landscape) and (min-width: 681px) and (max-width: 1100px) {
  .version,
  .top-diagnostic-menu { display: none !important; }

  .topbar {
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 10px;
  }
  .brand-block h1 { font-size: clamp(18px, 2.25vw, 24px); }
  .top-simulation-controls { gap: 6px; }
  .top-simulation-pause { min-width: 150px; padding-inline: 12px; }

  .mobile-workspace-switcher {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
    margin: 0 0 8px;
    padding: 4px;
    border: 1px solid #293b45;
    border-radius: 10px;
    background: rgba(10, 16, 20, .96);
  }
  .mobile-workspace-switcher button {
    min-width: 0;
    min-height: 36px;
    padding: 7px 8px;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    color: #8da4ae;
    background: #111a20;
    border-color: transparent;
  }
  .mobile-workspace-switcher button.active {
    color: #e2f8ff;
    border-color: #5bbbdc;
    background: #17313d;
  }

  .workspace { display: block; touch-action: pan-y; }
  .workspace.mobile-page-ventilator .control-panel { display: none; }
  .workspace.mobile-page-settings .ventilator-console { display: none; }
  .workspace.mobile-page-settings .control-panel { display: block; }
  .control-panel { max-height: none; }
}

.about-diagnostics { display: grid; gap: 8px; margin-top: 12px; }
.about-section-label { color: #8fa2ab; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.about-diagnostic-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.about-diagnostic-actions button { flex: 1 1 180px; }
'''
styles.write_text(css)

version = Path('src/appVersion.ts')
v = version.read_text().replace("0.82.8.4", "0.82.8.5")
version.write_text(v)
