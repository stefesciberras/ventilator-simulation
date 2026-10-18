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
text = text.replace("const name = kind === 'webrtc' ? 'Peer-to-peer' : kind === 'appliance' ? 'EDUVENT box' : 'LAN server'", "const name = kind === 'webrtc' ? 'P2P' : kind === 'appliance' ? 'EDUVENT box' : 'LAN server'")
text = text.replace(
    '''<button className="panel-collapse-button" type="button" onClick={toggleDashboardCollapsed} aria-expanded={!dashboardCollapsed} aria-label={dashboardCollapsed ? 'Expand instructor dashboard' : 'Collapse instructor dashboard'} title={dashboardCollapsed ? 'Expand instructor dashboard' : 'Collapse instructor dashboard'}>{dashboardCollapsed ? '▾' : '▴'}</button>''',
    '''<button className={`teaching-workspace-collapse ${dashboardCollapsed ? 'collapsed' : 'expanded'}`} type="button" onClick={toggleDashboardCollapsed} aria-expanded={!dashboardCollapsed} aria-label={dashboardCollapsed ? 'Expand instructor dashboard' : 'Collapse instructor dashboard'} title={dashboardCollapsed ? 'Expand instructor dashboard' : 'Collapse instructor dashboard'}><span className="teaching-collapse-caret" aria-hidden="true" /></button>''',
)
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
text = text.replace("<span className=\"hold-label-desktop\">Insp Hold</span><span className=\"hold-label-mobile\">Insp <PauseIcon paused={false} /></span>", "<span className=\"hold-label-two-line\"><span>Insp</span><span>Hold</span></span>")
text = text.replace("<span className=\"hold-label-desktop\">Exp Hold</span><span className=\"hold-label-mobile\">Exp <PauseIcon paused={false} /></span>", "<span className=\"hold-label-two-line\"><span>Exp</span><span>Hold</span></span>")
path.write_text(text)

# Responsive CSS: make the intermediate mode width-driven rather than orientation-dependent.
path = Path('src/styles.css')
text = path.read_text()
text = text.replace(
    '@media (orientation: landscape) and (min-width: 681px) and (max-width: 1100px) {',
    '@media (min-width: 681px) and (max-width: 1180px) {',
    1,
)
if '/* v0.82.9.0 candidate controls visibility + wake-lock settings */' not in text:
    text += '''\n\n/* v0.82.9.0 candidate controls visibility + wake-lock settings */\n.workspace.candidate-controls-hidden { grid-template-columns: minmax(0, 1fr); }\n.workspace.candidate-controls-hidden .control-panel { display: none !important; }\n.mobile-workspace-switcher.candidate-controls-hidden { grid-template-columns: 1fr; }\n.about-wake-row { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:12px; padding:12px 0; border-top:1px solid #293840; }\n.about-wake-row > span { display:grid; gap:3px; }\n.about-wake-row strong { color:#dcebf0; font-size:.9rem; }\n.about-wake-row small { color:#81959e; font-size:.75rem; line-height:1.35; }\n.about-wake-row input { width:20px; height:20px; accent-color:#53c8ed; }\n.hold-label-two-line { display:grid; justify-items:center; line-height:1.02; gap:1px; }\n'''
elif '.hold-label-two-line' not in text:
    text += '\n.hold-label-two-line { display:grid; justify-items:center; line-height:1.02; gap:1px; }\n'
path.write_text(text)

# Instructor-specific layout rules must respect the tablet paged workspace too.
path = Path('src/instructor.css')
text = path.read_text()
text = text.replace('@media (min-width: 1101px) {', '@media (min-width: 1181px) {')
text = text.replace('@media (min-width: 681px) and (max-width: 1100px) {', '@media (min-width: 681px) and (max-width: 1180px) {')
if 'v0.82.9.0 tablet paging override' not in text:
    text += '''\n\n/* v0.82.9.0 tablet paging override */\n@media (min-width: 681px) and (max-width: 1180px) {\n  body.eduvent-instructor-mode .workspace.mobile-page-ventilator > .ventilator-console { display: block !important; }\n  body.eduvent-instructor-mode .workspace.mobile-page-ventilator > .control-panel { display: none !important; }\n  body.eduvent-instructor-mode .workspace.mobile-page-settings > .ventilator-console { display: none !important; }\n  body.eduvent-instructor-mode .workspace.mobile-page-settings > .control-panel { display: block !important; grid-row: 1; }\n}\n'''
path.write_text(text)

