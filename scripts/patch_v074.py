from pathlib import Path
import re

app_path = Path('src/App.tsx')
text = app_path.read_text()

import_anchor = "import { PhysiologyMeasurementsDialog } from './components/PhysiologyMeasurementsDialog'\n"
new_import = "import { InteractiveVentilatorStrip } from './components/InteractiveVentilatorStrip'\n"
if new_import not in text:
    if import_anchor not in text:
        raise SystemExit('Interactive strip import anchor not found')
    text = text.replace(import_anchor, import_anchor + new_import, 1)

# Extract the existing hardware action bar, then remove it from the bottom.
action_match = re.search(r'\n          <div className="action-bar">.*?\n          </div>\n        </section>', text, re.S)
if not action_match:
    raise SystemExit('Action bar not found')
action_block = action_match.group(0)
action_inner = action_block.split('\n        </section>', 1)[0]
top_action = action_inner.replace('className="action-bar"', 'className="action-bar console-top-actions"', 1)

replacement_bottom = '''\n          <InteractiveVentilatorStrip\n            settings={ventilator}\n            onChange={setVentilator}\n            disabled={teachingSession.candidateVentilatorLocked}\n          />\n        </section>'''
text = text[:action_match.start()] + replacement_bottom + text[action_match.end():]

# Replace the old static settings header with a compact mode bar followed by the moved hardware actions.
header_pattern = re.compile(r'          <div className="screen-header">.*?          </div>\n\n          <div className="alarm-slot"', re.S)
header_replacement = '''          <div className="console-mode-bar">\n            <div className="mode-title"><span>Mode</span><strong>{activeMode}</strong></div>\n            <span className="console-control-hint">Ventilator settings are adjusted from the lower control strip</span>\n          </div>\n''' + top_action + '''\n\n          <div className="alarm-slot"'''
text, count = header_pattern.subn(header_replacement, text, count=1)
if count != 1:
    raise SystemExit(f'Expected one screen header replacement, got {count}')

text = text.replace("<span className=\"version\">v0.72</span>", "<span className=\"version\">v0.74</span>", 1)
text = text.replace("appVersion: '0.72'", "appVersion: '0.74'", 1)
app_path.write_text(text)

session_path = Path('src/components/SessionPanel.tsx')
session_text = session_path.read_text()
session_text = session_text.replace("version.textContent = 'v0.73'", "version.textContent = 'v0.74'", 1)
session_path.write_text(session_text)
