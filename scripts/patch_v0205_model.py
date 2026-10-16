from pathlib import Path

def r(path, old, new):
    p=Path(path); s=p.read_text()
    if old not in s: raise SystemExit(f'missing in {path}: {old[:100]}')
    p.write_text(s.replace(old,new,1))

def ra(path, old, new):
    p=Path(path); s=p.read_text()
    if old not in s: raise SystemExit(f'missing in {path}: {old}')
    p.write_text(s.replace(old,new))

r('src/instructorAccount.ts',
  "export interface DynamicScenarioStage {\n  name: string\n  snapshot: InstructorScenarioSnapshot\n",
  "export interface DynamicScenarioStage {\n  name: string\n  /** Instructor-facing explanation of what should happen during this stage. */\n  comment?: string\n  snapshot: InstructorScenarioSnapshot\n")
r('src/instructorAccount.ts',
  "    schemaVersion: 4,\n    kind: 'dynamic',\n    description: description.trim(),\n    stages: [{ name: 'Stage 1', snapshot: firstStageSnapshot, apply, sourceName, advanceTrigger: { type: 'manual' }, advanceTriggers: [{ type: 'manual' }] }],\n",
  "    schemaVersion: 5,\n    kind: 'dynamic',\n    description: description.trim(),\n    stages: [{ name: 'Stage 1', comment: '', snapshot: firstStageSnapshot, apply, sourceName, advanceTrigger: { type: 'manual' }, advanceTriggers: [{ type: 'manual' }] }],\n")
r('src/instructorAccount.ts',
  "        name: stage.name || `Stage ${index + 1}`,\n        snapshot: { ...stage.snapshot, patient: normalisePatientSettings(stage.snapshot.patient), kind: 'static', stages: undefined },\n",
  "        name: stage.name || `Stage ${index + 1}`,\n        comment: stage.comment ?? '',\n        snapshot: { ...stage.snapshot, patient: normalisePatientSettings(stage.snapshot.patient), kind: 'static', stages: undefined },\n")
Path('src/scenario-builder/version.ts').write_text("export const SCENARIO_BUILDER_VERSION = '0.2.0.5'\n")
ra('src/components/DynamicScenarioBuilder.tsx','schemaVersion: 4','schemaVersion: 5')
ra('src/components/InstructorAccountControls.tsx','schemaVersion: 4','schemaVersion: 5')
r('src/components/DynamicScenarioBuilder.tsx',
  "  return {\n    name: `Stage ${index + 1}`,\n    snapshot,\n",
  "  return {\n    name: `Stage ${index + 1}`,\n    comment: '',\n    snapshot,\n")
