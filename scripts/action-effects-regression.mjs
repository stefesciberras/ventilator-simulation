import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Action/effects regression: ${message}`)
    process.exitCode = 1
  }
}

const panel = read('src/edumon/EdumonActionsPanel.tsx')
const targets = read('src/edusim/actions/ActionEffect.ts')
const runtime = read('src/edusim/actions/ActionRuntime.ts')
const physiology = read('src/edumon/actionPhysiology.ts')
const tof = read('src/edumon/EdumonAnaGasControl.tsx')
const migration = read('supabase/migrations/20261024_event_classes_and_respiratory_effects.sql')
const guide = read('src/edumon/ACTIONS_AND_EFFECTS_GUIDE.md')
const prompt = read('src/edumon/ACTIONS_AND_EFFECTS_AI_PROMPT.md')

for (const id of ['hypertension','hypotension','tachycardia','bradycardia','hypovolaemia','bleeding','apnoea','diaphragm-return','bronchospasm']) {
  assert(panel.includes(`id: '${id}'`), `${id} fallback event must exist`)
  assert(migration.includes(`'${id}'`), `${id} persistent event must exist`)
}

for (const id of ['hypertension','hypotension','tachycardia','bradycardia']) {
  assert(panel.includes(`id: '${id}', kind: 'event'`) && panel.includes(`id: '${id}', kind: 'event'`), `${id} must remain an Event`)
}

for (const id of ['hypovolaemia','bleeding','bronchospasm']) {
  assert(panel.includes(`id: '${id}', kind: 'event'`) && panel.includes(`id: '${id}', kind: 'event'`), `${id} must remain an Event`)
}
assert(panel.includes("long_press_action: 'severity-levels'"), 'severity-adjustable events must use severity-levels')
assert(panel.includes("short_press_action: 'toggle', long_press_action: 'severity-levels'"), 'severity events must be toggles')
assert(panel.includes("renderClass('Anaesthesia'"), 'Actions UI must render Anaesthesia classes')
assert(panel.includes("renderClass('Cardiovascular'"), 'Actions UI must render Cardiovascular classes')
assert(panel.includes("renderClass('Respiratory'"), 'Events UI must render Respiratory class')
assert(panel.includes("definition.long_press_action === 'severity-levels'"), 'long press must distinguish severity from dose')
assert(panel.includes("low: { label: 'Low', scale: 0.65"), 'Low intensity must remain explicit')
assert(panel.includes("high: { label: 'High', scale: 1.35"), 'High intensity must remain explicit')

for (const target of ['respiration.airwayObstruction','neuromuscular.tofMinimumCount']) {
  assert(targets.includes(`'${target}'`), `${target} must be a validated action target`)
}
assert(physiology.includes("resolveNumericActionEffect('respiration.airwayObstruction'"), 'bronchospasm must be interpreted by physiology')
assert(physiology.includes('expiratoryResistanceCmH2OLs'), 'bronchospasm must alter expiratory resistance')
assert(physiology.includes("resolveNumericActionEffect('neuromuscular.tofMinimumCount'"), 'TOF minimum-count target must be interpreted')
assert(tof.includes('currentNeuromuscularBlock'), 'TOF must derive from neuromuscular block')
assert(tof.includes('currentTofMinimumCount'), 'TOF must respect diaphragm-return minimum count')
assert(tof.includes('tofFromBlock'), 'TOF must no longer be fixed at 4/1.0')
assert(!tof.includes("setTofReading({ count: 4, ratio: 1.0"), 'fixed TOF placeholder must be removed')

assert(runtime.includes('intensity: number'), 'runtime must retain adjustable intensity')
assert(runtime.includes('export function setActionIntensity'), 'running severity/dose must be adjustable')
assert(runtime.includes("1 + (effect.value - 1) * weight * intensity"), 'multiplier intensity must remain neutral around 1.0')

for (const [name, text] of [['guide', guide], ['prompt', prompt]]) {
  for (const phrase of ['Maintenance contract','Actions describe effects; physiology interprets effects.','severity-levels','Bronchospasm','Hypovolaemia','Bleeding','Return of diaphragm breathing','respiration.airwayObstruction','neuromuscular.tofMinimumCount']) {
    assert(text.includes(phrase), `${name} must document ${phrase}`)
  }
}

assert(!panel.includes('heartRate +='), 'action buttons must not directly mutate HR')
assert(!panel.includes('systolicPressure +='), 'action buttons must not directly mutate BP')

if (!process.exitCode) console.log('Action/effects regression checks passed')
