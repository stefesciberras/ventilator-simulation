from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:120]!r}')
    if text.count(old) != 1:
        raise SystemExit(f'Pattern not unique in {path}: {text.count(old)}')
    p.write_text(text.replace(old, new, 1))

replace_once(
    'src/components/Controls.tsx',
    "export function VentilatorControls({ settings, onChange, onReset, fio2Override, fio2BoostActive = false }: { settings: VentilatorSettings; onChange: (next: VentilatorSettings) => void; onReset: () => void; fio2Override?: number; fio2BoostActive?: boolean }) {",
    "export function VentilatorControls({ settings, onChange, onReset, fio2Override, fio2BoostActive = false, collapsible = true }: { settings: VentilatorSettings; onChange: (next: VentilatorSettings) => void; onReset: () => void; fio2Override?: number; fio2BoostActive?: boolean; collapsible?: boolean }) {",
)
replace_once('src/components/Controls.tsx', "    <section className={`control-section ventilator-settings-section ${collapsed ? 'panel-collapsed' : ''}`}>", "    <section className={`control-section ventilator-settings-section ${collapsible && collapsed ? 'panel-collapsed' : ''}`}>")
replace_once(
    'src/components/Controls.tsx',
    '''          <button className="panel-collapse-button" type="button" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand ventilator settings' : 'Collapse ventilator settings'} title={collapsed ? 'Expand ventilator settings' : 'Collapse ventilator settings'}>{collapsed ? '▾' : '▴'}</button>''',
    '''          {collapsible && <button className="panel-collapse-button" type="button" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand ventilator settings' : 'Collapse ventilator settings'} title={collapsed ? 'Expand ventilator settings' : 'Collapse ventilator settings'}>{collapsed ? '▾' : '▴'}</button>}''',
)
replace_once(
    'src/components/Controls.tsx',
    "export function PatientControls({ settings, onChange, onReset, onResetPhysiology, transitionSeconds, onTransitionSecondsChange, showPatientEffort, onShowPatientEffortChange, patientEffortLocked = false, showSpO2Ceiling = true }: { settings: PatientSettings; onChange: (next: PatientSettings) => void; onReset: () => void; onResetPhysiology: () => void; transitionSeconds: number; onTransitionSecondsChange: (seconds: number) => void; showPatientEffort: boolean; onShowPatientEffortChange: (value: boolean) => void; patientEffortLocked?: boolean; showSpO2Ceiling?: boolean }) {",
    "export function PatientControls({ settings, onChange, onReset, onResetPhysiology, transitionSeconds, onTransitionSecondsChange, showPatientEffort, onShowPatientEffortChange, patientEffortLocked = false, showSpO2Ceiling = true, collapsible = true }: { settings: PatientSettings; onChange: (next: PatientSettings) => void; onReset: () => void; onResetPhysiology: () => void; transitionSeconds: number; onTransitionSecondsChange: (seconds: number) => void; showPatientEffort: boolean; onShowPatientEffortChange: (value: boolean) => void; patientEffortLocked?: boolean; showSpO2Ceiling?: boolean; collapsible?: boolean }) {",
)
replace_once('src/components/Controls.tsx', "    <section className={`control-section patient-section ${collapsed ? 'panel-collapsed' : ''}`}>", "    <section className={`control-section patient-section ${collapsible && collapsed ? 'panel-collapsed' : ''}`}>")
replace_once(
    'src/components/Controls.tsx',
    '''          <button className="panel-collapse-button" type="button" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand patient settings' : 'Collapse patient settings'} title={collapsed ? 'Expand patient settings' : 'Collapse patient settings'}>{collapsed ? '▾' : '▴'}</button>''',
    '''          {collapsible && <button className="panel-collapse-button" type="button" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand patient settings' : 'Collapse patient settings'} title={collapsed ? 'Expand patient settings' : 'Collapse patient settings'}>{collapsed ? '▾' : '▴'}</button>}''',
)

replace_once('src/App.tsx', "  const [instructorSimulatorExpanded, setInstructorSimulatorExpanded] = useState(false)", "  const [instructorSimulatorExpanded, setInstructorSimulatorExpanded] = useState(false)\n  const [wideInstructorLayout, setWideInstructorLayout] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1101px)').matches)")
replace_once('src/App.tsx', "  const scenarioClockOriginRef = useRef(WINDOW_SAMPLES * DT)", "  const scenarioClockOriginRef = useRef(WINDOW_SAMPLES * DT)\n\n  useEffect(() => {\n    const media = window.matchMedia('(min-width: 1101px)')\n    const update = () => setWideInstructorLayout(media.matches)\n    update()\n    media.addEventListener('change', update)\n    return () => media.removeEventListener('change', update)\n  }, [])")
replace_once(
    'src/App.tsx',
    '<VentilatorControls settings={ventilator} onChange={setVentilator} onReset={resetVentilator} fio2Override={effectiveVentilator.fio2} fio2BoostActive={oxygenBoost} />',
    '<VentilatorControls collapsible={teachingSession.role !== \'instructor\' || instructorSimulatorExpanded || !wideInstructorLayout} settings={ventilator} onChange={setVentilator} onReset={resetVentilator} fio2Override={effectiveVentilator.fio2} fio2BoostActive={oxygenBoost} />',
)
replace_once(
    'src/App.tsx',
    '<PatientControls settings={patient} onChange={setPatient} onReset={resetPatientRespiratory} onResetPhysiology={resetPatientPhysiology} transitionSeconds={patientTransitionSeconds} onTransitionSecondsChange={setPatientTransitionSeconds} showPatientEffort={patientEffortVisible} onShowPatientEffortChange={teachingSession.role === \'candidate\' ? () => undefined : setShowPatientEffort} patientEffortLocked={teachingSession.role === \'candidate\'} showSpO2Ceiling={teachingSession.role !== \'candidate\'} />',
    '<PatientControls collapsible={teachingSession.role !== \'instructor\' || instructorSimulatorExpanded || !wideInstructorLayout} settings={patient} onChange={setPatient} onReset={resetPatientRespiratory} onResetPhysiology={resetPatientPhysiology} transitionSeconds={patientTransitionSeconds} onTransitionSecondsChange={setPatientTransitionSeconds} showPatientEffort={patientEffortVisible} onShowPatientEffortChange={teachingSession.role === \'candidate\' ? () => undefined : setShowPatientEffort} patientEffortLocked={teachingSession.role === \'candidate\'} showSpO2Ceiling={teachingSession.role !== \'candidate\'} />',
)

replace_once('src/appVersion.ts', "export const APP_VERSION = '0.78.5'", "export const APP_VERSION = '0.78.6'")
