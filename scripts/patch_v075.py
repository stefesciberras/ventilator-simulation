from pathlib import Path

app_path = Path('src/App.tsx')
text = app_path.read_text()
text = text.replace("import { InteractiveVentilatorStrip } from './components/InteractiveVentilatorStrip'", "import { InteractiveVentilatorStrip, VentilatorModeControl } from './components/InteractiveVentilatorStrip'", 1)
text = text.replace("appVersion: '0.74'", "appVersion: '0.75'", 1)
text = text.replace('<span className="version">v0.74</span>', '<span className="version">v0.75</span>', 1)
old = '''          <div className="console-mode-bar">\n            <div className="mode-title"><span>Mode</span><strong>{activeMode}</strong></div>\n            <span className="console-control-hint">Ventilator settings are adjusted from the lower control strip</span>\n          </div>\n\n          <div className="action-bar console-top-actions">'''
new = '''          <div className="console-mode-bar">\n            <VentilatorModeControl\n              settings={ventilator}\n              onChange={setVentilator}\n              disabled={teachingSession.candidateVentilatorLocked}\n            />\n            <div className="action-bar console-top-actions">'''
if old not in text:
    raise SystemExit('console mode/action anchor not found')
text = text.replace(old, new, 1)
old_close = '''            <button className={`hardware-button icon-button alarm-button alarm-silence-bottom ${alarmSilenced ? 'active' : ''}`} onClick={silenceAlarm} title="Silence alarm sound for 2 minutes" aria-label="Silence alarm sound for 2 minutes"><AlarmSilenceIcon /></button>\n          </div>\n\n          <div className="alarm-slot"'''
new_close = '''            <button className={`hardware-button icon-button alarm-button alarm-silence-bottom ${alarmSilenced ? 'active' : ''}`} onClick={silenceAlarm} title="Silence alarm sound for 2 minutes" aria-label="Silence alarm sound for 2 minutes"><AlarmSilenceIcon /></button>\n            </div>\n          </div>\n\n          <div className="alarm-slot"'''
if old_close not in text:
    raise SystemExit('action close anchor not found')
text = text.replace(old_close, new_close, 1)
app_path.write_text(text)

session_path = Path('src/components/SessionPanel.tsx')
session_text = session_path.read_text().replace("version.textContent = 'v0.74'", "version.textContent = 'v0.75'", 1)
session_path.write_text(session_text)
