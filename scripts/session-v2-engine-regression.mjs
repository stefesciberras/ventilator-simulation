import assert from 'node:assert/strict'
import { SessionEngineV2 } from '../src/session-v2/engine.mjs'

const adapter = {
  initialState: () => ({ hr: 80, propofolDoses: 0, frames: 0 }),
  apply: (state, cmd) => {
    if (cmd.type === 'drug') return { ...state, propofolDoses: state.propofolDoses + 1, hr: state.hr - 10 }
    if (cmd.type === 'set-hr') return { ...state, hr: cmd.payload.hr }
    if (cmd.type === 'tick') return { ...state, frames: state.frames + 1 }
    throw new Error('Unknown simulator action')
  },
  reset: () => ({ hr: 80, propofolDoses: 0, frames: 0 }),
}
const engine = new SessionEngineV2({ sessionId: 's1', mode: 'simulation', instructorId: 'i', adapter })
engine.join({ participantId: 'c', role: 'candidate' })
engine.start('i')
let epoch = engine.snapshot.session.epoch
assert.equal(engine.submit({ id: 'd1', participantId: 'c', epoch, runtimeId: 'main', type: 'drug' }).accepted, true)
assert.equal(engine.snapshot.runtimes[0].state.propofolDoses, 1)
assert.equal(engine.submit({ id: 'd1', participantId: 'c', epoch, runtimeId: 'main', type: 'drug' }).revision, 2)
assert.equal(engine.snapshot.runtimes[0].state.propofolDoses, 1, 'duplicate must not apply twice')
engine.disconnect('i')
assert.equal(engine.snapshot.session.status, 'recovering')
assert.equal(engine.submit({ id: 'd2', participantId: 'c', epoch, runtimeId: 'main', type: 'drug' }).accepted, false)
engine.recover('i')
assert.equal(engine.snapshot.session.status, 'active')
assert.equal(engine.submit({ id: 'old', participantId: 'c', epoch, runtimeId: 'main', type: 'drug' }).reason, 'stale-epoch')
epoch = engine.snapshot.session.epoch
assert.equal(engine.submit({ id: 'd2', participantId: 'c', epoch, runtimeId: 'main', type: 'drug' }).accepted, true)
assert.equal(engine.snapshot.runtimes[0].state.propofolDoses, 2)
assert.equal(engine.submit({ id: 'r1', participantId: 'c', epoch, runtimeId: 'main', type: 'reset' }).reason, 'forbidden')
assert.equal(engine.submit({ id: 'r2', participantId: 'i', epoch, runtimeId: 'main', type: 'reset' }).accepted, true)
assert.deepEqual(engine.snapshot.runtimes[0].state, adapter.initialState())
assert.equal(engine.submit({ id: 'e1', participantId: 'i', epoch, type: 'end' }).accepted, true)
assert.equal(engine.submit({ id: 'd3', participantId: 'c', epoch, runtimeId: 'main', type: 'drug' }).reason, 'session-not-active')
const teaching = new SessionEngineV2({ sessionId: 's2', mode: 'teaching', instructorId: 'i', adapter })
teaching.join({ participantId: 'a', role: 'candidate' })
teaching.join({ participantId: 'b', role: 'candidate' })
teaching.start('i')
assert.equal(teaching.submit({ id: 'd1', participantId: 'a', epoch: 1, runtimeId: 'b', type: 'drug' }).reason, 'forbidden-runtime')
assert.equal(teaching.submit({ id: 'd2', participantId: 'a', epoch: 1, runtimeId: 'a', type: 'drug' }).accepted, true)
assert.equal(teaching.snapshot.runtimes.find(r => r.id === 'b').state.propofolDoses, 0)
assert.equal(teaching.snapshot.runtimes.find(r => r.id === 'a').state.propofolDoses, 1)
console.log('Session Engine v2 reducer and recovery tests passed')
