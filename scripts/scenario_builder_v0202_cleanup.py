from pathlib import Path

path = Path('src/components/InstructorAccountControls.tsx')
text = path.read_text()
old = """  useEffect(() => {
    if (role === 'instructor' || !activeDynamicId) return
    setActiveDynamicId(null)
    setActiveDynamicStage(0)
  }, [role, activeDynamicId])
"""
new = """  useEffect(() => {
    if (role !== 'candidate' || !activeDynamicId) return
    setActiveDynamicId(null)
    setActiveDynamicStage(0)
  }, [role, activeDynamicId])
"""
if old not in text:
    raise SystemExit('Expected runtime cleanup block not found')
path.write_text(text.replace(old, new, 1))
