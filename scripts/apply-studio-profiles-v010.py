from pathlib import Path
import re


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'pattern missing in {path}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1))

# Studio navigation + Profiles resource
p = Path('src/scenario-builder/ScenarioBuilderApp.tsx')
s = p.read_text()
s = s.replace("import { EdumonScenarioEditor } from './modules/edumon/EdumonScenarioEditor'\n", "import { EdumonScenarioEditor } from './modules/edumon/EdumonScenarioEditor'\nimport { ProfileEditor } from './ProfileEditor'\n")
s = s.replace("  const [moduleId, setModuleId] = useState(DEFAULT_SCENARIO_MODULE_ID)\n", "  const [moduleId, setModuleId] = useState(DEFAULT_SCENARIO_MODULE_ID)\n  const [resource, setResource] = useState<'scenarios' | 'profiles'>('scenarios')\n")
marker = "      </section>\n\n      {loading ? ("
nav = """      </section>\n\n      <nav className=\"scenario-builder-resourcebar\" aria-label=\"Studio resources\">\n        <button type=\"button\" className={resource === 'scenarios' ? 'selected' : ''} onClick={() => setResource('scenarios')}>Scenarios</button>\n        <button type=\"button\" className={resource === 'profiles' ? 'selected' : ''} onClick={() => setResource('profiles')}>Profiles</button>\n        <button type=\"button\" onClick={() => window.location.assign('/actions')}>Actions</button>\n      </nav>\n\n      {loading ? ("""
if marker not in s: raise SystemExit('Studio resource marker missing')
s = s.replace(marker, nav, 1)
old = """      ) : moduleId === 'ventilator' ? (\n        <section className=\"scenario-builder-workspace\">\n          <VentilatorScenarioEditor"""
new = """      ) : resource === 'profiles' ? (\n        <section className=\"scenario-builder-workspace\">\n          <ProfileEditor product={moduleId === 'ventilator' ? 'mv' : moduleId === 'anaesth' ? 'anaesth' : 'icu'} />\n        </section>\n      ) : moduleId === 'ventilator' ? (\n        <section className=\"scenario-builder-workspace\">\n          <VentilatorScenarioEditor"""
if old not in s: raise SystemExit('Studio render marker missing')
s = s.replace(old, new, 1)
s = s.replace('The shared LoppjuSIM authoring workspace for creating and maintaining educational simulation scenarios.', 'The shared LoppjuSIM authoring workspace for scenarios, patient profiles and simulation actions.')
p.write_text(s)

# Move EDUMON built-ins to dedicated profile module + consume cloud profile library.
p = Path('src/edumon/EdumonWorkspacePanel.tsx')
s = p.read_text()
s = s.replace("import { useEffect, useState, type ReactNode } from 'react'", "import { useEffect, useMemo, useState, type ReactNode } from 'react'")
s = s.replace("import { SimulationTransitionTimeControl } from '../components/SimulationTransitionTimeControl'\n", "import { SimulationTransitionTimeControl } from '../components/SimulationTransitionTimeControl'\nimport { EDUMON_PATIENT_PROFILES } from './patientProfiles'\nimport { EDUMON_PROFILE_KEYS } from '../profiles/builtinProfiles'\nimport { useProductProfiles } from '../profiles/useProductProfiles'\n")
s = re.sub(r"export type EdumonPatientProfile = 'Awake' \| 'Asleep' \| 'Paediatric'\n\nexport const EDUMON_PATIENT_PROFILES: Record<EdumonPatientProfile, MonitorPatientState> = \{.*?\n\}\n\n", '', s, count=1, flags=re.S)
s = s.replace("  const [profile, setProfile] = useState<EdumonPatientProfile>('Awake')", "  const [profile, setProfile] = useState<string>('Awake')\n  const profileProduct = teachingHost.appId.toLowerCase().includes('icu') ? 'icu' as const : 'anaesth' as const\n  const { rows: savedProfiles } = useProductProfiles<MonitorPatientState>(profileProduct)\n  const resolvedProfiles = useMemo<Record<string, MonitorPatientState>>(() => {\n    const result: Record<string, MonitorPatientState> = { ...EDUMON_PATIENT_PROFILES }\n    for (const [name, baseKey] of Object.entries(EDUMON_PROFILE_KEYS)) {\n      const override = savedProfiles.find((row) => row.base_key === baseKey)\n      if (override) result[name] = { ...result[name], ...override.values }\n    }\n    for (const row of savedProfiles.filter((candidate) => !candidate.base_key)) result[row.name] = row.values\n    return result\n  }, [savedProfiles])")
s = re.sub(r"  const applyProfile = \(nextProfile: EdumonPatientProfile\) => \{.*?\n  \}\n\n  const updateRhythm", """  const applyProfile = (nextProfile: string) => {\n    if (patientControlsLocked) return\n    const values = resolvedProfiles[nextProfile]\n    if (!values) return\n    setProfile(nextProfile)\n    supersedeActionTarget('haemodynamics.heartRate')\n    supersedeActionTarget('haemodynamics.meanArterialPressure')\n    onPatientStateChange({\n      ...values,\n      respiratory: patientState.respiratory,\n      anaestheticGases: patientState.anaestheticGases,\n      anaestheticPhysiology: patientState.anaestheticPhysiology,\n    })\n  }\n\n  const updateRhythm""", s, count=1, flags=re.S)
s = re.sub(r"  const profiles: Array<SimulationControlProfileDefinition<EdumonPatientProfile>> = \(Object\.keys\(EDUMON_PATIENT_PROFILES\) as EdumonPatientProfile\[\]\)\.map\(\(candidate\) => \(\{.*?\n  \}\)\)\n", """  const profiles: Array<SimulationControlProfileDefinition<string>> = Object.keys(resolvedProfiles).map((candidate) => ({\n    id: candidate,\n    label: candidate,\n    active: profile === candidate,\n    disabled: patientControlsLocked,\n    className: profile === candidate ? 'profile-selected' : '',\n    title: patientControlsLocked ? 'Patient profile controlled by instructor' : `Apply ${candidate} profile`,\n    onSelect: applyProfile,\n  }))\n""", s, count=1, flags=re.S)
p.write_text(s)

