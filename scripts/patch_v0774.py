from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# Single application-version source.
Path('src/appVersion.ts').write_text("export const APP_VERSION = '0.77.4'\n")

replace_once(
    'src/App.tsx',
    "import { calculatePhysiologicalMeasurements } from './physiologyMeasurements'\n",
    "import { calculatePhysiologicalMeasurements } from './physiologyMeasurements'\nimport { APP_VERSION } from './appVersion'\n",
)

replace_once(
    'src/App.tsx',
    "  const candidateWaveformOptions = useMemo(\n    () => teachingSession.candidateOesophagealPressureAllowed\n      ? waveformOptions\n      : waveformOptions.filter((option) => option.value !== 'oesophagealPressure'),\n    [teachingSession.candidateOesophagealPressureAllowed],\n  )\n\n  const currentInstructorScenario: InstructorScenarioSnapshot = {\n",
    "  const candidateWaveformOptions = useMemo(\n    () => teachingSession.candidateOesophagealPressureAllowed\n      ? waveformOptions\n      : waveformOptions.filter((option) => option.value !== 'oesophagealPressure'),\n    [teachingSession.candidateOesophagealPressureAllowed],\n  )\n  const oesophagealMonitoringEnabled = teachingSession.candidateOesophagealPressureAllowed && (\n    waveformDisplay.third === 'oesophagealPressure' || waveformDisplay.fourth === 'oesophagealPressure'\n  )\n\n  const currentInstructorScenario: InstructorScenarioSnapshot = {\n",
)

replace_once('src/App.tsx', "      appVersion: '0.77.3',", "      appVersion: APP_VERSION,")
replace_once('src/App.tsx', '<span className="version">v0.77.3</span>', '<span className="version">v{APP_VERSION}</span>')
replace_once(
    'src/App.tsx',
    '<PhysiologyMeasurementsDialog open={measurementsOpen} measurements={physiologyMeasurements} onClose={() => setMeasurementsOpen(false)} />',
    '<PhysiologyMeasurementsDialog open={measurementsOpen} measurements={physiologyMeasurements} oesophagealEnabled={oesophagealMonitoringEnabled} onClose={() => setMeasurementsOpen(false)} />',
)

# Remove SessionPanel's imperative DOM version mutation. App renders APP_VERSION directly.
replace_once(
    'src/components/SessionPanel.tsx',
    "\n\n  useEffect(() => {\n    const version = document.querySelector<HTMLElement>('.version')\n    if (version) version.textContent = 'v0.77.3'\n  }, [])\n",
    "\n",
)

# Make oesophageal monitor availability explicit React data instead of DOM inspection.
replace_once(
    'src/components/PhysiologyMeasurementsDialog.tsx',
    "interface Props {\n  open: boolean\n  measurements: PhysiologicalMeasurements\n  onClose: () => void\n}\n",
    "interface Props {\n  open: boolean\n  measurements: PhysiologicalMeasurements\n  oesophagealEnabled: boolean\n  onClose: () => void\n}\n",
)
replace_once(
    'src/components/PhysiologyMeasurementsDialog.tsx',
    "\nfunction oesophagealTraceIsInUse() {\n  if (typeof document === 'undefined') return false\n  return Array.from(document.querySelectorAll<HTMLSelectElement>('.waveform-options-bar select'))\n    .some((select) => select.value === 'oesophagealPressure')\n}\n",
    "",
)
replace_once(
    'src/components/PhysiologyMeasurementsDialog.tsx',
    "export function PhysiologyMeasurementsDialog({ open, measurements, onClose }: Props) {\n  const [tab, setTab] = useState<MonitorTab>('general')\n  const oesophagealEnabled = open ? oesophagealTraceIsInUse() : false\n",
    "export function PhysiologyMeasurementsDialog({ open, measurements, oesophagealEnabled, onClose }: Props) {\n  const [tab, setTab] = useState<MonitorTab>('general')\n",
)

print('v0.77.4 technical-debt patch applied')
