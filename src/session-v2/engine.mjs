/**
 * loppjuSIM Session Engine v2 (experimental).
 * Product-neutral, transport-free authoritative command processor.
 * No React, Supabase, browser globals or simulator-specific physiology.
 *
 * Adapter contract:
 *   initialState(runtimeId): JSON-serializable state
 *   apply(state, command, context): next JSON-serializable state
 *   reset(state, context): next JSON-serializable state
 */
const copy = value => structuredClone(value)
const allowedModes = new Set(['standalone', 'simulation', 'teaching', 'self-directed'])
const allowedRoles = new Set(['instructor', 'candidate', 'learner'])
const freezeState = value => Object.freeze(value)
const reject = (reason, revision) => ({ accepted: false, reason, revision })
const isNonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0
const assertCheckpoint = checkpoint => {
  if (!checkpoint || checkpoint.schema !== 'loppjusim.session-v2.checkpoint' || checkpoint.version !== 1) {
    throw new Error('Unsupported session checkpoint format')
  }
  const { snapshot, receipts, events } = checkpoint
  const session = snapshot?.session
  if (snapshot?.protocol !== 2 || !session || typeof session.id !== 'string' || !session.id ||
      !allowedModes.has(session.mode) || !['created', 'active', 'recovering', 'ended'].includes(session.status) ||
      !isNonnegativeInteger(session.revision) || !Number.isSafeInteger(session.epoch) || session.epoch < 1 ||
      !isNonnegativeInteger(session.clockMs) ||
      !Array.isArray(snapshot.participants) || !Array.isArray(snapshot.runtimes) ||
      !Array.isArray(receipts) || !Array.isArray(events)) throw new Error('Malformed session checkpoint')
  if (['simulation', 'teaching'].includes(session.mode) &&
      (typeof session.authorityId !== 'string' || !session.authorityId)) throw new Error('Missing authority')
  const participantIds = new Set()
  for (const participant of snapshot.participants) {
    if (!participant || typeof participant.id !== 'string' || !participant.id ||
        participantIds.has(participant.id) || !allowedRoles.has(participant.role) ||
        typeof participant.connected !== 'boolean') throw new Error('Malformed participant checkpoint')
    participantIds.add(participant.id)
  }
  if (session.authorityId && !snapshot.participants.some(p => p.id === session.authorityId && p.role === 'instructor')) {
    throw new Error('Missing instructor participant')
  }
  if (session.mode === 'simulation' &&
      snapshot.participants.filter(p => p.role === 'candidate').length > 1) throw new Error('Invalid candidate cardinality')
  const runtimeIds = new Set()
  for (const runtime of snapshot.runtimes) {
    if (!runtime || typeof runtime.id !== 'string' || !runtime.id ||
        runtimeIds.has(runtime.id) || !isNonnegativeInteger(runtime.revision) ||
        runtime.state === undefined || runtime.state === null) throw new Error('Malformed runtime checkpoint')
    runtimeIds.add(runtime.id)
  }
  if (session.mode === 'teaching') {
    for (const participant of snapshot.participants.filter(p => p.role === 'candidate')) {
      if (!runtimeIds.has(participant.id)) throw new Error('Missing teaching candidate runtime')
    }
  } else if (runtimeIds.size !== 1 || !runtimeIds.has('main')) throw new Error('Missing shared runtime')
  const receiptKeys = new Set()
  for (const entry of receipts) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' ||
        receiptKeys.has(entry[0]) || entry[1]?.accepted !== true ||
        !isNonnegativeInteger(entry[1].revision) || entry[1].revision > session.revision) {
      throw new Error('Malformed command receipt')
    }
    receiptKeys.add(entry[0])
  }
  if (events.length > 10000 || receipts.length > 100000) throw new Error('Checkpoint exceeds safety limits')
  return structuredClone(checkpoint)
}

