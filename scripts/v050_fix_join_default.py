from pathlib import Path

p = Path('src/session/useTeachingSession.ts')
s = p.read_text()
old = "  const candidateOesophagealPressureAllowed = role !== 'candidate' || Boolean(session?.allow_oesophageal_pressure)\n"
new = "  const candidateOesophagealPressureAllowed = role !== 'candidate' || session == null || Boolean(session.allow_oesophageal_pressure)\n"
if old not in s:
    raise SystemExit('Missing candidateOesophagealPressureAllowed anchor')
p.write_text(s.replace(old, new, 1))
