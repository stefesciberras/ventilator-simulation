from pathlib import Path
p = Path('src/scenario-builder/ProfileEditor.tsx')
s = p.read_text()
s = s.replace('Profile duplicated into My patients.', 'Patient duplicated into My patients.')
s = s.replace('aria-label="Delete profile" title="Delete profile"', 'aria-label="Delete patient" title="Delete patient"')
s = s.replace('Instructor role: organisation profiles are read-only. You can copy a profile into My patients and edit your personal copy.', 'Instructor role: organisation patients are read-only. You can copy a patient into My patients and edit your personal copy.')
p.write_text(s)
