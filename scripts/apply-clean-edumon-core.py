from pathlib import Path

path = Path('src/edumon/EdumonApp.tsx')
text = path.read_text()

text = text.replace("import { AuxiliaryMonitorModal } from './AuxiliaryMonitorModal'", "import { SecondaryMonitorSurface } from '../components/SecondaryMonitorSurface'")
if "../core/SimulationPersistence" not in text:
    text = text.replace(
        "import { scenarioProductForEdumonModule } from '../teaching/scenario/products'",
        "import { scenarioProductForEdumonModule } from '../teaching/scenario/products'\nimport { createSimulationPersistence, type SimulationPersistence } from '../core/SimulationPersistence'",
    )

old_loader = '''function loadEdumonAlarmLimits(): EdumonAlarmLimits {\n  if (typeof window === 'undefined') return { ...DEFAULT_EDUMON_ALARM_LIMITS }\n  try {\n    const raw = window.localStorage.getItem(EDUMON_ALARM_STORAGE_KEY)\n    if (!raw) return { ...DEFAULT_EDUMON_ALARM_LIMITS }\n    const stored = JSON.parse(raw) as Partial<EdumonAlarmLimits>\n'''
new_loader = '''function loadEdumonAlarmLimits(persistence: SimulationPersistence): EdumonAlarmLimits {\n  try {\n    const stored = persistence.readJson<Partial<EdumonAlarmLimits>>('alarm-limits', {}, [EDUMON_ALARM_STORAGE_KEY])\n'''
if old_loader not in text:
    raise RuntimeError('alarm loader marker not found')
text = text.replace(old_loader, new_loader, 1)

start = "function EdumonMonitor({ module }: { module: EdumonModuleDefinition }) {\n  const [patientState"
replacement = "function EdumonMonitor({ module }: { module: EdumonModuleDefinition }) {\n  const productId = scenarioProductForEdumonModule(module.id)\n  const persistence = useMemo(() => createSimulationPersistence(productId), [productId])\n  const [patientState"
if start not in text:
    raise RuntimeError('EdumonMonitor marker not found')
text = text.replace(start, replacement, 1)

text = text.replace(
    "const stored = Number(window.localStorage.getItem(EDUMON_PATIENT_TRANSITION_STORAGE_KEY) ?? 0)",
    "const stored = persistence.readNumber('patient-transition-seconds', 0, [EDUMON_PATIENT_TRANSITION_STORAGE_KEY])",
    1,
)
text = text.replace(
    "const [alarmLimits, setAlarmLimits] = useState<EdumonAlarmLimits>(loadEdumonAlarmLimits)",
    "const [alarmLimits, setAlarmLimits] = useState<EdumonAlarmLimits>(() => loadEdumonAlarmLimits(persistence))",
    1,
)
text = text.replace(
    "window.localStorage.setItem(EDUMON_ALARM_STORAGE_KEY, JSON.stringify(alarmLimits))\n  }, [alarmLimits])",
    "persistence.writeJson('alarm-limits', alarmLimits)\n  }, [alarmLimits, persistence])",
    1,
)
text = text.replace(
    "useEffect(() => { window.localStorage.setItem(EDUMON_PATIENT_TRANSITION_STORAGE_KEY, String(patientTransitionSeconds)) }, [patientTransitionSeconds])",
    "useEffect(() => { persistence.writeNumber('patient-transition-seconds', patientTransitionSeconds) }, [patientTransitionSeconds, persistence])",
    1,
)
text = text.replace('AuxiliaryMonitorModal', 'SecondaryMonitorSurface')

path.write_text(text)
print('Applied clean EDUMON core migration')
