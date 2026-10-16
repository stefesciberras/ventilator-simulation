from pathlib import Path

p = Path('src/instructorAccount.ts')
s = p.read_text()

def r(old, new):
    global s
    if old not in s:
        raise SystemExit('missing: ' + old[:80])
    s = s.replace(old, new, 1)

r("""  /** Rule used to progress from this stage to the next. Missing means manual. */
  advanceTrigger?: DynamicScenarioTrigger
}
""", """  /** Legacy single trigger, retained for backwards compatibility. */
  advanceTrigger?: DynamicScenarioTrigger
  /** v4 trigger list. Any configured trigger may advance the stage (OR semantics). */
  advanceTriggers?: DynamicScenarioTrigger[]
}

export function dynamicStageTriggers(stage: DynamicScenarioStage): DynamicScenarioTrigger[] {
  const configured = stage.advanceTriggers?.length
    ? stage.advanceTriggers
    : [stage.advanceTrigger ?? { type: 'manual' as const }]
  const seen = new Set<DynamicScenarioTrigger['type']>()
  const deduplicated = configured.filter((trigger) => {
    if (seen.has(trigger.type)) return false
    seen.add(trigger.type)
    return true
  })
  return deduplicated.length ? deduplicated : [{ type: 'manual' }]
}
""")

r("""    schemaVersion: 3,
    kind: 'dynamic',
    description: description.trim(),
    stages: [{ name: 'Stage 1', snapshot: firstStageSnapshot, apply, sourceName, advanceTrigger: { type: 'manual' } }],
""", """    schemaVersion: 4,
    kind: 'dynamic',
    description: description.trim(),
    stages: [{ name: 'Stage 1', snapshot: firstStageSnapshot, apply, sourceName, advanceTrigger: { type: 'manual' }, advanceTriggers: [{ type: 'manual' }] }],
""")

r("""    stages: scenario.kind === 'dynamic' ? (scenario.stages ?? []).map((stage, index) => ({
      name: stage.name || `Stage ${index + 1}`,
      snapshot: { ...stage.snapshot, patient: normalisePatientSettings(stage.snapshot.patient), kind: 'static', stages: undefined },
      apply: stage.apply,
      sourceName: stage.sourceName,
      advanceTrigger: stage.advanceTrigger ?? { type: 'manual' },
    })) : undefined,
""", """    stages: scenario.kind === 'dynamic' ? (scenario.stages ?? []).map((stage, index) => {
      const triggers = dynamicStageTriggers(stage)
      return {
        name: stage.name || `Stage ${index + 1}`,
        snapshot: { ...stage.snapshot, patient: normalisePatientSettings(stage.snapshot.patient), kind: 'static', stages: undefined },
        apply: stage.apply,
        sourceName: stage.sourceName,
        advanceTrigger: triggers[0],
        advanceTriggers: triggers,
      }
    }) : undefined,
""")

p.write_text(s)
Path('src/scenario-builder/version.ts').write_text("export const SCENARIO_BUILDER_VERSION = '0.2.0.4'\n")
