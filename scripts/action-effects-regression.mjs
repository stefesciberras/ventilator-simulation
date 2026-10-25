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
const bounds = read('src/edumon/physiologicalBounds.ts')
const tof = read('src/edumon/EdumonAnaGasControl.tsx')
const migration = read('supabase/migrations/20261024_event_classes_and_respiratory_effects.sql')
const priorityMigration = read('supabase/migrations/20261024_action_priorities_and_constraints.sql')
const betaBlockerMigration = read('supabase/migrations/20261024_beta_blocker_hr_floor.sql')
const guide = read('src/edumon/ACTIONS_AND_EFFECTS_GUIDE.md')
const prompt = read('src/edumon/ACTIONS_AND_EFFECTS_AI_PROMPT.md')

for (const id of ['hypertension','hypotension','tachycardia','bradycardia','hypovolaemia','bleeding','apnoea','diaphragm-return','bronchospasm']) {
  assert(panel.includes(`id: '${id}'`), `${id} fallback event must exist`)
  assert(migration.includes(`'${id}'`), `${id} persistent event must exist`)
}

for (const id of ['hypertension','hypotension','tachycardia','bradycardia','hypovolaemia','bleeding','bronchospasm']) {
  assert(panel.includes(`id: '${id}', kind: 'event'`), `${id} must remain an Event`)
}

assert(panel.includes("long_press_action: 'severity-levels'"), 'severity-adjustable events must use severity-levels')
assert(panel.includes("renderClass('Anaesthesia'"), 'Actions UI must render Anaesthesia classes')
assert(panel.includes("renderClass('Cardiovascular'"), 'Actions UI must render Cardiovascular classes')
assert(panel.includes("renderClass('Respiratory'"), 'Events UI must render Respiratory class')
assert(panel.includes('getActiveEffects'), 'toggle UI must derive active state from ActionRuntime')
assert(!panel.includes('toggleStates'), 'toggle UI must not duplicate runtime ON/OFF state')

for (const target of ['respiration.airwayObstruction','neuromuscular.tofMinimumCount']) {
  assert(targets.includes(`'${target}'`), `${target} must be a validated action target`)
}
assert(physiology.includes("resolveNumericActionEffect('respiration.airwayObstruction'"), 'bronchospasm must be interpreted by physiology')
assert(physiology.includes("resolveNumericActionEffect('neuromuscular.tofMinimumCount'"), 'TOF minimum-count target must be interpreted')
assert(tof.includes('currentNeuromuscularBlock'), 'TOF must derive from neuromuscular block')
assert(tof.includes('currentTofMinimumCount'), 'TOF must respect diaphragm-return minimum count')

assert(runtime.includes('intensity: number'), 'runtime must retain adjustable intensity')
assert(runtime.includes('export function setActionIntensity'), 'running severity/dose must be adjustable')
assert(targets.includes("'constraint'"), 'constraint must be a validated action operation')
assert(targets.includes('DEFAULT_EDUSIM_ACTION_PRIORITY = 30'), 'ordinary effect priority must default to 30')
assert(runtime.includes('effectPriority(a.effect) - effectPriority(b.effect)'), 'runtime must resolve lower priority before higher priority')
assert(runtime.includes("case 'block-increase'"), 'runtime must implement block-increase')
assert(runtime.includes("case 'minimum'"), 'runtime must implement minimum constraint')
assert(runtime.includes('supersedeActionTarget'), 'manual target ownership must remain above action resolution')

assert(actionLibrary.includes('priority?: number'), 'action definitions must carry default priority')
assert(editor.includes('<span>Priority</span>'), 'action editor must expose action priority')
assert(editor.includes('<option value="ana">Anaesthesia</option>'), 'action editor must label ana setting as Anaesthesia')

assert(panel.includes("id: 'beta-blocker', kind: 'drug'"), 'Beta blocker fallback must remain a Drug')
assert(panel.includes("id: 'beta-blocker-heart-rate-offset'"), 'Beta blocker must have a direct HR offset')
assert(panel.includes("operation: 'offset', value: -15"), 'Beta blocker HR offset must be -15 bpm')
assert(panel.includes("operation: 'constraint', constraint: 'block-increase'"), 'Beta blocker must suppress positive chronotropy')
assert(panel.includes("constraint: 'minimum', value: 50"), 'Beta blocker HR floor must be 50 bpm')
assert(panel.includes('priority: 70'), 'Beta blocker must use priority 70')
assert(priorityMigration.includes('add column if not exists priority integer not null default 30'), 'priority migration must add default priority')
assert(betaBlockerMigration.includes('"value":-15'), 'Beta blocker migration must persist -15 bpm')
assert(betaBlockerMigration.includes('"constraint":"minimum"'), 'Beta blocker migration must persist minimum constraint')
assert(betaBlockerMigration.includes('"value":50'), 'Beta blocker migration must persist 50 bpm floor')

// Absolute physiological hard-bound architecture.
assert(bounds.includes('EDUMON_PHYSIOLOGICAL_BOUNDS'), 'hard bounds must be centralized')
assert(bounds.includes('heartRate: { min: 0, max: 240 }'), 'global HR hard bound must be 0-240')
assert(bounds.includes('systolicPressure: { min: 20, max: 300 }'), 'global SBP hard bound must be 20-300')
assert(bounds.includes('diastolicPressure: { min: 10, max: 200 }'), 'global DBP hard bound must be 10-200')
assert(bounds.includes('respiratoryRate: { min: 0, max: 80 }'), 'global RR hard bound must be 0-80')
assert(bounds.includes('tidalVolumeMl: { min: 0, max: 3000 }'), 'global tidal-volume hard bound must be 0-3000')
assert(bounds.includes('export function applyEdumonPhysiologicalBounds'), 'hard-bound applicator must be exported')
assert(bounds.includes('deadSpaceMl: clamp(settings.deadSpaceMl, 0, Math.max(0, tidalVolumeMl))'), 'dead space must not exceed bounded tidal volume')
assert(physiology.includes('applyEdumonPhysiologicalBounds({'), 'action physiology must finish through hard bounds')
assert(!physiology.includes('heartRate: clamp(actionHeartRate + sympathetic.heartRateOffset, 0, 300)'), 'legacy scattered HR 300 clamp must be removed')

for (const [name, text] of [['guide', guide], ['prompt', prompt]]) {
  for (const phrase of ['Maintenance contract','Actions describe effects; physiology interprets effects.','Bronchospasm','Hypovolaemia','Bleeding','Return of diaphragm breathing','Beta blocker','block-increase','minimum','50 bpm','priority','physiological hard bounds','HR 500']) {
    assert(text.includes(phrase), `${name} must document ${phrase}`)
  }
}

assert(!panel.includes('heartRate +='), 'action buttons must not directly mutate HR')
assert(!panel.includes('systolicPressure +='), 'action buttons must not directly mutate BP')

if (!process.exitCode) console.log('Action/effects regression checks passed')
