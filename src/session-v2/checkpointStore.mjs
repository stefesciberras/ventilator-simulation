/**
 * Session v2 checkpoint persistence adapters.
 *
 * save() uses compare-and-swap revisions; callers MUST await successful save
 * before broadcasting an accepted command. CAS protects stale checkpoint
 * writes, but is NOT a substitute for authenticated authority leases.
 */
const clone = value => structuredClone(value)
const revisionOf = checkpoint => {
  if (checkpoint?.schema !== 'loppjusim.session-v2.checkpoint' ||
      checkpoint.version !== 1 ||
      typeof checkpoint.snapshot?.session?.id !== 'string' ||
      !checkpoint.snapshot.session.id ||
      !Number.isSafeInteger(checkpoint.snapshot.session.revision) ||
      checkpoint.snapshot.session.revision < 0) throw new Error('Invalid checkpoint')
  return checkpoint.snapshot.session.revision
}
const conflict = () => { throw new Error('checkpoint-revision-conflict') }

/** Reference transport-agnostic store for deterministic tests (NOT durable). */
export function createMemoryCheckpointStore() {
  const items = new Map()
  return {
    async load(sessionId) { return items.has(sessionId) ? clone(items.get(sessionId)) : null },
    async save(checkpoint, expectedRevision = null) {
      const nextRevision = revisionOf(checkpoint)
      const id = checkpoint.snapshot.session.id
      const current = items.get(id)
      if ((current ? revisionOf(current) : null) !== expectedRevision ||
          (current && nextRevision <= revisionOf(current))) conflict()
      items.set(id, clone(checkpoint))
      return nextRevision
    },
  }
}

/**
 * Browser-local IndexedDB durability for offline checkpoints.
 * An IndexedDB transaction provides atomic read/compare/write in ONE browser
 * database. It does not coordinate browser peers or establish an authority.
 */
export function createIndexedDbCheckpointStore({
  indexedDB: idb = globalThis.indexedDB,
  databaseName = 'loppjusim-session-v2',
} = {}) {
  if (!idb || typeof idb.open !== 'function') throw new Error('IndexedDB unavailable')
  let dbPromise
  const database = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = idb.open(databaseName, 2)
        request.onupgradeneeded = () => {
          for (const name of ['checkpoints', 'leases']) {
            if (!request.result.objectStoreNames.contains(name)) {
              request.result.createObjectStore(name, { keyPath: 'sessionId' })
            }
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? Error('IndexedDB open failed'))
      }).catch(error => { dbPromise = null; throw error })
    }
    return dbPromise
  }
  return {
    async load(sessionId) {
      const db = await database()
      return new Promise((resolve, reject) => {
        const tx = db.transaction('checkpoints', 'readonly')
        const request = tx.objectStore('checkpoints').get(sessionId)
        let record = null
        request.onsuccess = () => { record = request.result ?? null }
        tx.oncomplete = () => resolve(record ? clone(record.checkpoint) : null)
        tx.onerror = () => reject(tx.error ?? Error('Checkpoint read failed'))
        tx.onabort = () => reject(tx.error ?? Error('Checkpoint read aborted'))
      })
    },
    async save(checkpoint, expectedRevision = null) {
      const nextRevision = revisionOf(checkpoint)
      const sessionId = checkpoint.snapshot.session.id
      const db = await database()
      return new Promise((resolve, reject) => {
        const tx = db.transaction('checkpoints', 'readwrite')
        const store = tx.objectStore('checkpoints')
        let failure = null
        const request = store.get(sessionId)
        request.onsuccess = () => {
          const current = request.result?.checkpoint ?? null
          if ((current ? revisionOf(current) : null) !== expectedRevision ||
              (current && nextRevision <= revisionOf(current))) {
            failure = Error('checkpoint-revision-conflict')
            tx.abort()
            return
          }
          store.put({ sessionId, checkpoint: clone(checkpoint) })
        }
        tx.oncomplete = () => resolve(nextRevision)
        tx.onabort = () => reject(failure ?? tx.error ?? Error('Checkpoint write aborted'))
        tx.onerror = () => reject(tx.error ?? Error('Checkpoint write failed'))
      })
    },
  }
}
