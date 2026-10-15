from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise RuntimeError(f'pattern not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

replace_once('src/appVersion.ts', "export const APP_VERSION = '0.81.8'", "export const APP_VERSION = '0.81.9'")

# Patient profile strip above the Vent / Patient / Physio / Teaching tabs.
old = '''          <div className="control-navigation-stack">\n            <nav className="control-tabs" role="tablist" aria-label="Simulator controls">\n              {(['vent', 'patient', 'physio', 'teaching'] as const).map((tab) => (\n                <button\n                  key={tab}\n                  type="button"\n                  role="tab"\n                  aria-selected={controlTab === tab}\n                  className={controlTab === tab ? 'active' : ''}\n                  onClick={() => setControlTab(tab)}\n                >{tab === 'teaching' ? 'Teaching' : tab === 'vent' ? 'Vent' : tab === 'patient' ? 'Patient' : 'Physio'}</button>\n              ))}\n            </nav>\n            <div className="patient-profile-strip" role="group" aria-label="Patient profiles">\n              {PATIENT_PROFILE_NAMES.map((profile) => {\n                const selected = selectedPatientProfile === profile\n                const stateClass = selected ? (selectedPatientProfileModified ? 'profile-modified' : 'profile-selected') : ''\n                return (\n                  <button\n                    key={profile}\n                    type="button"\n                    className={stateClass}\n                    disabled={teachingSession.candidatePatientLocked}\n                    aria-pressed={selected}\n                    title={selected && selectedPatientProfileModified ? `${profile} selected · settings modified` : `Apply ${profile} profile`}\n                    onClick={() => applyPatientProfile(profile)}\n                  >{profile}</button>\n                )\n              })}\n            </div>\n          </div>'''
new = '''          <div className="control-navigation-stack">\n            <div className="patient-profile-strip" role="group" aria-label="Patient profiles">\n              {PATIENT_PROFILE_NAMES.map((profile) => {\n                const selected = selectedPatientProfile === profile\n                const stateClass = selected ? (selectedPatientProfileModified ? 'profile-modified' : 'profile-selected') : ''\n                return (\n                  <button\n                    key={profile}\n                    type="button"\n                    className={stateClass}\n                    disabled={teachingSession.candidatePatientLocked}\n                    aria-pressed={selected}\n                    title={selected && selectedPatientProfileModified ? `${profile} selected · settings modified` : `Apply ${profile} profile`}\n                    onClick={() => applyPatientProfile(profile)}\n                  >{profile}</button>\n                )\n              })}\n            </div>\n            <nav className="control-tabs" role="tablist" aria-label="Simulator controls">\n              {(['vent', 'patient', 'physio', 'teaching'] as const).map((tab) => (\n                <button\n                  key={tab}\n                  type="button"\n                  role="tab"\n                  aria-selected={controlTab === tab}\n                  className={controlTab === tab ? 'active' : ''}\n                  onClick={() => setControlTab(tab)}\n                >{tab === 'teaching' ? 'Teaching' : tab === 'vent' ? 'Vent' : tab === 'patient' ? 'Patient' : 'Physio'}</button>\n              ))}\n            </nav>\n          </div>'''
replace_once('src/App.tsx', old, new)

# Live AutoPEEP recovery: during passive expiration the current residual volume is
# the pressure that an end-expiratory occlusion at that instant would reveal.
old = '''  const endExpiratoryVolume = latestEndExpiratoryVolume(recent)\n  // state.volume is volume above the relaxed volume at set PEEP. Any residual\n  // volume carried into the next inspiration therefore represents dynamic\n  // hyperinflation. Converting that volume through compliance gives intrinsic\n  // PEEP continuously, without depending on a potentially stale prior hold.\n  const autoPeep = endExpiratoryVolume == null\n    ? null\n    : Math.max(0, endExpiratoryVolume / Math.max(patient.compliance, 1))'''
new = '''  const lastCompletedEndExpiratoryVolume = latestEndExpiratoryVolume(recent)\n  const latestSample = recent[recent.length - 1]\n  // During passive expiration, use the *current* residual volume above the\n  // set-PEEP relaxation volume. This is the intrinsic pressure an occlusion at\n  // that instant would reveal, and lets the displayed AutoPEEP fall immediately\n  // when RR is reduced and the longer Te permits further deflation. During\n  // inspiration retain the last completed end-expiratory value.\n  const currentPassiveExpiratoryVolume = latestSample?.phase === 'expiration' && latestSample.musclePressure < 0.5\n    ? Math.max(0, latestSample.volume)\n    : null\n  const autoPeepReferenceVolume = currentPassiveExpiratoryVolume ?? lastCompletedEndExpiratoryVolume\n  const autoPeep = autoPeepReferenceVolume == null\n    ? null\n    : Math.max(0, autoPeepReferenceVolume / Math.max(patient.compliance, 1))'''
replace_once('src/physiologyMeasurements.ts', old, new)

# Rectangular patient profile buttons.
p = Path('src/styles.css')
text = p.read_text()
text += '''\n\n/* v0.81.9 profile strip geometry */\n.patient-profile-strip button {\n  border-radius: 0 !important;\n}\n'''
p.write_text(text)

# Compact rectangular static scenario cards/actions. Make the action column span
# the heading + details rows so card height is driven mainly by the five actions.
p = Path('src/account.css')
text = p.read_text()
text += '''\n\n/* v0.81.9 compact static scenario cards */\n.scenario-card {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto;\n  grid-template-rows: auto auto;\n  column-gap: 16px;\n  row-gap: 0;\n  padding: 10px 12px;\n  border-radius: 0;\n}\n.scenario-card-heading { grid-column: 1; grid-row: 1; }\n.scenario-card-view { display: contents; }\n.scenario-card-main { grid-column: 1; grid-row: 2; min-width: 0; }\n.scenario-card-actions {\n  grid-column: 2;\n  grid-row: 1 / 3;\n  align-self: stretch;\n  display: grid;\n  grid-template-rows: repeat(5, minmax(32px, 1fr));\n  gap: 5px;\n  min-width: 138px;\n}\n.scenario-card-actions button {\n  border-radius: 0;\n  min-height: 32px;\n}\n.scenario-description { margin: 7px 0 7px; }\n.scenario-summary-chips { margin-bottom: 0; }\n.scenario-edit-fields { grid-column: 1 / -1; }\n@media (max-width: 760px) {\n  .scenario-card { grid-template-columns: minmax(0,1fr) 122px; column-gap: 10px; }\n  .scenario-card-actions { min-width: 122px; width: 122px; }\n}\n@media (max-width: 460px) {\n  .scenario-card { grid-template-columns: minmax(0,1fr) 108px; column-gap: 8px; }\n  .scenario-card-actions { min-width: 108px; width: 108px; }\n}\n'''
p.write_text(text)

print('v0.81.9 patch applied')
