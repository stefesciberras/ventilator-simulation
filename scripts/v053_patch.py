from pathlib import Path


def replace_once(path: Path, old: str, new: str):
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:120]!r}')
    path.write_text(text.replace(old, new, 1))

app = Path('src/App.tsx')
panel = Path('src/components/SessionPanel.tsx')
supabase = Path('src/session/supabase.ts')
account = Path('src/instructorAccount.ts')

replace_once(
    app,
    "import { InstructorLiveRoom, SessionPanel } from './components/SessionPanel'\n",
    "import { InstructorLiveRoom, SessionPanel } from './components/SessionPanel'\n"
    "import { InstructorAccountControls } from './components/InstructorAccountControls'\n"
)
replace_once(
    app,
    "import { useTeachingSession } from './session/useTeachingSession'\n",
    "import { useTeachingSession } from './session/useTeachingSession'\n"
    "import type { InstructorScenarioSnapshot } from './instructorAccount'\n"
)

anchor = '''  const candidateWaveformOptions = useMemo(\n    () => teachingSession.candidateOesophagealPressureAllowed\n      ? waveformOptions\n      : waveformOptions.filter((option) => option.value !== 'oesophagealPressure'),\n    [teachingSession.candidateOesophagealPressureAllowed],\n  )\n'''
addition = anchor + '''\n  const currentInstructorScenario: InstructorScenarioSnapshot = {\n    ventilator,\n    patient,\n    alarmLimits,\n    patientTransitionSeconds,\n    waveformDisplay,\n  }\n\n  const loadInstructorScenario = (scenario: InstructorScenarioSnapshot) => {\n    setVentilator({ ...scenario.ventilator })\n    setPatient({ ...scenario.patient })\n    setAlarmLimits({ ...scenario.alarmLimits })\n    setPatientTransitionSeconds(scenario.patientTransitionSeconds)\n    setWaveformDisplay({ ...scenario.waveformDisplay })\n  }\n'''
replace_once(app, anchor, addition)

replace_once(
    app,
    '''          <span>{frozen ? 'SIMULATION PAUSED' : 'SIMULATION ACTIVE'}</span>\n          <button\n            className={`top-diagnostic-button ${diagnosticCopied ? 'active copied' : ''}`}\n''',
    '''          <span>{frozen ? 'SIMULATION PAUSED' : 'SIMULATION ACTIVE'}</span>\n          <InstructorAccountControls\n            role={teachingSession.role}\n            currentScenario={currentInstructorScenario}\n            onLoadScenario={loadInstructorScenario}\n          />\n          <button\n            className={`top-diagnostic-button ${diagnosticCopied ? 'active copied' : ''}`}\n'''
)

# Enable processing of email-confirmation redirects for instructor account signup.
replace_once(supabase, '    detectSessionInUrl: false,\n', '    detectSessionInUrl: true,\n')

# Treat absence of any auth session as a normal signed-out cloud state.
replace_once(
    account,
    '''export async function getInstructorAccount(): Promise<User | null> {\n  const { data, error } = await supabase.auth.getUser()\n  if (error) throw error\n  return isPermanentInstructor(data.user) ? data.user : null\n}\n''',
    '''export async function getInstructorAccount(): Promise<User | null> {\n  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()\n  if (sessionError) throw sessionError\n  if (!sessionData.session) return null\n  const { data, error } = await supabase.auth.getUser()\n  if (error) throw error\n  return isPermanentInstructor(data.user) ? data.user : null\n}\n'''
)

# Bump all user-visible / diagnostic version markers in the two UI files.
for path in (app, panel):
    text = path.read_text().replace('v0.52', 'v0.53').replace("'0.52'", "'0.53'")
    path.write_text(text)

print('v0.53 account integration patch applied')
