from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# EDUVENT persistence migration.
app_path = Path('src/App.tsx')
app = app_path.read_text()
if "./core/SimulationPersistence" not in app:
    app = replace_once(
        app,
        "import { useTeachingSharedOxygenFlush } from './teaching/useTeachingSharedOxygenFlush'\n",
        "import { useTeachingSharedOxygenFlush } from './teaching/useTeachingSharedOxygenFlush'\nimport { createSimulationPersistence } from './core/SimulationPersistence'\n",
        'EDUVENT persistence import',
    )

if "const eduventPersistence = createSimulationPersistence('eduvent')" not in app:
    app = replace_once(
        app,
        "const TICK_STEPS = 10\n",
        "const TICK_STEPS = 10\nconst eduventPersistence = createSimulationPersistence('eduvent')\n",
        'EDUVENT persistence singleton',
    )

old_loader = '''function loadStoredSettings<T extends object>(key: string, defaults: T): T {\n  if (typeof window === 'undefined') return { ...defaults }\n  try {\n    const stored = window.localStorage.getItem(key)\n    if (!stored) return { ...defaults }\n    const parsed = JSON.parse(stored)\n    if (!parsed || typeof parsed !== 'object') return { ...defaults }\n    return { ...defaults, ...(parsed as Partial<T>) }\n  } catch {\n    return { ...defaults }\n  }\n}\n'''
new_loader = '''function loadStoredSettings<T extends object>(key: string, defaults: T): T {\n  const name = key.startsWith('eduvent.') ? key.slice('eduvent.'.length) : key\n  const parsed = eduventPersistence.readJson<Partial<T> | null>(name, null, [key])\n  if (!parsed || typeof parsed !== 'object') return { ...defaults }\n  return { ...defaults, ...parsed }\n}\n'''
if old_loader in app:
    app = app.replace(old_loader, new_loader, 1)

app = app.replace("const stored = window.localStorage.getItem(PATIENT_PROFILE_STORAGE_KEY)", "const stored = eduventPersistence.readString('patient-preset', '', [PATIENT_PROFILE_STORAGE_KEY])")
app = app.replace("const stored = window.localStorage.getItem(ARDS_SEVERITY_STORAGE_KEY)", "const stored = eduventPersistence.readString('ards-severity', '', [ARDS_SEVERITY_STORAGE_KEY])")
app = app.replace("return window.localStorage.getItem(PATIENT_PROFILE_STORAGE_KEY) === 'ARDS' ? 'moderate' : 'off'", "return eduventPersistence.readString('patient-preset', '', [PATIENT_PROFILE_STORAGE_KEY]) === 'ARDS' ? 'moderate' : 'off'")
app = app.replace("const stored = Number(window.localStorage.getItem(PATIENT_TRANSITION_STORAGE_KEY) ?? 0)", "const stored = eduventPersistence.readNumber('patient-transition-seconds', 0, [PATIENT_TRANSITION_STORAGE_KEY])")
app = app.replace("const parsed = JSON.parse(window.localStorage.getItem(SCENARIO_MEDIA_STORAGE_KEY) ?? '[]')", "const parsed = eduventPersistence.readJson<unknown>('scenario-media-ids', [], [SCENARIO_MEDIA_STORAGE_KEY])")
app = app.replace("const [showPatientEffort, setShowPatientEffort] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem(SHOW_PATIENT_EFFORT_STORAGE_KEY) === 'true')", "const [showPatientEffort, setShowPatientEffort] = useState(() => eduventPersistence.readString('show-patient-effort', 'false', [SHOW_PATIENT_EFFORT_STORAGE_KEY]) === 'true')")

