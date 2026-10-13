from pathlib import Path

replacements = {
    Path('src/App.tsx'): [
        ("appVersion: '0.61'", "appVersion: '0.62'"),
        ('>v0.61</span>', '>v0.62</span>'),
    ],
    Path('src/diagnostics.ts'): [
        ("APP_VERSION = '0.61'", "APP_VERSION = '0.62'"),
    ],
    Path('src/components/SessionPanel.tsx'): [
        ("version.textContent = 'v0.61'", "version.textContent = 'v0.62'"),
    ],
}

for path, pairs in replacements.items():
    text = path.read_text()
    for old, new in pairs:
        if old in text:
            text = text.replace(old, new)
    path.write_text(text)

print('v0.62 version patch applied')
