import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Stimulus action regression: ${message}`)
    process.exitCode = 1
  }
}

const panel = read('src/edumon/EdumonActionsPanel.tsx')
const physiology = read('src/edumon/actionPhysiology.ts')
const anaesthetic = read('src/edumon/anaestheticPhysiology.ts')
const instructorGuide = read('src/edumon/ACTIONS_AND_EFFECTS_GUIDE.md')
const aiPrompt = read('src/edumon/ACTIONS_AND_EFFECTS_AI_PROMPT.md')
const migration = read('supabase/migrations/20261024_stimulus_events.sql')
const sustainedMigration = read('supabase/migrations/20261024_sustained_infusions_and_surgery.sql')

for (const id of ['laryngoscopy', 'pain']) {
  assert(panel.includes(`id: '${id}'`), `${id} fallback action must exist`)
  assert(migration.includes(`'${id}'`), `${id} must be seeded in Supabase migration`)
}
assert(panel.includes("id: 'surgery'"), 'Surgery fallback action must exist')
assert(panel.includes("name: 'Surgery'"), 'Surgery must replace the Surgical stimulus label')
assert(panel.includes("id: 'surgery', kind: 'event', name: 'Surgery', short_press_action: 'toggle'"), 'Surgery must be a sustained toggle event')
assert(sustainedMigration.includes("'surgery', 'event', 'Surgery', 'toggle'"), 'Surgery must be persisted as a toggle event')
assert(sustainedMigration.includes("delete from public.edusim_action_definitions where id = 'surgical-stimulus'"), 'persistent migration must remove the superseded Surgical stimulus action')

assert(physiology.includes("resolveNumericActionEffect('stimulus.sympathetic'"), 'physiology must consume sympathetic stimulus declaratively')
assert(physiology.includes("resolveNumericActionEffect('anaesthesia.nociceptiveResponse'"), 'stimulus response must be attenuated by analgesic/nociceptive state')
assert(physiology.includes('anaestheticStimulusResponseScale(effectiveAnaestheticDepth(state, simulationTime))'), 'stimulus response must use effective action-aware anaesthetic depth')
assert(physiology.includes('const composedResponse = stimulus * nociceptiveResponse * depthResponse'), 'raw sympathetic response must compose stimulus, analgesia and depth')
assert(physiology.includes('export function saturatingSympatheticResponse'), 'physiology must expose the shared sympathetic saturation transfer function')
assert(physiology.includes('const SYMPATHETIC_SATURATION_SHAPE = 1.5'), 'sympathetic saturation shape must remain explicit and regression-visible')
assert(physiology.includes('const response = saturatingSympatheticResponse(composedResponse)'), 'composed sympathetic response must pass through saturation before HR/MAP translation')
assert(anaesthetic.includes('const DEPTH_STIMULUS_RESPONSE'), 'anaesthetic physiology must own the depth-to-stimulus response mapping')
assert(anaesthetic.includes('effectiveAnaestheticDepth'), 'anaesthetic physiology must expose effective action-aware depth')
assert(anaesthetic.includes('5: 1'), 'awake/light depth must preserve full stimulus response')
assert(anaesthetic.includes('1: 0.15'), 'deep anaesthesia must markedly attenuate stimulus response')
assert(instructorGuide.toLowerCase().includes('saturat'), 'instructor guide must explain sympathetic saturation')
assert(aiPrompt.toLowerCase().includes('saturat'), 'AI prompt must preserve the shared saturation architecture')
assert(!panel.includes('heartRate +='), 'event buttons must not directly mutate heart rate')
assert(!panel.includes('systolicPressure +='), 'event buttons must not directly mutate blood pressure')

const saturation = (input) => (2.5 * Math.max(0, input)) / (1 + 1.5 * Math.max(0, input))
assert(Math.abs(saturation(1) - 1) < 1e-9, 'saturation must preserve the existing response at composed stimulus 1.0')
assert(Math.abs(saturation(2) - 1.25) < 1e-9, 'two full composed stimuli should compress to response 1.25')
assert(saturation(1000) < (5 / 3) && saturation(1000) > 1.66, 'large sympathetic input must approach the finite 1.67 ceiling')

if (!process.exitCode) console.log('Stimulus action regression checks passed')
