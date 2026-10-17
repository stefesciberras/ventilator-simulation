from pathlib import Path
p = Path('src/teaching/TeachingWorkspace.tsx')
s = p.read_text()
s = s.replace('Tags <span>(comma separated)</span>', 'Tags <span>(optional)</span>', 1)
s = s.replace("{editingLibraryId ? 'Update library question' : 'Save to library'}", "{editingLibraryId ? 'Update saved question' : 'Save to library'}", 1)
p.write_text(s)
