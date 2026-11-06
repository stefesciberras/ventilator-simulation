import assert from 'node:assert/strict'
import { indexedDB } from 'fake-indexeddb'
import { createIndexedDbAuthorityStore } from '../src/session-v2/authorityStore.mjs'
import { createLocalSessionHost } from '../src/session-v2/localSessionHost.mjs'
const store = createIndexedDbAuthorityStore({ indexedDB, databaseName: 'local-test' })
let time = 100000
const now = () => time
const make = () => createLocalSessionHost({ sessionId: 'local-test', store, now })
const host = await make()
const command = (id, type, payload, epoch = host.current.snapshot.session.epoch) => ({ id, type, payload, epoch })
assert.equal((await host.submit(command('hr', 'patient.parameter.set', { path: 'heartRate', value: 40, transitionSeconds: 10 }))).accepted, true)
await host.submit(command('drug', 'action.invoke', { actionId: 'propofol' }))
await assert.rejects(make(), /lease-held/)
await host.controlClock({ running: true, speed: 1 })
for (let i=0;i<8;i++) { time+=1000; await host.pulse() }
const before = host.current.snapshot.runtimes[0].state
assert.ok(before.monitorProjection.heartRate < 50)
assert.equal(before.alarmRuntime.evaluations.find(e=>e.key==='heartRateLow').active,true)
await host.submit(command('silence','alarm.silence.set',{durationSeconds:60}))
const saved = host.current.snapshot.runtimes[0].state
host.close(); time+=16000
const restored = await make()
assert.equal(restored.current.clock.running,false)
assert.deepEqual(restored.current.snapshot.runtimes[0].state,saved)
const epoch = restored.current.snapshot.session.epoch
await restored.submit(command('drug','action.invoke',{actionId:'propofol'},epoch))
assert.deepEqual(restored.current.snapshot.runtimes[0].state.actionRuntime.activeEffects,saved.actionRuntime.activeEffects)
await restored.controlClock({running:true,speed:1})
time+=4000; await restored.pulse()
assert.equal(restored.current.clock.running,false)
assert.equal(restored.current.snapshot.session.clockMs,8000)
restored.close()
console.log('IndexedDB local host: ownership, HR alarms, drug deduplication, paused restore and suspension passed')
