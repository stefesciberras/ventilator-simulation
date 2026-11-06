import { SessionEngineV2 } from './engine.mjs'
import { createSessionV2AuthorityHost } from './authorityHost.mjs'
import { createIndexedDbAuthorityStore } from './authorityStore.mjs'
import { createAnaesthV2SessionAdapter, projectAnaesthV2SessionSnapshot,
  projectAnaesthV2SessionLibrary } from './anaesthSession.mjs'
import { legacyAnaesthV2Library, validatePinnedAnaesthV2Library } from './adapters/anaesthLibrary.mjs'

// Local owner capability stays in this closure. No remote participant API yet.
export async function createLocalSessionHost({ sessionId, store = createIndexedDbAuthorityStore(),
  library = legacyAnaesthV2Library(), now = () => Date.now(), onSnapshot = () => {} } = {}) {
  if (!/^[a-zA-Z0-9_-]{3,80}$/.test(sessionId ?? '')) throw Error('invalid-session')
  const existing = await store.load(sessionId)
  let data = existing?.localSessionData
  if (existing && !data) throw Error('local-session-metadata-missing')
  const pinned = validatePinnedAnaesthV2Library(data?.library ?? library)
  let clock = { running: false, speed: data?.clock?.speed ?? 1 }
  if (![0.5, 1, 2, 4].includes(clock.speed)) throw Error('invalid-clock')
  data = { library: pinned, clock }
  const withData = checkpoint => ({ ...checkpoint, localSessionData: structuredClone(data) })
  const persistence = { ...store,
    initialize: cp => store.initialize(withData(cp)),
    commit: args => store.commit({ ...args, checkpoint: withData(args.checkpoint) }),
  }
  const capability = {}
  const adapter = createAnaesthV2SessionAdapter(pinned)
  const host = createSessionV2AuthorityHost({ store: persistence, adapter, now,
    authenticate: value => value === capability ? { participantId: 'instructor', role: 'instructor' } : null })
  if (existing) await host.takeover({ sessionId, credentials: capability })
  else {
    const engine = new SessionEngineV2({ sessionId, mode: 'simulation', instructorId: 'instructor', adapter })
    engine.start('instructor')
    await host.create({ initialEngine: engine, credentials: capability })
  }
  let closed = false
  let queue = Promise.resolve()
  let lastPulse = now()
  const view = () => ({ snapshot: projectAnaesthV2SessionSnapshot(host.snapshot),
    clock: { ...clock }, actionLibrary: projectAnaesthV2SessionLibrary(pinned), role: 'instructor' })
  const publish = () => { if (!closed) onSnapshot(view()) }
  const serial = fn => {
    const next = queue.then(async () => {
      if (closed || host.stopped) throw Error('local-authority-unavailable')
      return fn()
    })
    queue = next.catch(() => {})
    return next
  }
  const setClock = async next => {
    if (typeof next.running !== 'boolean' || ![0.5, 1, 2, 4].includes(next.speed)) throw Error('invalid-clock')
    const nextData = { library: pinned, clock: { ...next } }
    await host.saveSessionData({ credentials: capability, data: nextData })
    data = nextData; clock = nextData.clock; lastPulse = now()
  }
  return {
    get current() { return view() },
    controlClock: next => serial(async () => { await setClock(next); publish() }),
    submit: command => serial(async () => {
      if (command.type === 'tick' && clock.running) throw Error('clock-already-running')
      // Strip all caller-supplied authority/internal-clock fields.
      const clean = { id: command.id, epoch: command.epoch, runtimeId: 'main', type: command.type, payload: command.payload ?? {} }
      if (['reset', 'end'].includes(clean.type)) await setClock({ ...clock, running: false })
      const receipt = await host.submit({ credentials: capability, command: clean })
      if (receipt.accepted) publish()
      return receipt
    }),
    pulse: () => serial(async () => {
      const elapsed = now() - lastPulse
      lastPulse = now()
      await host.renew({ credentials: capability })
      // Suspension never produces catch-up ticks. Recovery requires explicit resume.
      if (elapsed < 0 || elapsed > 2500) { await setClock({ ...clock, running: false }); publish(); return }
      if (!clock.running) return
      for (let i = 0; i < Math.max(1, clock.speed); i++) {
        const session = host.snapshot.session
        const result = await host.submit({ credentials: capability, command: {
          id: `local-clock:${session.epoch}:${session.clockMs}:${i}`, epoch: session.epoch,
          runtimeId: 'main', type: 'tick', internalClock: true,
          payload: { deltaMs: clock.speed === 0.5 ? 500 : 1000 } } })
        if (!result.accepted) throw Error(result.reason)
      }
      publish()
    }),
    // Stop immediately; persisted running state is always forced paused on restore.
    close() { closed = true },
  }
}
