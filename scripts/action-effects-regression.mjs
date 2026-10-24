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
const cardiovascularMigration = read('supabase/migrations/20261024_cardiovascular_drugs_and_dose_menu.sql')
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

for (const id of ['atropine', 'ephedrine', 'phenylephrine', 'noradrenaline']) {
  assert(panel.includes(`id: '${id}'`), `${id} cardiovascular fallback definition must exist`)
  assert(cardiovascularMigration.includes(`'${id}'`), `${id} must exist in cardiovascular migration`)
}

for (const effectId of ['atropine-heart-rate', 'ephedrine-map', 'phenylephrine-map', 'phenylephrine-heart-rate', 'noradrenaline-map']) {
  assert(panel.includes(effectId), `${effectId} must exist in fallback definition`)
  assert(cardiovascularMigration.includes(effectId), `${effectId} must exist in persistent migration`)
}

assert(panel.includes("long_press_action: 'dose-levels'"), 'adjustable infusions must declare the generic dose-levels long press')
assert(panel.includes("renderDrugClass('Anaesthesia'"), 'Drugs UI must expose an Anaesthesia subclass')
assert(panel.includes("renderDrugClass('Cardiovascular'"), 'Drugs UI must expose a Cardiovascular subclass')
assert(panel.includes('low: { label: \'Low\', scale: 0.65'), 'Low infusion intensity must remain explicit')
assert(panel.includes('medium: { label: \'Medium\', scale: 1'), 'Medium infusion intensity must remain the base definition')
assert(panel.includes('high: { label: \'High\', scale: 1.35'), 'High infusion intensity must remain explicit')

assert(runtime.includes("mode: 'momentary' | 'toggle'"), 'runtime must distinguish momentary and toggle effects')
assert(runtime.includes('stoppedAtSimulationTime?: number'), 'toggle runtime must retain stop time for recovery')
assert(runtime.includes('intensity: number'), 'ActiveEffect must persist adjustable intensity')
assert(runtime.includes('export function setActionIntensity'), 'runtime must support changing an active infusion intensity')
assert(runtime.includes('effect.value * weight * intensity'), 'offset effects must scale with infusion intensity')
assert(runtime.includes("1 + (effect.value - 1) * weight * intensity"), 'multiplier intensity must scale around neutral 1.0')
assert(runtime.includes('clamp01(weight * intensity)'), 'target/set intensity must scale interpolation safely')
assert(!runtime.includes("effect.value * intensity) * weight"), 'multiplier effects must not be naively multiplied by dose intensity')

assert(anaestheticPhysiology.includes("resolveNumericActionEffect('anaesthesia.hypnoticEffect'"), 'effective depth must consume declarative hypnotic effect')
assert(anaestheticPhysiology.includes('effectiveAnaestheticDepth'), 'effective anaesthetic depth helper must exist')
assert(actionPhysiology.includes('effectiveAnaestheticDepth(state, simulationTime)'), 'stimulus response must use effective action-aware depth')
assert(bis.includes('effectiveAnaestheticDepth(patientRef.current, getActionRuntimeSimulationTime())'), 'BIS must use the same effective action-aware depth')

for (const [name, text] of [['instructor guide', instructorGuide], ['AI prompt', aiPrompt]]) {
  assert(text.includes('Maintenance contract'), `${name} must declare its maintenance contract`)
  assert(text.includes('Actions describe effects; physiology interprets effects.'), `${name} must preserve the core architecture rule`)
  assert(text.includes('Anaesthesia'), `${name} must document the Anaesthesia drug class`)
  assert(text.includes('Cardiovascular'), `${name} must document the Cardiovascular drug class`)
  assert(text.includes('dose-levels'), `${name} must document generic infusion long-press dose selection`)
  assert(text.includes('0.65'), `${name} must document Low infusion intensity`)
  assert(text.includes('1.35'), `${name} must document High infusion intensity`)
  assert(text.includes('Noradrenaline'), `${name} must document noradrenaline infusion`)
}

assert(!panel.includes('heartRate +='), 'action buttons must not directly mutate heart rate')
assert(!panel.includes('systolicPressure +='), 'action buttons must not directly mutate blood pressure')

if (!process.exitCode) console.log('Action/effects regression checks passed')
