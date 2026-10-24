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
const actionLibrary = read('src/edumon/actionLibrary.ts')
const editor = read('src/action-editor/ActionEditorApp.tsx')
const physiology = read('src/edumon/actionPhysiology.ts')
const tof = read('src/edumon/EdumonAnaGasControl.tsx')
const migration = read('supabase/migrations/20261024_event_classes_and_respiratory_effects.sql')
const priorityMigration = read('supabase/migrations/20261024_action_priorities_and_constraints.sql')
const guide = read('src/edumon/ACTIONS_AND_EFFECTS_GUIDE.md')
const prompt = read('src/edumon/ACTIONS_AND_EFFECTS_AI_PROMPT.md')

for (const id of ['hypertension','hypotension','tachycardia','bradycardia','hypovolaemia','bleeding','apnoea','diaphragm-return','bronchospasm']) {
  assert(panel.includes(`id: '${id}'`), `${id} fallback event must exist`)
  assert(migration.includes(`'${id}'`), `${id} persistent event must exist`)
}

for (const id of ['hypertension','hypotension','tachycardia','bradycardia']) {
  assert(panel.includes(`id: '${id}', kind: 'event'`), `${id} must remain an Event`)
}

for (const id of ['hypovolaemia','bleeding','bronchospasm']) {
  assert(panel.includes(`id: '${id}', kind: 'event'`), `${id} must remain an Event`)
}
assert(panel.includes("long_press_action: 'severity-levels'"), 'severity-adjustable events must use severity-levels')
assert(panel.includes("short_press_action: 'toggle', long_press_action: 'severity-levels'"), 'severity events must be toggles')
assert(panel.includes("renderClass('Anaesthesia'"), 'Actions UI must render Anaesthesia classes')
assert(panel.includes("renderClass('Cardiovascular'"), 'Actions UI must render Cardiovascular classes')
assert(panel.includes("renderClass('Respiratory'"), 'Events UI must render Respiratory class')
assert(panel.includes("definition.long_press_action === 'severity-levels'"), 'long press must distinguish severity from dose')
assert(panel.includes("low: { label: 'Low', scale: 0.65"), 'Low intensity must remain explicit')
assert(panel.includes("high: { label: 'High', scale: 1.35"), 'High intensity must remain explicit')

assert(panel.includes('getActiveEffects'), 'toggle UI must derive active state from ActionRuntime')
assert(panel.includes("active.mode === 'toggle' && active.stoppedAtSimulationTime == null"), 'toggle UI must recognise only running toggle effects as active')
assert(panel.includes('levelFromIntensity'), 'active adjustable toggle level must derive from runtime intensity')
assert(!panel.includes('toggleStates'), 'toggle UI must not duplicate runtime ON/OFF state in local component state')

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

// Priority/constraint architecture.
assert(targets.includes("'constraint'"), 'constraint must be a validated action operation')
assert(targets.includes("'block-increase'"), 'positive-response blockade must be a validated constraint')
assert(targets.includes("'block-decrease'"), 'negative-response blockade must be a validated constraint')
assert(targets.includes('DEFAULT_EDUSIM_ACTION_PRIORITY = 30'), 'ordinary effect priority must default to 30')
assert(runtime.includes('effectPriority(a.effect) - effectPriority(b.effect)'), 'runtime must resolve lower priority before higher priority')
assert(runtime.includes("a.effect.operation === 'constraint' ? 1 : 0"), 'same-priority constraints must resolve after ordinary modifiers')
assert(runtime.includes("case 'block-increase'"), 'runtime must implement block-increase')
assert(runtime.includes("case 'block-decrease'"), 'runtime must implement block-decrease')
assert(runtime.includes("case 'minimum'"), 'runtime must implement minimum constraint')
assert(runtime.includes("case 'maximum'"), 'runtime must implement maximum constraint')
assert(runtime.includes('supersedeActionTarget'), 'manual target ownership must remain above action resolution')

assert(actionLibrary.includes('priority?: number'), 'action definitions must carry default priority')
assert(actionLibrary.includes("effects,priority,sort_order"), 'action library queries must load persisted priority')
assert(editor.includes('<span>Priority</span>'), 'action editor must expose action priority')
assert(editor.includes('Priority override'), 'action editor must expose per-effect priority override')
assert(editor.includes('EDUSIM_ACTION_EFFECT_CONSTRAINTS'), 'action editor must expose constraint vocabulary')

assert(panel.includes("id: 'beta-blocker', kind: 'event'"), 'Beta blocker fallback event must exist')
assert(panel.includes("operation: 'constraint', constraint: 'block-increase'"), 'Beta blocker must suppress positive chronotropy with a constraint')
assert(panel.includes('priority: 70'), 'Beta blocker must use higher-than-ordinary priority')
assert(priorityMigration.includes('add column if not exists priority integer not null default 30'), 'priority migration must add the default priority column')
assert(priorityMigration.includes("'beta-blocker'"), 'priority migration must seed Beta blocker')
assert(priorityMigration.includes("\"constraint\":\"block-increase\""), 'persistent Beta blocker must use block-increase')

for (const [name, text] of [['guide', guide], ['prompt', prompt]]) {
  for (const phrase of ['Maintenance contract','Actions describe effects; physiology interprets effects.','severity-levels','Bronchospasm','Hypovolaemia','Bleeding','Return of diaphragm breathing','respiration.airwayObstruction','neuromuscular.tofMinimumCount','runtime','Beta blocker','block-increase','priority']) {
    assert(text.includes(phrase), `${name} must document ${phrase}`)
  }
}

assert(!panel.includes('heartRate +='), 'action buttons must not directly mutate HR')
assert(!panel.includes('systolicPressure +='), 'action buttons must not directly mutate BP')

if (!process.exitCode) console.log('Action/effects regression checks passed')
