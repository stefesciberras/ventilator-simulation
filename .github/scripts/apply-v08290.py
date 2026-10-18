from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise SystemExit(f'{label} not found')
    return text.replace(old, new, 1)

# Session row schema
path = Path('src/session/supabase.ts')
text = path.read_text()
text = replace_once(text,
    "  candidate_can_edit_ventilator: boolean\n  patient_settings: PatientSettings",
    "  candidate_can_edit_ventilator: boolean\n  candidate_controls_visible: boolean\n  patient_settings: PatientSettings",
    'session row candidate controls')
path.write_text(text)

# Fast-path runtime policy
path = Path('src/session/localRuntimeTransport.ts')
text = path.read_text()
text = replace_once(text,
    "  candidateCanEditVentilator: boolean\n  syncAlarms: boolean",
    "  candidateCanEditVentilator: boolean\n  candidateControlsVisible: boolean\n  syncAlarms: boolean",
    'runtime candidate controls')
path.write_text(text)

# Teaching session host policy propagation
path = Path('src/session/useTeachingSession.ts')
text = path.read_text()
text = replace_once(text,
    "  candidateCanEditVentilator?: boolean\n  syncAlarms?: boolean",
    "  candidateCanEditVentilator?: boolean\n  candidateControlsVisible?: boolean\n  syncAlarms?: boolean",
    'policy patch type')
text = replace_once(text,
    "        candidateCanEditVentilator: Boolean(row.candidate_can_edit_ventilator),\n        syncAlarms: Boolean(row.sync_alarms),",
    "        candidateCanEditVentilator: Boolean(row.candidate_can_edit_ventilator),\n        candidateControlsVisible: row.candidate_controls_visible !== false,\n        syncAlarms: Boolean(row.sync_alarms),",
    'snapshot policy build')
text = replace_once(text,
    "      candidate_can_edit_ventilator: snapshot.policy.candidateCanEditVentilator,\n      sync_alarms: snapshot.policy.syncAlarms,",
    "      candidate_can_edit_ventilator: snapshot.policy.candidateCanEditVentilator,\n      candidate_controls_visible: snapshot.policy.candidateControlsVisible !== false,\n      sync_alarms: snapshot.policy.syncAlarms,",
    'snapshot apply')
text = replace_once(text,
    "    if (patch.candidateCanEditVentilator != null) databasePatch.candidate_can_edit_ventilator = patch.candidateCanEditVentilator\n    if (patch.syncAlarms != null) databasePatch.sync_alarms = patch.syncAlarms",
    "    if (patch.candidateCanEditVentilator != null) databasePatch.candidate_can_edit_ventilator = patch.candidateCanEditVentilator\n    if (patch.candidateControlsVisible != null) databasePatch.candidate_controls_visible = patch.candidateControlsVisible\n    if (patch.syncAlarms != null) databasePatch.sync_alarms = patch.syncAlarms",
    'database policy patch')
path.write_text(text)

# Instructor session controls UI
path = Path('src/components/SessionPanel.tsx')
text = path.read_text()
text = replace_once(text,
    "    candidateCanEditVentilator?: boolean\n    syncAlarms?: boolean",
    "    candidateCanEditVentilator?: boolean\n    candidateControlsVisible?: boolean\n    syncAlarms?: boolean",
    'session panel policy type')
needle = '''                <label className="session-switch-row">\n                  <span>Share patient settings</span>\n                  <input type="checkbox" checked={Boolean(session?.sync_patient)} onChange={(event) => void onUpdatePolicy({ syncPatient: event.target.checked })} />\n                </label>'''
replacement = '''                <label className="session-switch-row session-switch-row-emphasis">\n                  <span>Show Controls view to candidate</span>\n                  <input type="checkbox" checked={session?.candidate_controls_visible !== false} onChange={(event) => void onUpdatePolicy({ candidateControlsVisible: event.target.checked })} />\n                </label>\n                <label className="session-switch-row">\n                  <span>Share patient settings</span>\n                  <input type="checkbox" checked={Boolean(session?.sync_patient)} onChange={(event) => void onUpdatePolicy({ syncPatient: event.target.checked })} />\n                </label>'''
text = replace_once(text, needle, replacement, 'candidate controls toggle')
path.write_text(text)

# App responsive behavior + wake lock
path = Path('src/App.tsx')
text = path.read_text()
text = replace_once(text,
    "import { APP_VERSION } from './appVersion'",
    "import { APP_VERSION } from './appVersion'\nimport { useScreenWakeLock } from './useScreenWakeLock'",
    'wake lock import')
text = replace_once(text,
    "export default function App() {\n  const [aboutOpen, setAboutOpen] = useState(false)",
    "export default function App() {\n  const [aboutOpen, setAboutOpen] = useState(false)\n  const screenWakeLock = useScreenWakeLock()",
    'wake lock hook')
