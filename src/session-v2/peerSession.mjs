// Manual, non-trickle ICE pairing. No external signalling/STUN/TURN service.
const MAX = 256 * 1024
export function parsePairing(text, type) {
  if (typeof text !== 'string' || text.length > MAX) throw Error('Pairing text too large')
  const value = JSON.parse(text)
  if (value.protocol !== 2 || value.description?.type !== type ||
      typeof value.description.sdp !== 'string' || !/^[a-zA-Z0-9_-]{3,80}$/.test(value.sessionId) ||
      typeof value.token !== 'string' || value.token.length < 32) throw Error('Invalid pairing text')
  return value
}
async function description(pc) {
  if (pc.iceGatheringState !== 'complete') await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(Error('ICE gathering timed out; try pairing again')) }, 15000)
    const check = () => { if (pc.iceGatheringState === 'complete') { cleanup(); resolve() } }
    const cleanup = () => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check) }
    pc.addEventListener('icegatheringstatechange', check); check()
  })
  return pc.localDescription.toJSON()
}
const connection = () => new RTCPeerConnection({ iceServers: [] })
export function createInstructorPeer(host, sessionId, status = () => {}) {
  const pc = connection(), dc = pc.createDataChannel('loppjusim-v2', { ordered: true })
  const token = crypto.randomUUID()
  let authorized = false, closed = false, queue = Promise.resolve()
  const send = packet => {
    if (dc.readyState !== 'open' || closed) return
    if (dc.bufferedAmount > 1024 * 1024) { close(); status('Candidate connection too slow; pair again'); return }
    dc.send(JSON.stringify({ protocol: 2, ...packet }))
  }
  const close = () => { closed = true; authorized = false; dc.close(); pc.close() }
  dc.onopen = () => status('Candidate connected; authenticating')
  dc.onclose = () => { authorized = false; status('Candidate disconnected; create a new offer to reconnect') }
  dc.onerror = () => { close(); status('Candidate transport error; pair again') }
  dc.onmessage = event => {
    queue = queue.then(async () => {
      if (closed) return
      if (typeof event.data !== 'string' || event.data.length > MAX) throw Error('invalid-message')
      const msg = JSON.parse(event.data)
      if (msg.protocol !== 2) throw Error('invalid-protocol')
      if (!authorized) {
        if (msg.type !== 'hello' || msg.token !== token) throw Error('unauthenticated')
        const value = await host.connectCandidate()
        authorized = true; send({ type: 'welcome', ...value }); status('Candidate synchronised')
      } else if (msg.type === 'command') {
        const receipt = await host.submitCandidate(msg.command)
        send({ type: 'receipt', requestId: msg.requestId, receipt })
      } else if (msg.type === 'resync') send({ type: 'snapshot', ...host.current, role: 'candidate' })
      else send({ type: 'error', requestId: msg.requestId, reason: 'forbidden-peer-operation' })
    }).catch(error => { send({ type: 'error', reason: error.message }); close(); status(error.message) })
  }
  pc.onconnectionstatechange = () => {
    if (['failed','disconnected'].includes(pc.connectionState)) { close(); status('Candidate disconnected; pair again') }
  }
  return {
    async offer() { await pc.setLocalDescription(await pc.createOffer()); return JSON.stringify({ protocol: 2, sessionId, token, description: await description(pc) }) },
    async accept(text) {
      const answer = parsePairing(text, 'answer')
      if (answer.token !== token || answer.sessionId !== sessionId) throw Error('Answer belongs to another offer')
      await pc.setRemoteDescription(answer.description)
    },
    publish(value) { if (authorized) send({ type: 'snapshot', ...value, role: 'candidate' }) },
    close,
  }
}
export function createCandidatePeerTransport(offerText, onAnswer) {
  const offer = parsePairing(offerText, 'offer'), pc = connection()
  let dc, closed = false
  const channel = {
    readyState: 0, protocol: 'loppjusim-v2', onopen: null, onmessage: null, onclose: null, onerror: null,
    send(raw) { if (dc?.readyState === 'open' && dc.bufferedAmount < 1024 * 1024) dc.send(raw); else fail('Connection unavailable; pair again') },
    close() { if (closed) return; closed = true; channel.readyState = 3; dc?.close(); pc.close(); channel.onclose?.({ code: 1000 }) },
  }
  const fail = reason => { channel.onmessage?.({ data: JSON.stringify({ protocol: 2, type: 'error', reason }) }); channel.close() }
  pc.ondatachannel = event => {
    if (dc) { event.channel.close(); return }
    dc = event.channel
    dc.onopen = () => { channel.readyState = 1; channel.onopen?.({}); dc.send(JSON.stringify({ protocol: 2, type: 'hello', token: offer.token })) }
    dc.onmessage = event => {
      if (typeof event.data !== 'string' || event.data.length > MAX) { fail('Invalid host packet'); return }
      channel.onmessage?.({ data: event.data })
    }
    dc.onclose = () => fail('Instructor disconnected; pair again to restore the session')
    dc.onerror = () => fail('Peer connection error')
  }
  pc.onconnectionstatechange = () => {
    if (['failed','disconnected'].includes(pc.connectionState)) fail('Peer connection lost; pair again')
  }
  queueMicrotask(async () => {
    try {
      await pc.setRemoteDescription(offer.description)
      await pc.setLocalDescription(await pc.createAnswer())
      const answer = await description(pc)
      if (!closed) onAnswer(JSON.stringify({ ...offer, description: answer }))
    } catch (error) { fail(error.message) }
  })
  return channel
}
