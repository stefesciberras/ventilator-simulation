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
const migration = read('supabase/migrations/20261024_stimulus_events.sql')

for (const id of ['laryngoscopy', 'pain', 'surgical-stimulus']) {
  assert(panel.includes(`id: '${id}'`), `${id} fallback action must exist`)
  assert(migration.includes(`'${id}'`), `${id} must be seeded in Supabase migration`)
}

assert(physiology.includes("resolveNumericActionEffect('stimulus.sympathetic'"), 'physiology must consume sympathetic stimulus declaratively')
assert(physiology.includes("resolveNumericActionEffect('anaesthesia.nociceptiveResponse'"), 'stimulus response must be attenuated by analgesic/nociceptive state')
assert(physiology.includes('const response = stimulus * nociceptiveResponse'), 'sympathetic response must compose stimulus and nociceptive response')
assert(!panel.includes('heartRate +='), 'event buttons must not directly mutate heart rate')
assert(!panel.includes('systolicPressure +='), 'event buttons must not directly mutate blood pressure')

if (!process.exitCode) console.log('Stimulus action regression checks passed')
