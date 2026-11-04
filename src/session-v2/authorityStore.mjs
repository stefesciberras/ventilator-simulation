/**
 * Trusted Session Engine v2 authority ledger.
 *
 * Leases and checkpoints MUST live in the same transactional storage domain.
 * A lease alone does not authenticate anyone. Only a server/LAN host with a
 * verified instructor identity may invoke acquire/commit/renew.
 *
 * The memory implementation is for tests; IndexedDB is atomic only on one
 * browser origin and is NOT cross-device authority.
 */
const clone = value => structuredClone(value)
const revision = checkpoint => {
  const session = checkpoint?.snapshot?.session
  if (checkpoint?.schema !== 'loppjusim.session-v2.checkpoint' ||
      checkpoint.version !== 1 || typeof session?.id !== 'string' || !session.id ||
      !Number.isSafeInteger(session.revision) || session.revision < 0 ||
      !Number.isSafeInteger(session.epoch) || session.epoch < 1) {
    throw new Error('invalid-checkpoint')
  }
  return session.revision
}
const assertTime = (nowMs, ttlMs) => {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 ||
      !Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 60000) {
    throw new Error('invalid-lease-time')
  }
}
const validId = id => typeof id === 'string' && id.trim().length > 0
const conflict = code => { throw new Error(code) }
const token = () => {
  if (!globalThis.crypto?.randomUUID) throw new Error('secure-crypto-required')
  return globalThis.crypto.randomUUID()
}
const createLease = (checkpoint, oldLease, holderId, nowMs, ttlMs) => ({
  sessionId: checkpoint.snapshot.session.id,
  holderId,
  token: token(),
  // A restored live room consumes one epoch in fromCheckpoint() and
  // another on authenticated instructor recover().
  epoch: oldLease
    ? Math.max(oldLease.epoch, checkpoint.snapshot.session.epoch) + 2
    : checkpoint.snapshot.session.epoch,
  untilMs: nowMs + ttlMs,
})
const assertLeaseWritable = (checkpoint, lease, tokenValue, expectedRevision, nowMs) => {
  if (!lease || lease.token !== tokenValue || lease.untilMs <= nowMs) conflict('authority-lease-lost')
  if (checkpoint.snapshot.session.epoch !== lease.epoch) conflict('authority-epoch-mismatch')
  if (revision(checkpoint) <= expectedRevision) conflict('checkpoint-revision-conflict')
}
const acquireState = (checkpoint, oldLease, holderId, nowMs, ttlMs) => {
  if (!checkpoint) conflict('checkpoint-not-found')
  if (checkpoint.snapshot.session.status === 'ended') conflict('session-ended')
  if (!validId(holderId)) throw new Error('invalid-holder')
  assertTime(nowMs, ttlMs)
  if (oldLease && oldLease.untilMs > nowMs) conflict('authority-lease-held')
  return createLease(checkpoint, oldLease, holderId, nowMs, ttlMs)
}

/** Atomic in-process reference store; NOT durable or distributed. */
export function createMemoryAuthorityStore() {
  const checkpoints = new Map()
  const leases = new Map()
  return {
    async initialize(checkpoint) {
      revision(checkpoint)
      const id = checkpoint.snapshot.session.id
      if (checkpoints.has(id)) conflict('checkpoint-already-exists')
      checkpoints.set(id, clone(checkpoint))
    },
    async load(sessionId) { return checkpoints.has(sessionId) ? clone(checkpoints.get(sessionId)) : null },
    async acquire({ sessionId, holderId, nowMs, ttlMs }) {
      const next = acquireState(checkpoints.get(sessionId), leases.get(sessionId), holderId, nowMs, ttlMs)
      leases.set(sessionId, next)
      return clone(next)
    },
    async checkLease({ sessionId, leaseToken, expectedRevision, nowMs }) {
      const current = leases.get(sessionId)
      const persisted = checkpoints.get(sessionId)
      if (!current || current.token !== leaseToken || current.untilMs <= nowMs) conflict('authority-lease-lost')
      if (!persisted || revision(persisted) !== expectedRevision ||
          current.epoch !== persisted.snapshot.session.epoch) conflict('checkpoint-revision-conflict')
      return true
    },
    async renew({ sessionId, leaseToken, nowMs, ttlMs }) {
      assertTime(nowMs, ttlMs)
      const current = leases.get(sessionId)
      if (!current || current.token !== leaseToken || current.untilMs <= nowMs) conflict('authority-lease-lost')
      const updated = { ...current, untilMs: nowMs + ttlMs }
      leases.set(sessionId, updated)
      return clone(updated)
    },
    async commit({ checkpoint, expectedRevision, leaseToken, nowMs }) {
      const id = checkpoint?.snapshot?.session?.id
      const before = checkpoints.get(id)
      if (!before) conflict('checkpoint-not-found')
      if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error('invalid-clock')
      if (revision(before) !== expectedRevision) conflict('checkpoint-revision-conflict')
      assertLeaseWritable(checkpoint, leases.get(id), leaseToken, expectedRevision, nowMs)
      checkpoints.set(id, clone(checkpoint))
      return revision(checkpoint)
    },
  }
}