# Laser pointer is mapped within semantic ventilator-display regions so differing layouts remain aligned.
path = Path('src/teaching/TeachingLaserPointer.tsx')
text = path.read_text()
text = text.replace("interface TeachingLaserPointerState {\n  x: number", "type TeachingLaserRegion = 'display' | 'waveforms' | 'metrics'\n\ninterface TeachingLaserPointerState {\n  x: number")
text = text.replace("  active: boolean\n  sentAt: number", "  active: boolean\n  sentAt: number\n  region?: TeachingLaserRegion")
text = text.replace("    && typeof candidate.sentAt === 'number'", "    && typeof candidate.sentAt === 'number'\n    && (candidate.region == null || candidate.region === 'display' || candidate.region === 'waveforms' || candidate.region === 'metrics')")
text = text.replace("  const channelRef = useRef<RealtimeChannel | null>(null)", "  const channelRef = useRef<RealtimeChannel | null>(null)\n  const surfaceRef = useRef<HTMLDivElement | null>(null)\n  const [, setLayoutRevision] = useState(0)")
text = text.replace("  useEffect(() => { localPointerRef.current = localPointer }, [localPointer])", "  useEffect(() => { localPointerRef.current = localPointer }, [localPointer])\n\n  useEffect(() => {\n    const onResize = () => setLayoutRevision((value) => value + 1)\n    window.addEventListener('resize', onResize)\n    window.addEventListener('orientationchange', onResize)\n    return () => {\n      window.removeEventListener('resize', onResize)\n      window.removeEventListener('orientationchange', onResize)\n    }\n  }, [])")
text = text.replace("payload: { x: 0.5, y: 0.5, active: false, sentAt: Date.now() } satisfies TeachingLaserPointerState", "payload: { x: 0.5, y: 0.5, active: false, sentAt: Date.now(), region: 'display' } satisfies TeachingLaserPointerState")
text = text.replace("sendPointer({ x: 0.5, y: 0.5, active: false, sentAt: Date.now() }, true)", "sendPointer({ x: 0.5, y: 0.5, active: false, sentAt: Date.now(), region: 'display' }, true)")
old_update = '''  const updateFromPointerEvent = (event: ReactPointerEvent<HTMLDivElement>) => {\n    if (!isController || !enabled) return\n    const rect = event.currentTarget.getBoundingClientRect()\n    if (!rect.width || !rect.height) return\n    const next: TeachingLaserPointerState = {\n      x: clamp01((event.clientX - rect.left) / rect.width),\n      y: clamp01((event.clientY - rect.top) / rect.height),\n      active: true,\n      sentAt: Date.now(),\n    }\n    setLocalPointer(next)\n    sendPointer(next)\n  }'''
new_update = '''  const regionRectFor = (surface: HTMLDivElement, region: TeachingLaserRegion) => {\n    if (region === 'display') return surface.getBoundingClientRect()\n    const selector = region === 'waveforms' ? '.waveforms' : '.metrics-panel'\n    return surface.parentElement?.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? surface.getBoundingClientRect()\n  }\n\n  const regionAtPoint = (surface: HTMLDivElement, clientX: number, clientY: number): TeachingLaserRegion => {\n    for (const region of ['waveforms', 'metrics'] as const) {\n      const rect = regionRectFor(surface, region)\n      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return region\n    }\n    return 'display'\n  }\n\n  const updateFromPointerEvent = (event: ReactPointerEvent<HTMLDivElement>) => {\n    if (!isController || !enabled) return\n    const surface = event.currentTarget\n    const region = regionAtPoint(surface, event.clientX, event.clientY)\n    const rect = regionRectFor(surface, region)\n    if (!rect.width || !rect.height) return\n    const next: TeachingLaserPointerState = {\n      x: clamp01((event.clientX - rect.left) / rect.width),\n      y: clamp01((event.clientY - rect.top) / rect.height),\n      active: true,\n      sentAt: Date.now(),\n      region,\n    }\n    setLocalPointer(next)\n    sendPointer(next)\n  }'''
text = replace_once(text, old_update, new_update, 'laser region mapping')
text = text.replace("  const displayed = isController ? localPointer : remotePointer\n  const visible", "  const displayed = isController ? localPointer : remotePointer\n  const displayedPosition = (() => {\n    const surface = surfaceRef.current\n    if (!surface || !displayed) return { left: `${(displayed?.x ?? 0.5) * 100}%`, top: `${(displayed?.y ?? 0.5) * 100}%` }\n    const surfaceRect = surface.getBoundingClientRect()\n    const rect = regionRectFor(surface, displayed.region ?? 'display')\n    return {\n      left: `${rect.left - surfaceRect.left + displayed.x * rect.width}px`,\n      top: `${rect.top - surfaceRect.top + displayed.y * rect.height}px`,\n    }\n  })()\n  const visible")
text = text.replace("    <div\n      className={`teaching-laser-layer", "    <div\n      ref={surfaceRef}\n      className={`teaching-laser-layer")
text = text.replace("style={{ left: `${displayed.x * 100}%`, top: `${displayed.y * 100}%` }}", "style={displayedPosition}")
path.write_text(text)

# Version
path = Path('src/appVersion.ts')
text = path.read_text().replace("0.82.8.5", "0.82.9.0")
path.write_text(text)
