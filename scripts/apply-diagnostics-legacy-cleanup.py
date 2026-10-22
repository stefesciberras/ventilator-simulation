from pathlib import Path

# 1. EDUMON diagnostics -> shared EDUSIM diagnostics core.
path = Path('src/edumon/EdumonApp.tsx')
text = path.read_text()
needle = "import { createSimulationPersistence, type SimulationPersistence } from '../core/SimulationPersistence'\n"
if "../core/SimulationDiagnostics" not in text:
    text = text.replace(needle, needle + "import { copySimulationDiagnostic } from '../core/SimulationDiagnostics'\n")

old = '''  const copyEdumonMonitorDiagnostics = async () => {\n    await navigator.clipboard.writeText(JSON.stringify({ product: module.productName, simulationTime: elapsed, patient: patientState, measurements, simulationPaused, simulationSpeed }, null, 2))\n  }\n  const copyEdumonSessionDiagnostics = async () => {\n    await navigator.clipboard.writeText(JSON.stringify({ product: module.productName, role: teachingSession.role, session: teachingSession.session, members: teachingSession.members, scenarioRuntime: scenarioRuntime.runtimeSnapshot }, null, 2))\n  }\n'''
new = '''  const copyEdumonMonitorDiagnostics = async () => {\n    await copySimulationDiagnostic<MonitorSample>({\n      productId,\n      productLabel: module.productName,\n      appVersion: EDUMON_APP_VERSION,\n      kind: 'monitor-state',\n      payload: { simulationTime: elapsed, patient: patientState, measurements, simulationPaused, simulationSpeed },\n      waveform: {\n        source: frozenSamples ? 'frozen' : 'live',\n        sampleIntervalSeconds: 1 / SAMPLE_RATE,\n        samples,\n        columns: ['time', 'ecg', 'arterialPressure', 'pleth'],\n        units: { time: 's', ecg: 'mV', arterialPressure: 'mmHg', pleth: 'relative' },\n        sampleTimeSeconds: (sample) => sample.time,\n        serializeSample: (sample) => [sample.time, sample.ecg, sample.arterialPressure, sample.pleth],\n      },\n    })\n  }\n  const copyEdumonSessionDiagnostics = async () => {\n    await copySimulationDiagnostic({\n      productId,\n      productLabel: module.productName,\n      appVersion: EDUMON_APP_VERSION,\n      kind: 'session-scenario-state',\n      payload: { role: teachingSession.role, session: teachingSession.session, members: teachingSession.members, scenarioRuntime: scenarioRuntime.runtimeSnapshot },\n    })\n  }\n'''
if old not in text:
    raise RuntimeError('EDUMON diagnostic block not found')
text = text.replace(old, new, 1)
path.write_text(text)

# 2. Remove SessionPanel compatibility wrapper from EDUVENT app.
path = Path('src/App.tsx')
text = path.read_text()
text = text.replace("import { InstructorLiveRoom, SessionPanel } from './components/SessionPanel'\n", "import { EduventSessionPanel } from './eduvent/EduventSessionPanel'\n")
old_teaching = "import { SharedTeachingTab, TeachingCandidateOverlay, TeachingLaserPointerSurface, eduventTeachingHost, useTeachingPrompts, useTeachingQuestionLibrary, type TeachingMetricSnapshot } from './teaching'"
new_teaching = "import { SharedTeachingTab, SharedInstructorLiveRoom, ProductCandidateTelemetry, TeachingCandidateOverlay, TeachingLaserPointerSurface, eduventTeachingHost, useTeachingPrompts, useTeachingQuestionLibrary, type TeachingMetricSnapshot } from './teaching'"
if old_teaching in text:
    text = text.replace(old_teaching, new_teaching, 1)
if "getSimulationProduct" not in text:
    text = text.replace("import { createSimulationPersistence } from './core/SimulationPersistence'\n", "import { createSimulationPersistence } from './core/SimulationPersistence'\nimport { getSimulationProduct } from './core/products'\n")
text = text.replace('<SessionPanel', '<EduventSessionPanel')
old_live = 'liveRoom={<InstructorLiveRoom role={teachingSession.role} members={teachingSession.members} />}'
new_live = '''liveRoom={<SharedInstructorLiveRoom\n                    role={teachingSession.role}\n                    members={teachingSession.members}\n                    storageKey="eduvent-instructor-live-room"\n                    renderTelemetry={(member) => <ProductCandidateTelemetry product={getSimulationProduct('eduvent')} member={member} />}\n                  />}'''
if old_live not in text:
    raise RuntimeError('EDUVENT live room compatibility use not found')
text = text.replace(old_live, new_live, 1)
path.write_text(text)

# 3. Remove confirmed-dead compatibility/legacy files.
for filename in [
    'src/components/CandidateInvitation.tsx',
    'src/components/SessionPanel.tsx',
    'src/components/DynamicScenarioBuilder.tsx',
    'src/components/DynamicScenarioBuilder.css',
    'src/components/DynamicScenarioRuntimeLibrary.tsx',
]:
    target = Path(filename)
    if target.exists():
        target.unlink()

# 4. Versions.
version = Path('src/appVersion.ts')
version.write_text(version.read_text().replace("0.83.0.19", "0.83.0.20").replace("0.83.0.18", "0.83.0.19"))
edumon = Path('src/edumon/appVersion.ts')
edumon.write_text(edumon.read_text().replace("0.1.0.21", "0.1.0.22").replace("0.1.0.20", "0.1.0.21"))

# 5. Guard against removed legacy imports.
for root in [Path('src')]:
    for source in root.rglob('*'):
        if source.is_file() and source.suffix in {'.ts', '.tsx'}:
            body = source.read_text(errors='ignore')
            if "./components/SessionPanel" in body or "DynamicScenarioBuilder" in body or "DynamicScenarioRuntimeLibrary" in body:
                raise RuntimeError(f'legacy reference remains in {source}')

print('Applied shared diagnostics and legacy cleanup')