write_replacements = {
    "window.localStorage.setItem(VENTILATOR_STORAGE_KEY, JSON.stringify(ventilator))": "eduventPersistence.writeJson('ventilator-settings', ventilator)",
    "window.localStorage.setItem(PATIENT_STORAGE_KEY, JSON.stringify(patient))": "eduventPersistence.writeJson('patient-settings', patient)",
    "window.localStorage.setItem(PATIENT_TRANSITION_STORAGE_KEY, String(patientTransitionSeconds))": "eduventPersistence.writeNumber('patient-transition-seconds', patientTransitionSeconds)",
    "window.localStorage.setItem(ALARM_STORAGE_KEY, JSON.stringify(alarmLimits))": "eduventPersistence.writeJson('alarm-limits', alarmLimits)",
    "window.localStorage.setItem(WAVEFORM_STORAGE_KEY, JSON.stringify(waveformDisplay))": "eduventPersistence.writeJson('waveform-display', waveformDisplay)",
    "window.localStorage.setItem(SCENARIO_MEDIA_STORAGE_KEY, JSON.stringify(scenarioMediaIds))": "eduventPersistence.writeJson('scenario-media-ids', scenarioMediaIds)",
    "window.localStorage.setItem(SHOW_PATIENT_EFFORT_STORAGE_KEY, String(showPatientEffort))": "eduventPersistence.writeString('show-patient-effort', String(showPatientEffort))",
    "window.localStorage.setItem(PATIENT_PROFILE_STORAGE_KEY, profile)": "eduventPersistence.writeString('patient-preset', profile)",
    "window.localStorage.setItem(ARDS_SEVERITY_STORAGE_KEY, severity)": "eduventPersistence.writeString('ards-severity', severity)",
}
for old, new in write_replacements.items():
    app = app.replace(old, new)
app_path.write_text(app)

# EDUMON persistence migration and direct shared secondary display use.
ed_path = Path('src/edumon/EdumonApp.tsx')
ed = ed_path.read_text()
ed = ed.replace("import { AuxiliaryMonitorModal } from './AuxiliaryMonitorModal'", "import { SecondaryMonitorSurface } from '../components/SecondaryMonitorSurface'")
if "../core/SimulationPersistence" not in ed:
    ed = ed.replace("import { scenarioProductForEdumonModule } from '../teaching/scenario/products'", "import { scenarioProductForEdumonModule } from '../teaching/scenario/products'\nimport { createSimulationPersistence, type SimulationPersistence } from '../core/SimulationPersistence'")
ed = ed.replace('AuxiliaryMonitorModal', 'SecondaryMonitorSurface')

old_alarm_loader_start = "function loadEdumonAlarmLimits(): EdumonAlarmLimits {\n  if (typeof window === 'undefined') return { ...DEFAULT_EDUMON_ALARM_LIMITS }\n  try {\n    const raw = window.localStorage.getItem(EDUMON_ALARM_STORAGE_KEY)\n    if (!raw) return { ...DEFAULT_EDUMON_ALARM_LIMITS }\n    const stored = JSON.parse(raw) as Partial<EdumonAlarmLimits>\n"
new_alarm_loader_start = "function loadEdumonAlarmLimits(persistence: SimulationPersistence): EdumonAlarmLimits {\n  try {\n    const stored = persistence.readJson<Partial<EdumonAlarmLimits>>('alarm-limits', {}, [EDUMON_ALARM_STORAGE_KEY])\n"
ed = ed.replace(old_alarm_loader_start, new_alarm_loader_start)

ed = ed.replace("function EdumonMonitor({ module }: { module: EdumonModuleDefinition }) {\n  const [patientState", "function EdumonMonitor({ module }: { module: EdumonModuleDefinition }) {\n  const productId = scenarioProductForEdumonModule(module.id)\n  const persistence = useMemo(() => createSimulationPersistence(productId), [productId])\n  const [patientState")
ed = ed.replace("const stored = Number(window.localStorage.getItem(EDUMON_PATIENT_TRANSITION_STORAGE_KEY) ?? 0)", "const stored = persistence.readNumber('patient-transition-seconds', 0, [EDUMON_PATIENT_TRANSITION_STORAGE_KEY])")
ed = ed.replace("const [alarmLimits, setAlarmLimits] = useState<EdumonAlarmLimits>(loadEdumonAlarmLimits)", "const [alarmLimits, setAlarmLimits] = useState<EdumonAlarmLimits>(() => loadEdumonAlarmLimits(persistence))")
ed = ed.replace("window.localStorage.setItem(EDUMON_ALARM_STORAGE_KEY, JSON.stringify(alarmLimits))", "persistence.writeJson('alarm-limits', alarmLimits)")
ed = ed.replace("}, [alarmLimits])", "}, [alarmLimits, persistence])", 1)
ed = ed.replace("useEffect(() => { window.localStorage.setItem(EDUMON_PATIENT_TRANSITION_STORAGE_KEY, String(patientTransitionSeconds)) }, [patientTransitionSeconds])", "useEffect(() => { persistence.writeNumber('patient-transition-seconds', patientTransitionSeconds) }, [patientTransitionSeconds, persistence])")
ed_path.write_text(ed)

print('Applied EDUSIM persistence and secondary-display migration')
