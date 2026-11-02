import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Local presentation transport regression: ${message}`)
    process.exitCode = 1
  }
}

const transport = read('src/session/localRuntimeTransport.ts')
const relay = read('server/local-session-server.mjs')
const bus = read('src/teaching/teachingRealtimeBus.ts')
const laser = read('src/teaching/TeachingLaserPointer.tsx')

assert(transport.includes("type: 'presentation'"), 'local runtime vocabulary must include a distinct presentation payload')
assert(transport.includes('publishLocalPresentationBroadcast'), 'instructor presentation state must have a local publisher')
assert(transport.includes('presentations?: LocalPresentationBroadcast[]'), 'welcome handshake must accept cached presentations')
assert(transport.includes("notifyPayload(this.options.sessionId, { type: 'presentation', presentation })"), 'cached presentations must replay through the local payload stream')

assert(relay.includes('presentations: {}'), 'relay room must cache presentation state only in memory')
assert(relay.includes("payload?.type === 'presentation'"), 'relay must cache latest presentation by event')
assert(relay.includes('presentations: Object.values(room.presentations)'), 'welcome handshake must replay cached presentation state')
assert(relay.includes("['snapshot', 'scenario-event', 'session-control', 'presentation', 'command']"), 'relay must accept instructor presentation payloads')
assert(relay.includes("socket.eduventRole === 'candidate' && payload.type !== 'command'"), 'candidate must not publish presentation authority')

assert(bus.includes('LOCAL_PRESENTATION_EVENTS'), 'teaching bus must explicitly classify ephemeral local presentation events')
assert(bus.includes("'teaching-laser-pointer'"), 'laser pointer must use the local presentation fast path')
assert(bus.includes("'teaching-laser-waveform-snapshot'"), 'shared frozen waveform snapshot must use the local presentation fast path')
assert(bus.includes("'teaching-session-clock'"), 'shared session clock must use the local presentation fast path')
assert(bus.includes('publishLocalPresentationBroadcast(sessionId, event, payload)'), 'presentation send must mirror to LAN first')
assert(bus.includes('subscribeLocalRuntimePayload(sessionId'), 'presentation subscriptions must consume LAN events')
assert(bus.includes("message.type !== 'presentation'"), 'teaching bus must keep presentation payloads distinct from patient/session-control state')
assert(bus.includes("bus.channel.send({ type: 'broadcast', event, payload })"), 'Supabase Realtime must remain the presentation fallback')

assert(laser.includes("const POINTER_EVENT = 'teaching-laser-pointer'"), 'laser pointer event contract must remain unchanged')
assert(laser.includes("const SNAPSHOT_EVENT = 'teaching-laser-waveform-snapshot'"), 'waveform snapshot event contract must remain unchanged')
assert(laser.includes("const CLOCK_EVENT = 'teaching-session-clock'"), 'clock event contract must remain unchanged')
assert(!transport.includes('SessionControlState & LocalPresentationBroadcast'), 'presentation state must not be folded into durable SessionControlState')

if (!process.exitCode) console.log('Local presentation transport regression checks passed')
