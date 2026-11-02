import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Local session controls regression: ${message}`)
    process.exitCode = 1
  }
}

const transport = read('src/session/localRuntimeTransport.ts')
const relay = read('server/local-session-server.mjs')
const displaySync = read('src/teaching/useTeachingDisplaySync.ts')
const alarmSync = read('src/teaching/session/useTeachingAlarmSync.ts')

assert(transport.includes("type: 'session-control'"), 'local runtime payload vocabulary must include session-control')
assert(transport.includes('publishLocalSessionControlPatch'), 'instructor must be able to publish a Core session-control patch locally')
assert(transport.includes('sessionControls?: Partial<SessionControlState>'), 'local welcome must accept cached session controls')
assert(transport.includes('notifyPayload(this.options.sessionId, {'), 'cached welcome controls must reach local payload subscribers')
assert(transport.includes("type: 'session-control',\n              update: { patch: typed.sessionControls"), 'welcome recovery must synthesize a session-control payload')

assert(relay.includes("sessionControls: {}"), 'local relay room must cache session controls independently of patient snapshot')
assert(relay.includes("payload?.type === 'session-control'"), 'relay must merge instructor session-control patches')
assert(relay.includes('sessionControls: room.sessionControls'), 'welcome handshake must include cached session controls')
assert(relay.includes("['snapshot', 'scenario-event', 'session-control', 'command']"), 'relay must accept instructor session-control payloads')
assert(relay.includes("socket.eduventRole === 'candidate' && payload.type !== 'command'"), 'candidate must remain unable to publish session controls')

assert(displaySync.includes('subscribeLocalRuntimePayload(sessionId'), 'waveform freeze must consume the local runtime fast path')
assert(displaySync.includes("publishLocalSessionControlPatch(sessionId, { waveformsFrozen: frozen })"), 'instructor waveform freeze must publish locally')
assert(displaySync.includes("publishLocalSessionControlPatch(sessionId, { waveformsFrozen: nextControls.waveformsFrozen })"), 'durable waveform state must seed the local relay after instructor recovery')
assert(displaySync.includes('setInstructorGlobalSessionControls(sessionId'), 'waveform freeze must retain cloud durability')

assert(alarmSync.includes('subscribeLocalRuntimePayload(sessionId'), 'global alarm silence must consume the local runtime fast path')
assert(alarmSync.includes("publishLocalSessionControlPatch(sessionId, { alarmsSilenced: enabled })"), 'instructor alarm override must publish locally')
assert(alarmSync.includes("publishLocalSessionControlPatch(sessionId, { alarmsSilenced: enabled })"), 'durable alarm state must seed/update the local relay')
assert(alarmSync.includes('setInstructorGlobalSessionControls(sessionId'), 'global alarm silence must retain cloud durability')

if (!process.exitCode) console.log('Local session control transport regression checks passed')
