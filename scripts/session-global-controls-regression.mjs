import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Global session controls regression: ${message}`)
    process.exitCode = 1
  }
}

const runtimeModes = read('src/core/runtimeModes.ts')
const sessionControls = read('src/teaching/session/sessionControls.ts')
const displaySync = read('src/teaching/useTeachingDisplaySync.ts')
const alarmSync = read('src/teaching/session/useTeachingAlarmSync.ts')
const migration = read('supabase/migrations/20261102_global_session_controls.sql')

assert(runtimeModes.includes('waveformsFrozen: boolean'), 'Core SessionControlState must own waveform freeze')
assert(runtimeModes.includes('alarmsSilenced: boolean'), 'Core SessionControlState must own global alarm silence')
assert(migration.includes('waveforms_frozen boolean not null default false'), 'waveform freeze must be durable session state')
assert(migration.includes('global_alarms_silenced boolean not null default false'), 'global alarm silence must be durable session state')
assert(migration.includes('waveforms_freeze_revision bigint not null default 0'), 'waveform freeze must have a monotonic revision')
assert(migration.includes('global_alarm_silence_revision bigint not null default 0'), 'alarm silence must have a monotonic revision')
assert(migration.includes('Only the instructor may change global session controls'), 'database RPC must enforce instructor-only mutation')
assert(migration.includes('greatest(s.expires_at'), 'global control mutation must preserve the sliding recovery window')

assert(sessionControls.includes('simulation_paused'), 'shared snapshot must reuse existing durable pause state')
assert(sessionControls.includes('waveforms_frozen'), 'shared snapshot must map durable waveform freeze')
assert(sessionControls.includes('global_alarms_silenced'), 'shared snapshot must map durable global alarm silence')
assert(sessionControls.includes('set_edusim_session_controls'), 'global mutations must use the guarded session-control RPC')

assert(displaySync.includes('fetchSessionControlSnapshot(sessionId)'), 'display sync must hydrate durable controls after reconnect')
assert(displaySync.includes('subscribeSessionControlSnapshot(sessionId'), 'display sync must receive durable control updates')
assert(displaySync.includes('waveformsFrozen: frozen'), 'instructor waveform freeze must persist')
assert(displaySync.includes('not an instruction to clear durable'), 'instructor cleanup must not clear durable waveform freeze')
assert(displaySync.includes('laserEnabled: false'), 'ephemeral laser must be withdrawn when instructor presentation ends')

assert(alarmSync.includes('fetchSessionControlSnapshot(sessionId)'), 'alarm sync must hydrate durable controls after reconnect')
assert(alarmSync.includes('alarmsSilenced: enabled'), 'instructor alarm override must persist as global session state')
assert(alarmSync.includes('Do not clear instructorOverride here'), 'refresh/disconnect must not clear durable alarm override')
assert(alarmSync.includes('silenceUntil'), 'timed silence must remain a distinct timed state')

if (!process.exitCode) console.log('Global session control regression checks passed')
