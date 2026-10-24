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
const migration = read('supabase/migrations/20261024_stimulus_events.sql')

for (const id of ['laryngoscopy', 'pain', 'surgical-stimulus']) {
  assert(panel.includes(`id: '${id}'`), `${id} fallback action must exist`)
  assert(migration.includes(`'${id}'`), `${id} must be seeded in Supabase migration`)
}

assert(physiology.includes("resolveNumericActionEffect('stimulus.sympathetic'"), 'physiology must consume sympathetic stimulus declaratively')
assert(physiology.includes("resolveNumericActionEffect('anaesthesia.nociceptiveResponse'"), 'stimulus response must be attenuated by analgesic/nociceptive state')
assert(physiology.includes('anaestheticStimulusResponseScale(depth)'), 'stimulus response must be attenuated by anaesthetic depth')
assert(physiology.includes('const response = stimulus * nociceptiveResponse * depthResponse'), 'sympathetic response must compose stimulus, analgesia and depth')
assert(anaesthetic.includes('const DEPTH_STIMULUS_RESPONSE'), 'anaesthetic physiology must own the depth-to-stimulus response mapping')
assert(anaesthetic.includes('5: 1'), 'awake/light depth must preserve full stimulus response')
assert(anaesthetic.includes('1: 0.15'), 'deep anaesthesia must markedly attenuate stimulus response')
assert(!panel.includes('heartRate +='), 'event buttons must not directly mutate heart rate')
assert(!panel.includes('systolicPressure +='), 'event buttons must not directly mutate blood pressure')

if (!process.exitCode) console.log('Stimulus action regression checks passed')
