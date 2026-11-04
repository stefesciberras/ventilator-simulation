/**
 * Session Engine v2 disk checkpoint + lease ledger for ONE Node LAN host.
 *
 * Every mutation is serialized in this process and persisted via fsync +
 * atomic rename before acknowledgement. Never mount the same directory into
 * multiple running Node hosts: cross-process distributed locks are NOT offered.
 * Keep this file out of publicly served/static directories.
 */
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'

const copy = value => structuredClone(value)
const fail = code => { throw Error(code) }
const revision = checkpoint => {
  const s = checkpoint?.snapshot?.session
  if (checkpoint?.schema !== 'loppjusim.session-v2.checkpoint' || checkpoint.version !== 1 ||
      typeof s?.id !== 'string' || !s.id || !Number.isSafeInteger(s.revision) ||
      s.revision < 0 || !Number.isSafeInteger(s.epoch) || s.epoch < 1) fail('invalid-checkpoint')
  return s.revision
}
const validTime = (nowMs, ttlMs) => {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || !Number.isSafeInteger(ttlMs) ||
      ttlMs < 1000 || ttlMs > 60000) fail('invalid-lease-time')
}
export function createNodeFileAuthorityStore({ filePath } = {}) {
  if (!filePath || typeof filePath !== 'string') throw Error('filePath-required')
  const target = resolve(filePath)
  const folder = dirname(target)
  let queue = Promise.resolve()
  const exclusive = fn => {
    const result = queue.then(fn)
    queue = result.catch(() => undefined)
    return result
  }
  async function read() {
    try {
      const value = JSON.parse(await readFile(target, 'utf8'))
      if (value?.schema !== 'loppjusim.session-v2.node-ledger' || value.version !== 1 ||
          typeof value.checkpoints !== 'object' || typeof value.leases !== 'object') fail('corrupt-authority-ledger')
      return value
    } catch (error) {
      if (error?.code === 'ENOENT') return { schema: 'loppjusim.session-v2.node-ledger',
        version: 1, checkpoints: {}, leases: {} }
      throw error
    }
  }
  async function write(data) {
    await mkdir(folder, { recursive: true, mode: 0o700 })
    const temp = join(folder, `.${randomUUID()}.tmp`)
    try {
      const file = await open(temp, 'wx', 0o600)
      try { await file.writeFile(JSON.stringify(data)); await file.sync() }
      finally { await file.close() }
      await rename(temp, target)
      // Best-effort directory sync for crash-consistent rename on Unix.
      try { const dir = await open(folder, 'r'); try { await dir.sync() } finally { await dir.close() } }
      catch { /* unsupported on Windows */ }
    } finally { await unlink(temp).catch(() => undefined) }
  }
  const mutate = fn => exclusive(async () => {
    const state = await read()
    const output = fn(state)
    await write(state)
    return copy(output)
  })
  return {
    async load(sessionId) { return exclusive(async () => copy((await read()).checkpoints[sessionId] ?? null)) },
    initialize(checkpoint) {
      revision(checkpoint)
      return mutate(state => {
        const id = checkpoint.snapshot.session.id
        if (Object.hasOwn(state.checkpoints, id)) fail('checkpoint-already-exists')
        state.checkpoints[id] = copy(checkpoint)
        return true
      })
    },
    acquire({ sessionId, holderId, nowMs, ttlMs }) {
      validTime(nowMs, ttlMs)
      if (typeof holderId !== 'string' || !holderId) fail('invalid-holder')
      return mutate(state => {
        const checkpoint = state.checkpoints[sessionId]
        if (!checkpoint) fail('checkpoint-not-found')
        if (checkpoint.snapshot.session.status === 'ended') fail('session-ended')
        const old = state.leases[sessionId]
        if (old?.untilMs > nowMs) fail('authority-lease-held')
        const lease = { sessionId, holderId, token: randomUUID(),
          epoch: old ? Math.max(old.epoch, checkpoint.snapshot.session.epoch) + 2
            : checkpoint.snapshot.session.epoch,
          untilMs: nowMs + ttlMs }
        state.leases[sessionId] = lease
        return lease
      })
    },
    checkLease({ sessionId, leaseToken, expectedRevision, nowMs }) {
      return exclusive(async () => {
        const state = await read()
        const lease = state.leases[sessionId]
        if (!lease || lease.token !== leaseToken || lease.untilMs <= nowMs) fail('authority-lease-lost')
        if (revision(state.checkpoints[sessionId]) !== expectedRevision ||
            lease.epoch !== state.checkpoints[sessionId].snapshot.session.epoch) fail('checkpoint-revision-conflict')
        return true
      })
    },
    renew({ sessionId, leaseToken, nowMs, ttlMs }) {
      validTime(nowMs, ttlMs)
      return mutate(state => {
        const lease = state.leases[sessionId]
        if (!lease || lease.token !== leaseToken || lease.untilMs <= nowMs) fail('authority-lease-lost')
        const updated = { ...lease, untilMs: nowMs + ttlMs }
        state.leases[sessionId] = updated
        return updated
      })
    },
    commit({ checkpoint, expectedRevision, leaseToken, nowMs }) {
      const next = revision(checkpoint), id = checkpoint.snapshot.session.id
      if (!Number.isSafeInteger(nowMs) || nowMs < 0) fail('invalid-clock')
      return mutate(state => {
        const lease = state.leases[id]
        if (!lease || lease.token !== leaseToken || lease.untilMs <= nowMs) fail('authority-lease-lost')
        if (next <= expectedRevision || checkpoint.snapshot.session.epoch !== lease.epoch) fail('authority-epoch-mismatch')
        if (!state.checkpoints[id] || revision(state.checkpoints[id]) !== expectedRevision) fail('checkpoint-revision-conflict')
        state.checkpoints[id] = copy(checkpoint)
        return next
      })
    },
  }
}
