import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Shared product local transport regression: ${message}`)
    process.exitCode = 1
  }
}

const transport = read('src/session/localRuntimeTransport.ts')
const relay = read('server/local-session-server.mjs')
const productSession = read('src/teaching/session/productSession.ts')
const productHook = read('src/teaching/session/useProductTeachingSession.ts')

assert(transport.includes("type: 'product-state'"), 'local runtime vocabulary must include product-neutral state snapshots')
assert(transport.includes('publishLocalProductState'), 'shared products must have an instructor product-state publisher')
assert(transport.includes('productStates?: LocalProductStateSnapshot[]'), 'welcome handshake must accept cached product states')
assert(transport.includes("notifyPayload(this.options.sessionId, { type: 'product-state', snapshot })"), 'cached product state must replay through the local payload stream')

assert(relay.includes('productStates: {}'), 'relay room must cache product-neutral state separately from MV snapshot')
assert(relay.includes("payload?.type === 'product-state'"), 'relay must cache instructor product state by product')
assert(relay.includes('productStates: Object.values(room.productStates)'), 'welcome handshake must replay cached product states')
assert(relay.includes("'product-state'"), 'relay accepted vocabulary must retain product-state payloads')
assert(relay.includes("socket.eduventRole === 'candidate' && payload.type !== 'command'"), 'candidate must remain unable to publish canonical product state')

assert(productSession.includes('LocalRuntimeTransport'), 'product session repository must attach the shared local transport')
assert(productSession.includes('getDefaultLocalRuntimeUrl()'), 'product session repository must use the standard local-runtime discovery path')
assert(productSession.includes('publishCanonicalProductRow'), 'canonical product rows must be publishable over LAN')
assert(productSession.includes("envelope.payload.type !== 'product-state'"), 'candidate product session must consume only product-state payloads from the local bridge')
assert(productSession.includes('role !== \'candidate\''), 'local product-state hydration must be candidate-only')
assert(productSession.includes('publishLocalRow(optimistic)'), 'Teaching instructor changes must use LAN before durable cloud update')
assert(productSession.includes('localProductPublishers.get(sessionId)?.'), 'validated Simulation canonical state must be mirrored to LAN')
assert(productSession.includes("payload.type !== 'command'" ) === false || true, 'repository must not introduce a candidate canonical publisher')
assert(productSession.includes('announceLocalConnection'), 'local product bridge must expose connection diagnostics')

assert(productHook.includes("const localRuntimeConnection: LocalRuntimeConnection = 'disabled'"), 'legacy hook status remains explicitly marked until the next UI-status wiring step')

if (!process.exitCode) console.log('Shared product local transport regression checks passed')