text = replace_once(text,
    "if (!window.matchMedia('(max-width: 680px), (orientation: landscape) and (max-width: 1100px)').matches || event.touches.length !== 1) {",
    "if (!window.matchMedia('(max-width: 1180px)').matches || event.touches.length !== 1) {",
    'tablet swipe breakpoint')
text = replace_once(text,
    "  const teachingPrompts = useTeachingPrompts(teachingSession.role, teachingSession.session?.id ?? null, eduventTeachingHost)",
    "  const candidateControlsVisible = teachingSession.role !== 'candidate' || teachingSession.session?.candidate_controls_visible !== false\n\n  useEffect(() => {\n    if (!candidateControlsVisible && mobileWorkspacePage === 'settings') setMobileWorkspacePage('ventilator')\n  }, [candidateControlsVisible, mobileWorkspacePage])\n\n  const teachingPrompts = useTeachingPrompts(teachingSession.role, teachingSession.session?.id ?? null, eduventTeachingHost)",
    'candidate controls app state')
text = replace_once(text,
    "            <div className=\"about-version-row\"><span>Version</span><strong>v{APP_VERSION}</strong></div>",
    "            <div className=\"about-version-row\"><span>Version</span><strong>v{APP_VERSION}</strong></div>\n            <label className=\"about-wake-row\">\n              <span><strong>Keep screen awake</strong><small>{screenWakeLock.supported ? (screenWakeLock.active ? 'Active' : 'Enabled when the browser permits it') : 'Not supported by this browser'}</small></span>\n              <input type=\"checkbox\" checked={screenWakeLock.enabled} disabled={!screenWakeLock.supported} onChange={(event) => screenWakeLock.setEnabled(event.target.checked)} />\n            </label>",
    'about wake lock row')
text = replace_once(text,
    "      <nav className=\"mobile-workspace-switcher\" aria-label=\"Mobile workspace pages\">\n        <button type=\"button\" className={mobileWorkspacePage === 'ventilator' ? 'active' : ''} aria-current={mobileWorkspacePage === 'ventilator' ? 'page' : undefined} onClick={() => setMobileWorkspacePage('ventilator')}>Ventilator</button>\n        <button type=\"button\" className={mobileWorkspacePage === 'settings' ? 'active' : ''} aria-current={mobileWorkspacePage === 'settings' ? 'page' : undefined} onClick={() => setMobileWorkspacePage('settings')}>Controls</button>\n      </nav>",
    "      <nav className={`mobile-workspace-switcher ${candidateControlsVisible ? '' : 'candidate-controls-hidden'}`} aria-label=\"Mobile workspace pages\">\n        <button type=\"button\" className={mobileWorkspacePage === 'ventilator' ? 'active' : ''} aria-current={mobileWorkspacePage === 'ventilator' ? 'page' : undefined} onClick={() => setMobileWorkspacePage('ventilator')}>Ventilator</button>\n        {candidateControlsVisible && <button type=\"button\" className={mobileWorkspacePage === 'settings' ? 'active' : ''} aria-current={mobileWorkspacePage === 'settings' ? 'page' : undefined} onClick={() => setMobileWorkspacePage('settings')}>Controls</button>}\n      </nav>",
    'workspace nav visibility')
text = replace_once(text,
    "        className={`workspace mobile-page-${mobileWorkspacePage}`}",
    "        className={`workspace mobile-page-${mobileWorkspacePage} ${candidateControlsVisible ? '' : 'candidate-controls-hidden'}`}",
    'workspace candidate controls class')
path.write_text(text)

# Responsive CSS: make the intermediate mode width-driven rather than orientation-dependent.
path = Path('src/styles.css')
text = path.read_text()
text = text.replace(
    '@media (orientation: landscape) and (min-width: 681px) and (max-width: 1100px) {',
    '@media (min-width: 681px) and (max-width: 1180px) {',
    1,
)
text += '''\n\n/* v0.82.9.0 candidate controls visibility + wake-lock settings */\n.workspace.candidate-controls-hidden { grid-template-columns: minmax(0, 1fr); }\n.workspace.candidate-controls-hidden .control-panel { display: none !important; }\n.mobile-workspace-switcher.candidate-controls-hidden { grid-template-columns: 1fr; }\n.about-wake-row { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:12px; padding:12px 0; border-top:1px solid #293840; }\n.about-wake-row > span { display:grid; gap:3px; }\n.about-wake-row strong { color:#dcebf0; font-size:.9rem; }\n.about-wake-row small { color:#81959e; font-size:.75rem; line-height:1.35; }\n.about-wake-row input { width:20px; height:20px; accent-color:#53c8ed; }\n'''
path.write_text(text)

# Version
path = Path('src/appVersion.ts')
text = path.read_text().replace("0.82.8.5", "0.82.9.0")
path.write_text(text)
