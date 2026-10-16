from pathlib import Path
p = Path('src/App.tsx')
s = p.read_text()
old = '''      <TeachingLaserControl
        role={teachingSession.role}
        enabled={teachingLaserEnabled}
        sessionActive={teachingSession.role === 'instructor' && Boolean(teachingSession.session)}
        onEnabledChange={(enabled) => {
          setTeachingLaserEnabled(enabled)
          if (enabled) setMobileWorkspacePage('ventilator')
        }}
      />
'''
assert old in s
s = s.replace(old, '', 1)
p.write_text(s)
