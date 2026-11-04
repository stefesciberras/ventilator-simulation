import { SessionEngineV2 } from './engine.mjs'

/**
 * Single-writer v2 authority host.
 *
 * authenticate(credentials) MUST validate identity using trusted local/LAN or
 * server-side authentication. A browser client MUST NOT be allowed to supply
 * a role, a participant ID, a store, or a lease token as proof of identity.
 *
 * No live UI, network listener or Supabase transport is created here.
 */
export function createSessionV2AuthorityHost({
  store, adapter, authenticate, now = () => Date.now(), leaseDurationMs = 15000,
} = {}) {
  if (!store || !['initialize', 'load', 'acquire', 'renew', 'commit'].every(k => typeof store[k] === 'function')) {
    throw Error('Transactional authority store required')
  }
  if (typeof authenticate !== 'function') throw Error('Trusted authenticator required')
  if (!adapter || !['initialState', 'apply', 'reset'].every(k => typeof adapter[k] === 'function')) {
    throw Error('Simulator adapter required')
  }
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs < 1000 || leaseDurationMs > 60000) {
    throw Error('Invalid lease duration')
  }

  let engine = null
  let lease = null
  let expectedRevision = null
  let stopped = false
  let queue = Promise.resolve()
  const serialized = fn => {
    const result = queue.then(fn)
    queue = result.catch(() => undefined)
    return result
  }
  const identity = async credentials => {
    const result = await authenticate(credentials)
    if (!result || typeof result.participantId !== 'string' || !result.participantId ||
        !['instructor', 'candidate', 'learner'].includes(result.role)) {
      throw Error('unauthenticated')
    }
    return result
  }
  const requireHost = actor => {
    if (!engine || !lease || stopped) throw Error('authority-host-not-active')
    if (actor.role !== 'instructor' || actor.participantId !== engine.snapshot.session.authorityId) {
      throw Error('forbidden-authority')
    }
  }
  const requireMember = actor => {
    if (!engine || !lease || stopped) throw Error('authority-host-not-active')
    const participant = engine.snapshot.participants.find(p => p.id === actor.participantId)
    if (!participant || participant.role !== actor.role) throw Error('unrecognized-participant')
  }
  const durable = async (staged, result) => {
    const checkpoint = staged.exportCheckpoint()
    try {
      await store.commit({
        checkpoint,
        expectedRevision,
        leaseToken: lease.token,
        nowMs: now(),
      })
    } catch (error) {
      // After ambiguity or a CAS failure, require a fresh host takeover.
      stopped = true
      throw error
    }
    engine = staged
    expectedRevision = checkpoint.snapshot.session.revision
    return result
  }

  return {
    get snapshot() { return engine ? engine.snapshot : null },
    get stopped() { return stopped },

    /** The initial engine must already be configured/started by trusted code. */
    create({ initialEngine, credentials }) {
      return serialized(async () => {
        if (engine || stopped) throw Error('authority-host-already-used')
        const actor = await identity(credentials)
        const snapshot = initialEngine?.snapshot
        if (actor.role !== 'instructor' || !snapshot ||
            actor.participantId !== snapshot.session.authorityId ||
            !['created', 'active'].includes(snapshot.session.status)) throw Error('forbidden-authority')
        await store.initialize(initialEngine.exportCheckpoint())
        const acquired = await store.acquire({
          sessionId: snapshot.session.id, holderId: actor.participantId,
          nowMs: now(), ttlMs: leaseDurationMs,
        })
        if (acquired.epoch !== snapshot.session.epoch) throw Error('authority-epoch-mismatch')
        engine = initialEngine.fork()
        lease = acquired
        expectedRevision = snapshot.session.revision
        return engine.snapshot
      })
    },

    /**
     * Only after the old lease expires can a new authenticated host reclaim.
     * Persist recovered epoch and connection state before returning success.
     */
    takeover({ sessionId, credentials }) {
      return serialized(async () => {
        if (engine || stopped) throw Error('authority-host-already-used')
        const actor = await identity(credentials)
        if (actor.role !== 'instructor') throw Error('forbidden-authority')
        const persisted = await store.load(sessionId)
        if (!persisted) throw Error('checkpoint-not-found')
        if (persisted.snapshot.session.authorityId !== actor.participantId) throw Error('forbidden-authority')
        if (!['active', 'recovering'].includes(persisted.snapshot.session.status)) {
          throw Error('session-not-recoverable')
        }
        const acquired = await store.acquire({
          sessionId, holderId: actor.participantId, nowMs: now(), ttlMs: leaseDurationMs,
        })
        const staged = SessionEngineV2.fromCheckpoint({ checkpoint: persisted, adapter, expectedSessionId: sessionId })
        staged.recover(actor.participantId)
        if (staged.snapshot.session.epoch !== acquired.epoch) {
          stopped = true
          throw Error('authority-epoch-mismatch')
        }
        // Commit via acquired token and original revision; do not publish
        // recovered status until the storage transaction finishes.
        engine = staged
        lease = acquired
        expectedRevision = persisted.snapshot.session.revision
        return durable(staged, staged.snapshot)
      })
    },

    submit({ command, credentials }) {
      return serialized(async () => {
        const actor = await identity(credentials)
        requireMember(actor)
        const staged = engine.fork()
        // Never trust command.participantId; it comes from verified credentials.
        const result = staged.submit({ ...command, participantId: actor.participantId })
        if (!result.accepted) return result
        return durable(staged, result)
      })
    },

    reconnect({ credentials }) {
      return serialized(async () => {
        const actor = await identity(credentials)
        requireMember(actor)
        if (actor.role === 'instructor') throw Error('instructor-requires-authority-takeover')
        const staged = engine.fork()
        staged.recover(actor.participantId)
        return durable(staged, staged.snapshot)
      })
    },

    renew({ credentials }) {
      return serialized(async () => {
        const actor = await identity(credentials)
        requireHost(actor)
        try {
          lease = await store.renew({
            sessionId: engine.snapshot.session.id,
            leaseToken: lease.token,
            nowMs: now(),
            ttlMs: leaseDurationMs,
          })
        } catch (error) {
          stopped = true
          throw error
        }
        return { epoch: lease.epoch, untilMs: lease.untilMs }
      })
    },
  }
}