# MV: resolve built-in overrides and custom profiles from the shared profile library.
p = Path('src/App.tsx')
s = p.read_text()
s = s.replace("import { ARDS_PROFILES, ARDS_SEVERITIES, PATIENT_PROFILES, PATIENT_PROFILE_NAMES, patientMatchesProfile, type ArdsSeverity, type PatientProfileName } from './patientProfiles'\n", "import { ARDS_PROFILES, ARDS_SEVERITIES, PATIENT_PROFILES, PATIENT_PROFILE_NAMES, patientMatchesProfile, type ArdsSeverity } from './patientProfiles'\nimport { MV_PROFILE_KEYS } from './profiles/builtinProfiles'\nimport { useProductProfiles } from './profiles/useProductProfiles'\n")
s = s.replace("  const screenWakeLock = useScreenWakeLock()\n", "  const screenWakeLock = useScreenWakeLock()\n  const { rows: savedPatientProfiles } = useProductProfiles<PatientSettings>('mv')\n")
s = re.sub(r"  const \[selectedPatientProfile, setSelectedPatientProfile\] = useState<PatientProfileName \| null>\(\(\) => \{.*?\n  \}\)\n", """  const [selectedPatientProfile, setSelectedPatientProfile] = useState<string | null>(() => {\n    if (typeof window === 'undefined') return null\n    return eduventPersistence.readString('patient-preset', '', [PATIENT_PROFILE_STORAGE_KEY]) || null\n  })\n""", s, count=1, flags=re.S)
needle = "  const oxygenBoostTimer = `0:${String(oxygenBoostSecondsRemaining).padStart(2, '0')}`\n"
insert = """  const resolvedArdsProfiles = useMemo(() => ({\n    mild: { ...ARDS_PROFILES.mild, ...(savedPatientProfiles.find((row) => row.base_key === MV_PROFILE_KEYS.ArdsMild)?.values ?? {}) },\n    moderate: { ...ARDS_PROFILES.moderate, ...(savedPatientProfiles.find((row) => row.base_key === MV_PROFILE_KEYS.ArdsModerate)?.values ?? {}) },\n    severe: { ...ARDS_PROFILES.severe, ...(savedPatientProfiles.find((row) => row.base_key === MV_PROFILE_KEYS.ArdsSevere)?.values ?? {}) },\n  }), [savedPatientProfiles])\n  const resolvedPatientProfiles = useMemo(() => ({\n    Normal: { ...PATIENT_PROFILES.Normal, ...(savedPatientProfiles.find((row) => row.base_key === MV_PROFILE_KEYS.Normal)?.values ?? {}) },\n    ARDS: resolvedArdsProfiles.moderate,\n    COPD: { ...PATIENT_PROFILES.COPD, ...(savedPatientProfiles.find((row) => row.base_key === MV_PROFILE_KEYS.COPD)?.values ?? {}) },\n    Asthma: { ...PATIENT_PROFILES.Asthma, ...(savedPatientProfiles.find((row) => row.base_key === MV_PROFILE_KEYS.Asthma)?.values ?? {}) },\n    Paed: { ...PATIENT_PROFILES.Paed, ...(savedPatientProfiles.find((row) => row.base_key === MV_PROFILE_KEYS.Paed)?.values ?? {}) },\n  }), [savedPatientProfiles, resolvedArdsProfiles])\n  const customPatientProfiles = useMemo(() => new Map(savedPatientProfiles.filter((row) => !row.base_key).map((row) => [row.name, row.values])), [savedPatientProfiles])\n\n""" + needle
if needle not in s: raise SystemExit('MV oxygen timer marker missing')
s = s.replace(needle, insert, 1)
s = re.sub(r"  const selectedProfileSettings = selectedPatientProfile === 'ARDS'.*?  const persistPatientProfile = \(profile: PatientProfileName\) => \{\n    setSelectedPatientProfile\(profile\)\n    try \{ eduventPersistence\.writeString\('patient-preset', profile\) \} catch \{ /\* optional UI preference \*/ \}\n  \}\n", """  const selectedProfileSettings = selectedPatientProfile === 'ARDS' && ardsSeverity !== 'off'\n    ? resolvedArdsProfiles[ardsSeverity]\n    : selectedPatientProfile != null\n      ? (resolvedPatientProfiles[selectedPatientProfile as keyof typeof resolvedPatientProfiles] ?? customPatientProfiles.get(selectedPatientProfile) ?? null)\n      : null\n  const selectedPatientProfileModified = selectedProfileSettings != null\n    ? !patientMatchesProfile(patient, selectedProfileSettings)\n    : false\n  const persistPatientProfile = (profile: string) => {\n    setSelectedPatientProfile(profile)\n    try { eduventPersistence.writeString('patient-preset', profile) } catch { /* optional UI preference */ }\n  }\n""", s, count=1, flags=re.S)
s = s.replace("  const applyPatientProfile = (profile: PatientProfileName) => {", "  const applyPatientProfile = (profile: string) => {")
s = s.replace("      setPatient({ ...ARDS_PROFILES[next] })", "      setPatient({ ...resolvedArdsProfiles[next] })")
s = s.replace("    setPatient({ ...PATIENT_PROFILES[profile] })", "    const nextProfile = resolvedPatientProfiles[profile as keyof typeof resolvedPatientProfiles] ?? customPatientProfiles.get(profile)\n    if (nextProfile) setPatient({ ...nextProfile })")
old_profiles = "profiles={PATIENT_PROFILE_NAMES.map((profile) => {"
new_profiles = "profiles={[...PATIENT_PROFILE_NAMES, ...savedPatientProfiles.filter((row) => !row.base_key).map((row) => row.name)].map((profile) => {"
if old_profiles not in s: raise SystemExit('MV profile bar marker missing')
s = s.replace(old_profiles, new_profiles, 1)
p.write_text(s)

