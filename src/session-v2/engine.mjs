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
    if (this.#seen.has(key)) return copy(this.#seen.get(key))
    const p = this.#participants.get(participantId)
    if (!p?.connected) return reject('participant-disconnected', this.#session.revision)
    if (this.#session.status !== 'active') return reject('session-not-active', this.#session.revision)
    if (epoch !== this.#session.epoch) return reject('stale-epoch', this.#session.revision)
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
      if (type === 'tick') this.#session.clockMs += payload.deltaMs
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