export class SessionEngineV2 {
  #adapter
  #session
  #runtimes = new Map()
  #participants = new Map()
  #seen = new Map()
  #events = []
  #eventLimit

  constructor({ sessionId, mode, instructorId = null, adapter, eventLimit = 512 }) {
    if (!sessionId || !allowedModes.has(mode)) throw new Error('Invalid session ID or mode')
    if (!adapter || !['initialState', 'apply', 'reset'].every(k => typeof adapter[k] === 'function')) {
      throw new Error('A simulator adapter with initialState/apply/reset is required')
    }
    if (!Number.isInteger(eventLimit) || eventLimit < 1) throw new Error('Invalid event limit')
    if (['simulation', 'teaching'].includes(mode) && !instructorId) throw new Error('Instructor required')
    this.#adapter = adapter
    this.#eventLimit = eventLimit
    this.#session = { id: sessionId, mode, status: 'created', epoch: 1, revision: 0,
      authorityId: instructorId, clockMs: 0 }
    if (instructorId) this.#participants.set(instructorId, { id: instructorId, role: 'instructor', connected: true })
    if (mode === 'standalone' || mode === 'self-directed' || mode === 'simulation') {
      this.#makeRuntime('main')
    }
  }

  #makeRuntime(id) {
    if (this.#runtimes.has(id)) return
    this.#runtimes.set(id, { id, revision: 0, state: copy(this.#adapter.initialState(id)) })
  }

  get snapshot() {
    return copy({ protocol: 2, session: this.#session,
      participants: [...this.#participants.values()],
      runtimes: [...this.#runtimes.values()] })
  }

  get events() { return copy(this.#events) }

  /**
   * Internal speculative fork: stage commands without touching acknowledged
   * state. The authority host must persist the fork's checkpoint before
   * making the fork live or returning an accepted receipt.
   */
  fork() {
    const fork = new SessionEngineV2({
      sessionId: this.#session.id,
      mode: this.#session.mode,
      instructorId: this.#session.authorityId,
      adapter: this.#adapter,
      eventLimit: this.#eventLimit,
    })
    fork.#session = copy(this.#session)
    fork.#runtimes = new Map([...this.#runtimes].map(([key, value]) => [key, copy(value)]))
    fork.#participants = new Map([...this.#participants].map(([key, value]) => [key, copy(value)]))
    fork.#seen = new Map([...this.#seen].map(([key, value]) => [key, copy(value)]))
    fork.#events = copy(this.#events)
    return fork
  }

  /**
   * Versioned durable checkpoint. Persist atomically before acknowledging a
   * command externally. Includes receipts to prevent re-executing a drug after
   * process recreation. The host is responsible for authenticating authority.
   */
  exportCheckpoint() {
    return copy({
      schema: 'loppjusim.session-v2.checkpoint',
      version: 1,
      snapshot: this.snapshot,
      receipts: [...this.#seen.entries()],
      events: this.#events,
    })
  }

  /**
   * Reconstruct model state without replaying any drug, tick or reset.
   * Restoring a live room fences the previous in-memory epoch and leaves the
   * room Recovering until an authenticated instructor reclaims authority.
   * The checkpoint store MUST enforce single-writer ownership separately.
   */
  static fromCheckpoint({ checkpoint, adapter, expectedSessionId } = {}) {
    const persisted = assertCheckpoint(checkpoint)
    const { session, participants, runtimes } = persisted.snapshot
    if (expectedSessionId != null && session.id !== expectedSessionId) throw new Error('Wrong session checkpoint')
    const engine = new SessionEngineV2({
      sessionId: session.id, mode: session.mode, instructorId: session.authorityId,
      adapter,
    })
    engine.#session = { ...session,
      epoch: session.status === 'ended' ? session.epoch : session.epoch + 1,
      status: session.status === 'active' && session.authorityId ? 'recovering' : session.status,
      revision: session.status === 'ended' ? session.revision : session.revision + 1,
    }
    engine.#participants = new Map(participants.map(p => [p.id, { ...p, connected: false }]))
    engine.#runtimes = new Map(runtimes.map(runtime => [runtime.id, runtime]))
    engine.#seen = new Map(persisted.receipts)
    engine.#events = persisted.events.slice(-engine.#eventLimit)
    return engine
  }

  join({ participantId, role }) {
    if (!participantId || !allowedRoles.has(role)) throw new Error('Invalid participant')
    if (this.#session.status === 'ended') throw new Error('Session ended')
    if (role === 'instructor' && participantId !== this.#session.authorityId) {
      throw new Error('Instructor identity does not match authority')
    }
    if (role !== 'instructor' && participantId === this.#session.authorityId) {
      throw new Error('Authority cannot join as candidate')
    }
    if (this.#session.mode === 'standalone' && this.#participants.size && !this.#participants.has(participantId)) {
      throw new Error('Standalone allows one participant')
    }
    if (this.#session.mode === 'self-directed' && role !== 'learner') throw new Error('Learner required')
    if (this.#session.mode === 'simulation' && role === 'learner') throw new Error('Invalid role')
    if (this.#session.mode === 'simulation' && role === 'candidate' &&
        [...this.#participants.values()].some(p => p.role === 'candidate' && p.id !== participantId)) {
      throw new Error('Simulation permits one candidate')
    }
    if (this.#session.mode === 'self-directed' && !this.#participants.has(participantId) &&
        this.#participants.size) throw new Error('Self-directed permits one learner')
    if (this.#session.mode === 'standalone' && role !== 'learner') throw new Error('Standalone requires a local learner')
    if (this.#session.mode === 'teaching' && role === 'learner') throw new Error('Invalid role')
    this.#participants.set(participantId, { id: participantId, role, connected: true })
    if (this.#session.mode === 'teaching' && role === 'candidate') this.#makeRuntime(participantId)
    if (this.#session.mode === 'standalone' && !this.#runtimes.has('main')) this.#makeRuntime('main')
    return this.snapshot
  }

  start(participantId) {
    if (this.#session.status !== 'created') throw new Error('Cannot start')
    const participant = this.#participants.get(participantId)
    if (!participant?.connected || (this.#session.authorityId && participantId !== this.#session.authorityId)) {
      throw new Error('Only authority can start')
    }
    this.#session.status = 'active'
    ++this.#session.revision
    return this.snapshot
  }

  disconnect(participantId) {
    const p = this.#participants.get(participantId)
    if (!p || this.#session.status === 'ended') return this.snapshot
    this.#participants.set(participantId, { ...p, connected: false })
    if (participantId === this.#session.authorityId && this.#session.status === 'active') {
      this.#session.status = 'recovering'
    }
    ++this.#session.revision
    return this.snapshot
  }

  /**
   * Authority identity must be validated by a trusted host before calling recover.
   * Epoch fencing prevents stale connections from submitting commands.
   */
  recover(participantId) {
    const p = this.#participants.get(participantId)
    if (!p || this.#session.status === 'ended') throw new Error('Unknown or ended session')
    if (p.role === 'instructor' && participantId !== this.#session.authorityId) throw new Error('Not authority')
    this.#participants.set(participantId, { ...p, connected: true })
    if (participantId === this.#session.authorityId) {
      ++this.#session.epoch
      if (this.#session.status === 'recovering') this.#session.status = 'active'
    }
    ++this.#session.revision
    return this.snapshot
  }

  submit(command) {
    const { id, participantId, epoch, type, runtimeId, payload = {} } = command ?? {}
    if (typeof id !== 'string' || !id || typeof type !== 'string' || !type) return reject('invalid-command', this.#session.revision)
    const key = participantId + ':' + id
    // Old-epoch retries must never appear successful, even when previously applied.
    if (epoch !== this.#session.epoch) return reject('stale-epoch', this.#session.revision)
    if (this.#seen.has(key)) return copy(this.#seen.get(key))
    const p = this.#participants.get(participantId)
    if (!p?.connected) return reject('participant-disconnected', this.#session.revision)
    if (this.#session.status !== 'active') return reject('session-not-active', this.#session.revision)
    if (type === 'end' && participantId !== this.#session.authorityId) return reject('forbidden', this.#session.revision)
    if (type === 'reset' && p.role !== 'instructor' && this.#session.mode !== 'standalone') {
      return reject('forbidden', this.#session.revision)
    }
    if (type === 'tick' && participantId !== this.#session.authorityId && this.#session.authorityId) {
      return reject('forbidden', this.#session.revision)
    }
    if (this.#session.mode === 'teaching' && p.role === 'candidate' && runtimeId !== participantId) {
      return reject('forbidden-runtime', this.#session.revision)
    }
    if (this.#session.mode !== 'teaching' && runtimeId !== 'main' && type !== 'end') {
      return reject('invalid-runtime', this.#session.revision)
    }
    if (this.#session.mode === 'teaching' && p.role === 'instructor' && type !== 'end' && !this.#runtimes.has(runtimeId)) {
      return reject('unknown-runtime', this.#session.revision)
    }
    if (type !== 'end' && !this.#runtimes.has(runtimeId)) return reject('unknown-runtime', this.#session.revision)
    // A synchronous, linearizable reducer: no await between validation and commit.
    const runtime = this.#runtimes.get(runtimeId)
    let nextState
    try {
      if (type === 'reset') nextState = this.#adapter.reset(copy(runtime.state), { runtimeId, mode: this.#session.mode, actorRole: p.role, participantId })
      else if (type === 'tick') {
        if (!Number.isFinite(payload.deltaMs) || payload.deltaMs <= 0 || payload.deltaMs > 1000) {
          return reject('invalid-tick', this.#session.revision)
        }
        nextState = this.#adapter.apply(copy(runtime.state), copy(command), { runtimeId, mode: this.#session.mode, actorRole: p.role, participantId })
      } else if (type !== 'end') {
        nextState = this.#adapter.apply(copy(runtime.state), copy(command), { runtimeId, mode: this.#session.mode, actorRole: p.role, participantId })
      }
      if (type !== 'end' && (nextState === undefined || JSON.stringify(nextState) === undefined)) {
        return reject('invalid-adapter-state', this.#session.revision)
      }
      if (type !== 'end') copy(nextState) // enforce serializability before commit
    } catch {
      return reject('adapter-error', this.#session.revision)
    }
    if (type === 'end') this.#session.status = 'ended'
    else {
      this.#runtimes.set(runtimeId, { id: runtimeId, revision: runtime.revision + 1, state: copy(nextState) })
      // Reset of a shared session resets the authoritative clock too. The
      // adapter restores simulationTime=0 and removes all active effects;
      // keeping the old clockMs here would desynchronize recovery/UI.
      // Teaching has independent candidate runtimes, so resetting one
      // candidate must not rewind a clock shared with other candidates.
      if (type === 'reset' && this.#session.mode !== 'teaching') this.#session.clockMs = 0
      if (type === 'tick' && nextState !== runtime.state &&
          (nextState?.actionRuntime?.simulationTime !== runtime.state?.actionRuntime?.simulationTime ||
            !runtime.state?.actionRuntime)) this.#session.clockMs += payload.deltaMs
    }
    ++this.#session.revision
    const result = freezeState({ accepted: true, revision: this.#session.revision, runtimeRevision: type === 'end' ? null : runtime.revision + 1 })
    this.#seen.set(key, result)
    const event = { sequence: this.#session.revision, epoch, commandId: id, participantId, runtimeId, type }
    this.#events.push(event)
    if (this.#events.length > this.#eventLimit) this.#events.shift()
    return copy(result)
  }
}
