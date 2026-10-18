from pathlib import Path

path = Path('src/teaching/TeachingWorkspace.tsx')
text = path.read_text()
old = "const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false)"
new = "const [workspaceCollapsed, setWorkspaceCollapsed] = useState(true)"
if old not in text:
    if new in text:
        raise SystemExit(0)
    raise SystemExit('workspace collapse state not found')
path.write_text(text.replace(old, new, 1))
