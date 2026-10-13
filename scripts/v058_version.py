from pathlib import Path

p = Path('src/components/SessionPanel.tsx')
s = p.read_text().replace("version.textContent = 'v0.55'", "version.textContent = 'v0.58'")
p.write_text(s)

p = Path('src/App.tsx')
s = p.read_text().replace("v0.57", "v0.58").replace("'0.57'", "'0.58'")
p.write_text(s)
