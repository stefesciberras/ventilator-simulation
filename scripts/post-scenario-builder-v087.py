from pathlib import Path
p = Path('src/scenario-builder/version.ts')
t = p.read_text()
if "'0.8.6'" not in t:
    raise SystemExit('Expected Scenario Builder v0.8.6 after implementation')
p.write_text(t.replace("'0.8.6'", "'0.8.7'"))
