/**
 * Session Engine v2 LAN transport gateway (experimental).
 *
 * This module owns only the wire protocol. It never treats a client-supplied
 * role/participantId as authorization; authenticate(token) must be a
 * server-side verifier. createRoom() must create a trusted authority host.
 * No v1 wire protocol or global simulator runtime is touched.
 */
const MAX_MESSAGE_BYTES = 64 * 1024
const sessionPattern = /^[a-zA-Z0-9_-]{3,80}$/
const commandIdPattern = /^[a-zA-Z0-9._:-]{1,128}$/
const acceptedTypes = new Set(['patient.parameter.set', 'device.parameter.set',
  'anaesth.gas.set', 'action.invoke', 'reset', 'tick', 'end'])
const cleanString = s => typeof s === 'string' ? s.trim() : ''
const clone = value => structuredClone(value)

export function createSessionV2LanGateway({ authenticate, createRoom, maxRooms = 16 } = {}) {
  if (typeof authenticate !== 'function' || typeof createRoom !== 'function') {
    throw Error('Trusted authentication and room factory required')
  }
  const rooms = new Map()
  const connections = new Map()

  const safeSend = (socket, data) => {
    if (socket.readyState === 1) socket.send(JSON.stringify(data))
  }
  const error = (socket, requestId, reason) => safeSend(socket,
    { protocol: 2, type: 'error', requestId, reason })
  const announce = room => {
    const message = { protocol: 2, type: 'snapshot', snapshot: room.host.snapshot }
    for (const socket of room.sockets) safeSend(socket, message)
  }
  const detach = socket => {
    const connection = connections.get(socket)
    if (!connection) return
    connections.delete(socket)
    connection.room.sockets.delete(socket)
  }

  const receive = async (socket, raw) => {
    let msg
    try {
      if (raw.length > MAX_MESSAGE_BYTES) throw Error('too-large')
      msg = JSON.parse(String(raw))
      if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.protocol !== 2) throw Error('bad-protocol')
    } catch { error(socket, null, 'invalid-message'); return }

    const requestId = cleanString(msg.requestId).slice(0, 128) || null
    if (msg.type === 'hello') {
      if (connections.has(socket)) { error(socket, requestId, 'already-connected'); return }
      const sessionId = cleanString(msg.sessionId)
      if (!sessionPattern.test(sessionId)) { error(socket, requestId, 'invalid-session'); return }
      let identity
      try { identity = await authenticate(msg.token) } catch { /* fail closed */ }
      if (!identity || !['instructor', 'candidate'].includes(identity.role) ||
          !cleanString(identity.participantId)) { error(socket, requestId, 'unauthenticated'); return }
      let room = rooms.get(sessionId)
      if (!room) {
        if (identity.role !== 'instructor' || rooms.size >= maxRooms) {
          error(socket, requestId, 'session-unavailable'); return
        }
        try {
          // Trusted server code supplies scenario/adapter and initial members.
          room = await createRoom({ sessionId, identity })
          if (!room?.host || !room?.host.snapshot || room.host.snapshot.session.id !== sessionId) {
            throw Error('invalid-room-factory')
          }
          rooms.set(sessionId, { host: room.host, sockets: new Set(), queue: Promise.resolve() })
          room = rooms.get(sessionId)
        } catch { error(socket, requestId, 'session-unavailable'); return }
      }
      const member = room.host.snapshot.participants.find(p => p.id === identity.participantId && p.role === identity.role)
      if (!member) { error(socket, requestId, 'not-session-member'); return }
      // Rejoining a candidate must restore the participant through the
      // authority's checkpoint path, never by mutating a snapshot locally.
      try {
        if (!member.connected && identity.role === 'candidate') {
          await room.host.reconnect({ credentials: msg.token })
          announce(room)
        }
      } catch { error(socket, requestId, 'recovery-failed'); return }
      room.sockets.add(socket)
      connections.set(socket, { room, identity, token: msg.token })
      safeSend(socket, { protocol: 2, type: 'welcome', requestId, snapshot: room.host.snapshot })
      return
    }
    const connection = connections.get(socket)
    if (!connection) { error(socket, requestId, 'not-connected'); return }
    const { room, identity, token } = connection
    if (msg.type === 'resync') {
      safeSend(socket, { protocol: 2, type: 'snapshot', requestId, snapshot: room.host.snapshot })
      return
    }
    if (msg.type !== 'command') { error(socket, requestId, 'unsupported-message'); return }
    const cmd = msg.command
    if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd) ||
        !commandIdPattern.test(cmd.id) || !acceptedTypes.has(cmd.type) ||
        typeof cmd.runtimeId !== 'string' ||
        !Number.isSafeInteger(cmd.epoch) || cmd.epoch < 1) {
      error(socket, requestId, 'invalid-command'); return
    }
    // Authoritative state is serialized by authorityHost. Serialize gateway
    // acknowledgement + snapshot distribution in the same order.
    const pending = room.queue.then(async () => {
      try {
        const receipt = await room.host.submit({
          credentials: token,
          command: { id: cmd.id, type: cmd.type, runtimeId: cmd.runtimeId,
            epoch: cmd.epoch, payload: clone(cmd.payload ?? {}) },
        })
        safeSend(socket, { protocol: 2, type: 'receipt', requestId, receipt })
        if (receipt.accepted) announce(room)
      } catch {
        error(socket, requestId, 'authority-unavailable')
      }
    })
    room.queue = pending.catch(() => undefined)
    await pending
  }
  return {
    attach(socket) {
      if (connections.has(socket)) throw Error('socket-already-attached')
      socket.on('message', raw => { void receive(socket, raw) })
      socket.on('close', () => detach(socket))
      socket.on('error', () => detach(socket))
    },
    close() {
      for (const socket of connections.keys()) {
        try { socket.close(1001, 'Gateway closing') } catch { /* no-op */ }
        detach(socket)
      }
      rooms.clear()
    },
    get roomCount() { return rooms.size },
  }
}