# Studio version
replace_once('src/scenario-builder/version.ts', "export const SCENARIO_BUILDER_VERSION = '0.9.0'", "export const SCENARIO_BUILDER_VERSION = '0.10.0'")

# Studio profile UI styling
p = Path('src/scenario-builder/scenarioBuilder.css')
s = p.read_text()
s += r'''

/* Studio v0.10.0: first-class profile authoring */
.scenario-builder-resourcebar{display:flex;gap:.5rem;padding:.75rem 1rem;border-bottom:1px solid rgba(255,255,255,.09);background:#10151b}
.scenario-builder-resourcebar button{padding:.55rem .9rem;border:1px solid #394650;border-radius:8px;background:#171d24;color:#dce5eb;font-weight:650;cursor:pointer}
.scenario-builder-resourcebar button.selected{border-color:#61bedc;background:#14303a;color:#eafaff}
.studio-profile-editor{display:grid;grid-template-columns:minmax(190px,260px) minmax(0,1fr);gap:1rem;width:100%}
.studio-profile-list{border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#11171d;overflow:hidden;align-self:start}
.studio-profile-list-heading{padding:1rem;border-bottom:1px solid rgba(255,255,255,.09)}
.studio-profile-list-heading span,.studio-profile-detail header span{display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:#8ca0ad}
.studio-profile-list-heading strong{display:block;margin-top:.2rem}
.studio-profile-list>button{display:flex;width:100%;justify-content:space-between;align-items:center;gap:.5rem;padding:.75rem 1rem;border:0;border-bottom:1px solid rgba(255,255,255,.06);background:transparent;color:#dce5eb;text-align:left;cursor:pointer}
.studio-profile-list>button.selected{background:#18303a;color:white}
.studio-profile-list>button small{color:#8ca0ad;white-space:nowrap}
.studio-profile-detail{min-width:0;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#11171d;padding:1rem}
.studio-profile-detail>header{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;margin-bottom:1rem}
.studio-profile-detail>header h2{margin:.15rem 0 .25rem}
.studio-profile-detail>header p{margin:0;max-width:62rem;color:#9fb0ba}
.studio-profile-actions{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.studio-profile-delete{color:#ffc4c9!important;border-color:#78434a!important;background:#26151a!important}
.studio-profile-name{display:grid;gap:.35rem;max-width:36rem;margin-bottom:1rem}.studio-profile-name span{font-size:.8rem;color:#9fb0ba}.studio-profile-name input{padding:.6rem .7rem;border:1px solid #394650;border-radius:7px;background:#0d1217;color:#eef5f7}
.studio-profile-groups{display:grid;gap:1rem}
@media(max-width:760px){.studio-profile-editor{grid-template-columns:1fr}.studio-profile-detail>header{flex-direction:column}.studio-profile-actions{justify-content:flex-start}}
'''
p.write_text(s)