/**
 * Transactional browser-local lease/store. This protects multiple tabs on one
 * origin; a LAN/server coordinator is still required for other devices.
 * Uses schema v2 of the same database as the v1 checkpoint-only store.
 */
export function createIndexedDbAuthorityStore({
  indexedDB: idb = globalThis.indexedDB,
  databaseName = 'loppjusim-session-v2',
} = {}) {
  if (!idb?.open) throw new Error('IndexedDB unavailable')
  let dbPromise
  const db = () => {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = idb.open(databaseName, 2)
      request.onupgradeneeded = () => {
        for (const name of ['checkpoints', 'leases']) {
          if (!request.result.objectStoreNames.contains(name)) {
            request.result.createObjectStore(name, { keyPath: 'sessionId' })
          }
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? Error('IndexedDB unavailable'))
    }).catch(error => { dbPromise = null; throw error })
    return dbPromise
  }
  const transact = async (stores, mode, operation) => {
    const database = await db()
    return new Promise((resolve, reject) => {
      const tx = database.transaction(stores, mode)
      let result
      let failure
      const abort = error => { failure = error; tx.abort() }
      const request = (store, method, ...args) => new Promise((fulfil, fail) => {
        const req = tx.objectStore(store)[method](...args)
        req.onsuccess = () => fulfil(req.result)
        req.onerror = () => fail(req.error)
      })
      // The promise chain must only await IndexedDB requests on the same
      // transaction, never timers/network calls. Abort on any failure.
      Promise.resolve().then(() => operation({ request, abort })).then(value => {
        result = value
      }).catch(error => {
        if (tx.readyState === 'active') abort(error)
        else failure = error
      })
      tx.oncomplete = () => failure ? reject(failure) : resolve(result)
      tx.onabort = () => reject(failure ?? tx.error ?? Error('IndexedDB transaction aborted'))
      tx.onerror = () => { failure ??= tx.error ?? Error('IndexedDB transaction failed') }
    })
  }
  return {
    async initialize(checkpoint) {
      revision(checkpoint)
      const sessionId = checkpoint.snapshot.session.id
      return transact(['checkpoints'], 'readwrite', async ({ request, abort }) => {
        const existing = await request('checkpoints', 'get', sessionId)
        if (existing) { abort(Error('checkpoint-already-exists')); return }
        await request('checkpoints', 'put', { sessionId, checkpoint: clone(checkpoint) })
      })
    },
    async load(sessionId) {
      return transact(['checkpoints'], 'readonly', async ({ request }) => {
        const record = await request('checkpoints', 'get', sessionId)
        return record ? clone(record.checkpoint) : null
      })
    },
    async acquire({ sessionId, holderId, nowMs, ttlMs }) {
      return transact(['checkpoints', 'leases'], 'readwrite', async ({ request }) => {
        const record = await request('checkpoints', 'get', sessionId)
        const old = await request('leases', 'get', sessionId)
        const next = acquireState(record?.checkpoint, old, holderId, nowMs, ttlMs)
        await request('leases', 'put', next)
        return clone(next)
      })
    },
    async checkLease({ sessionId, leaseToken, expectedRevision, nowMs }) {
      return transact(['checkpoints', 'leases'], 'readonly', async ({ request }) => {
        const persisted = await request('checkpoints', 'get', sessionId)
        const lease = await request('leases', 'get', sessionId)
        if (!lease || lease.token !== leaseToken || lease.untilMs <= nowMs) conflict('authority-lease-lost')
        if (!persisted || revision(persisted.checkpoint) !== expectedRevision ||
            persisted.checkpoint.snapshot.session.epoch !== lease.epoch) conflict('checkpoint-revision-conflict')
        return true
      })
    },
    async renew({ sessionId, leaseToken, nowMs, ttlMs }) {
      return transact(['leases'], 'readwrite', async ({ request }) => {
        assertTime(nowMs, ttlMs)
        const current = await request('leases', 'get', sessionId)
        if (!current || current.token !== leaseToken || current.untilMs <= nowMs) {
          conflict('authority-lease-lost')
        }
        const next = { ...current, untilMs: nowMs + ttlMs }
        await request('leases', 'put', next)
        return clone(next)
      })
    },
    async commit({ checkpoint, expectedRevision, leaseToken, nowMs }) {
      const sessionId = checkpoint?.snapshot?.session?.id
      return transact(['checkpoints', 'leases'], 'readwrite', async ({ request }) => {
        const previous = await request('checkpoints', 'get', sessionId)
        const lease = await request('leases', 'get', sessionId)
        if (!previous) conflict('checkpoint-not-found')
        if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw Error('invalid-clock')
        if (revision(previous.checkpoint) !== expectedRevision) conflict('checkpoint-revision-conflict')
        assertLeaseWritable(checkpoint, lease, leaseToken, expectedRevision, nowMs)
        await request('checkpoints', 'put', { sessionId, checkpoint: clone(checkpoint) })
        return revision(checkpoint)
      })
    },
  }
}
