from pathlib import Path

app_path = Path('src/App.tsx')
text = app_path.read_text()
text = text.replace("appVersion: '0.75'", "appVersion: '0.76'", 1)
text = text.replace('<span className="version">v0.75</span>', '<span className="version">v0.76</span>', 1)
app_path.write_text(text)

session_path = Path('src/components/SessionPanel.tsx')
session_text = session_path.read_text().replace("version.textContent = 'v0.75'", "version.textContent = 'v0.76'", 1)
session_path.write_text(session_text)
