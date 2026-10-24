import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Action/effects regression: ${message}`)
    process.exitCode = 1
  }
}

const panel = read('src/edumon/EdumonActionsPanel.tsx')
const actionPhysiology = read('src/edumon/actionPhysiology.ts')
const anaestheticPhysiology = read('src/edumon/anaestheticPhysiology.ts')
const bis = read('src/edumon/EdumonBisTrend.tsx')
const propofolMigration = read('supabase/migrations/20261024_propofol_effects.sql')
const instructorGuide = read('src/edumon/ACTIONS_AND_EFFECTS_GUIDE.md')
const aiPrompt = read('src/edumon/ACTIONS_AND_EFFECTS_AI_PROMPT.md')

assert(panel.includes("id: 'propofol'"), 'Propofol fallback definition must exist')
for (const effectId of ['propofol-hypnotic-effect', 'propofol-respiratory-drive', 'propofol-map']) {
  assert(panel.includes(effectId), `${effectId} must exist in fallback definition`)
  assert(propofolMigration.includes(effectId), `${effectId} must exist in persistent seed migration`)
}

assert(anaestheticPhysiology.includes("resolveNumericActionEffect('anaesthesia.hypnoticEffect'"), 'effective depth must consume declarative hypnotic effect')
assert(anaestheticPhysiology.includes('effectiveAnaestheticDepth'), 'effective anaesthetic depth helper must exist')
assert(actionPhysiology.includes('effectiveAnaestheticDepth(state, simulationTime)'), 'stimulus response must use effective action-aware depth')
assert(bis.includes('effectiveAnaestheticDepth(patientRef.current, getActionRuntimeSimulationTime())'), 'BIS must use the same effective action-aware depth')

for (const [name, text] of [['instructor guide', instructorGuide], ['AI prompt', aiPrompt]]) {
  assert(text.includes('Maintenance contract'), `${name} must declare its maintenance contract`)
  assert(text.includes('Actions describe effects; physiology interprets effects.'), `${name} must preserve the core architecture rule`)
  assert(text.includes('anaesthesia.hypnoticEffect'), `${name} must document hypnotic effect`)
  assert(text.includes('stimulus.sympathetic'), `${name} must document sympathetic stimulus`)
  assert(text.includes('simulation time'), `${name} must document simulation-time semantics`)
  assert(text.includes('Propofol'), `${name} must document the current Propofol example`)
}

assert(!panel.includes('heartRate +='), 'action buttons must not directly mutate heart rate')
assert(!panel.includes('systolicPressure +='), 'action buttons must not directly mutate blood pressure')

if (!process.exitCode) console.log('Action/effects regression checks passed')
