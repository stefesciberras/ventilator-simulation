from pathlib import Path


def replace(path: str, old: str, new: str, expected: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual != expected:
        raise SystemExit(f"{path}: expected {expected} occurrence(s), found {actual}: {old[:180]!r}")
    p.write_text(text.replace(old, new))

controls = 'src/components/InstructorAccountControls.tsx'
replace(controls, "import '../account.css'\n", "import { APP_VERSION } from '../appVersion'\nimport '../account.css'\n")
anchor = "function accountLabel(user: User | null) {\n  return user?.email ?? 'Instructor cloud account'\n}\n\n"
helpers = '''const INSTRUCTOR_DETAILS_STORAGE_KEY = 'eduvent.instructor-details'\n\ninterface InstructorDetails { name: string; email: string; centre: string }\n\nfunction loadInstructorDetails(): InstructorDetails {\n  if (typeof window === 'undefined') return { name: '', email: '', centre: '' }\n  try {\n    const parsed = JSON.parse(window.localStorage.getItem(INSTRUCTOR_DETAILS_STORAGE_KEY) ?? '{}') as Partial<InstructorDetails>\n    return {\n      name: typeof parsed.name === 'string' ? parsed.name : '',\n      email: typeof parsed.email === 'string' ? parsed.email : '',\n      centre: typeof parsed.centre === 'string' ? parsed.centre : '',\n    }\n  } catch {\n    return { name: '', email: '', centre: '' }\n  }\n}\n\n'''
replace(controls, anchor, anchor + helpers)
replace(controls,
    "  const [supabaseConfigError, setSupabaseConfigError] = useState<string | null>(null)\n",
    "  const [supabaseConfigError, setSupabaseConfigError] = useState<string | null>(null)\n  const initialInstructorDetails = loadInstructorDetails()\n  const [instructorName, setInstructorName] = useState(initialInstructorDetails.name)\n  const [instructorEmail, setInstructorEmail] = useState(initialInstructorDetails.email)\n  const [instructorCentre, setInstructorCentre] = useState(initialInstructorDetails.centre)\n  const [instructorDetailsMessage, setInstructorDetailsMessage] = useState<string | null>(null)\n")
replace(controls,
    "    setSupabaseConfigMessage(null)\n    setSupabaseConfigError(null)\n  }, [settingsOpen])\n\n  const saveCentreSupabase = () => {\n",
    "    setSupabaseConfigMessage(null)\n    setSupabaseConfigError(null)\n    const details = loadInstructorDetails()\n    setInstructorName(details.name)\n    setInstructorEmail(details.email || account?.email || '')\n    setInstructorCentre(details.centre)\n    setInstructorDetailsMessage(null)\n  }, [settingsOpen, account?.email])\n\n  const saveInstructorDetails = () => {\n    const details = { name: instructorName.trim(), email: instructorEmail.trim(), centre: instructorCentre.trim() }\n    try {\n      window.localStorage.setItem(INSTRUCTOR_DETAILS_STORAGE_KEY, JSON.stringify(details))\n      setInstructorName(details.name)\n      setInstructorEmail(details.email)\n      setInstructorCentre(details.centre)\n      setInstructorDetailsMessage('Instructor details saved.')\n    } catch {\n      setInstructorDetailsMessage('Unable to save instructor details in this browser.')\n    }\n  }\n\n  const saveCentreSupabase = () => {\n")
replace(controls,
    "            <p className=\"scenario-intro\">A static preset captures the complete patient, ventilator, alarm, transition and waveform setup at one point in time. Load it before or during an instructor session. Dynamic timelines will build on the same base state later.</p>\n\n",
    "")
old_view = '''                          <>
                            {preset.scenario.description ? <p className="scenario-description">{preset.scenario.description}</p> : <p className="scenario-description empty">No instructor notes.</p>}
                            <div className="scenario-summary-chips">
                              {summaryItems(preset.scenario).map((item) => <span key={item}>{item}</span>)}
                            </div>
                            <div className="scenario-card-actions">
                              <button type="button" className="scenario-load-button" disabled={presetBusy} onClick={() => loadScenario(preset)}>Load</button>
                              <button type="button" disabled={presetBusy} onClick={() => void updateFromCurrent(preset)}>Update from current</button>
                              <button type="button" disabled={presetBusy} onClick={() => beginEdit(preset)}>Edit details</button>
                              <button type="button" disabled={presetBusy} onClick={() => void duplicateScenario(preset)}>Duplicate</button>
                              <button type="button" className="scenario-delete-button" disabled={presetBusy} onClick={() => void removeScenario(preset)}>Delete</button>
                            </div>
                          </>
'''
new_view = '''                          <div className="scenario-card-view">
                            <div className="scenario-card-main">
                              {preset.scenario.description ? <p className="scenario-description">{preset.scenario.description}</p> : <p className="scenario-description empty">No instructor notes.</p>}
                              <div className="scenario-summary-chips">
                                {summaryItems(preset.scenario).map((item) => <span key={item}>{item}</span>)}
                              </div>
                            </div>
                            <div className="scenario-card-actions">
                              <button type="button" className="scenario-load-button" disabled={presetBusy} onClick={() => loadScenario(preset)}>Load</button>
                              <button type="button" disabled={presetBusy} onClick={() => void updateFromCurrent(preset)}>Update from current</button>
                              <button type="button" disabled={presetBusy} onClick={() => beginEdit(preset)}>Edit details</button>
                              <button type="button" disabled={presetBusy} onClick={() => void duplicateScenario(preset)}>Duplicate</button>
                              <button type="button" className="scenario-delete-button" disabled={presetBusy} onClick={() => void removeScenario(preset)}>Delete</button>
                            </div>
                          </div>
'''
replace(controls, old_view, new_view)
replace(controls, "              <div><span>Version</span><strong>v0.72</strong></div>\n", "              <div><span>Version</span><strong>v{APP_VERSION}</strong></div>\n")
settings_anchor = '''            </div>

            <section className="supabase-settings-section">
'''
instructor_section = '''            </div>

            <section className="instructor-details-section">
              <div className="scenario-settings-heading">
                <div><span>Instructor</span><h3>Instructor details</h3></div>
              </div>
              <div className="instructor-details-fields">
                <label><span>Name</span><input value={instructorName} onChange={(event) => setInstructorName(event.target.value)} placeholder="Instructor name" /></label>
                <label><span>Email</span><input type="email" value={instructorEmail} onChange={(event) => setInstructorEmail(event.target.value)} placeholder="name@example.com" /></label>
                <label><span>Centre</span><input value={instructorCentre} onChange={(event) => setInstructorCentre(event.target.value)} placeholder="Hospital / simulation centre" /></label>
              </div>
              <button type="button" className="account-primary-button instructor-details-save" onClick={saveInstructorDetails}>Save instructor details</button>
              {instructorDetailsMessage && <div className="account-message">{instructorDetailsMessage}</div>}
            </section>

            <section className="supabase-settings-section">
'''
replace(controls, settings_anchor, instructor_section)
replace(controls,
    "              <p>Each centre can connect this EDUVENT installation to its own Supabase project. The configuration is stored only in this browser and overrides deployment environment variables.</p>\n",
    "")
old_scenario_settings = '''
            {role !== 'candidate' && (
              <section className="scenario-settings-section">
                <div className="scenario-settings-heading">
                  <div><span>Instructor tools</span><h3>Scenarios</h3></div>
                  {account && <small>{staticPresets.length} saved</small>}
                </div>
                <p>Prepare and manage reusable static teaching states. Dynamic scenario timelines will be added later.</p>
                <button type="button" className="account-secondary-button" onClick={() => { setSettingsOpen(false); openScenarios() }}>Manage scenarios</button>
              </section>
            )}
'''
replace(controls, old_scenario_settings, "")
