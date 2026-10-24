import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Action/effects regression: ${message}`)
    process.exitCode = 1
  }
}

const panel = read('src/edumon/EdumonActionsPanel.tsx')
const runtime = read('src/edusim/actions/ActionRuntime.ts')
const actionPhysiology = read('src/edumon/actionPhysiology.ts')
const anaestheticPhysiology = read('src/edumon/anaestheticPhysiology.ts')
const bis = read('src/edumon/EdumonBisTrend.tsx')
const propofolMigration = read('supabase/migrations/20261024_propofol_effects.sql')
const sustainedMigration = read('supabase/migrations/20261024_sustained_infusions_and_surgery.sql')
const instructorGuide = read('src/edumon/ACTIONS_AND_EFFECTS_GUIDE.md')
const aiPrompt = read('src/edumon/ACTIONS_AND_EFFECTS_AI_PROMPT.md')

assert(panel.includes("id: 'propofol'"), 'Propofol fallback definition must exist')
for (const effectId of ['propofol-hypnotic-effect', 'propofol-respiratory-drive', 'propofol-map']) {
  assert(panel.includes(effectId), `${effectId} must exist in fallback definition`)
  assert(propofolMigration.includes(effectId), `${effectId} must exist in persistent seed migration`)
}

for (const id of ['remifentanil', 'tiva', 'surgery']) {
  assert(panel.includes(`id: '${id}'`), `${id} fallback definition must exist`)
  assert(sustainedMigration.includes(`'${id}'`), `${id} must exist in sustained-actions migration`)
}
for (const effectId of ['remifentanil-nociceptive-response', 'remifentanil-respiratory-drive', 'tiva-hypnotic-effect', 'tiva-map', 'surgery-sympathetic-stimulus']) {
  assert(panel.includes(effectId), `${effectId} must exist in fallback definition`)
  assert(sustainedMigration.includes(effectId), `${effectId} must exist in persistent migration`)
}

assert(runtime.includes("mode: 'momentary' | 'toggle'"), 'runtime must distinguish momentary and toggle effects')
assert(runtime.includes('stoppedAtSimulationTime?: number'), 'toggle runtime must retain stop time for recovery')
assert(runtime.includes("if (active.mode === 'toggle')"), 'toggle effects must have dedicated sustained timing semantics')
assert(runtime.includes('return runningToggleWeight(active, atSimulationTime)'), 'running toggle must remain active after onset')
assert(runtime.includes('weightAtStop'), 'toggle switch-off must recover from the effect present at stop time')
assert(!runtime.includes("activeEffects = activeEffects.filter((active) => active.actionId !== definition.id)\n      return []"), 'toggle switch-off must not immediately delete active effects')

assert(anaestheticPhysiology.includes("resolveNumericActionEffect('anaesthesia.hypnoticEffect'"), 'effective depth must consume declarative hypnotic effect')
assert(anaestheticPhysiology.includes('effectiveAnaestheticDepth'), 'effective anaesthetic depth helper must exist')
assert(actionPhysiology.includes('effectiveAnaestheticDepth(state, simulationTime)'), 'stimulus response must use effective action-aware depth')
assert(bis.includes('effectiveAnaestheticDepth(patientRef.current, getActionRuntimeSimulationTime())'), 'BIS must use the same effective action-aware depth')

for (const [name, text] of [['instructor guide', instructorGuide], ['AI prompt', aiPrompt]]) {
  assert(text.includes('Maintenance contract'), `${name} must declare its maintenance contract`)
  assert(text.includes('Actions describe effects; physiology interprets effects.'), `${name} must preserve the core architecture rule`)
  assert(text.includes('simulation time'), `${name} must document simulation-time semantics`)
  assert(text.includes('Remifentanil'), `${name} must document Remifentanil infusion`)
  assert(text.includes('TIVA'), `${name} must document Propofol TCI/TIVA`)
  assert(text.includes('Surgery'), `${name} must document sustained Surgery`)
  assert(text.includes('toggle'), `${name} must document toggle semantics`)
}

assert(!panel.includes('heartRate +='), 'action buttons must not directly mutate heart rate')
assert(!panel.includes('systolicPressure +='), 'action buttons must not directly mutate blood pressure')

if (!process.exitCode) console.log('Action/effects regression checks passed')
