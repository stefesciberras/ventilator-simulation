import { createAutomaticInvitation } from './automaticPairing.mjs'
import { createInstructorPeer } from './peerSession.mjs'
import { createLocalSessionHost } from './localSessionHost.mjs'

// In-process implementation of the preview's message channel. No network socket.
export function createLocalSessionTransport(sessionId) {
  let invitation
  let peer
  let host, timer, closed = false
  const channel = {
    readyState: 0, protocol: 'loppjusim-v2',
    onopen: null, onmessage: null, onclose: null, onerror: null,
    async createOffer(status) {
      if (!host || closed) throw Error('Connect a local instructor session first')
      invitation?.abort(); peer?.close(); peer = createInstructorPeer(host, sessionId, status)
      return peer.offer()
    },
    async createInvitation(status) {
      const offer = await channel.createOffer(status)
      if (closed) throw Error('Instructor disconnected; connect again')
      const invitedPeer = peer
      invitation = new AbortController()
      return createAutomaticInvitation(offer, text => invitedPeer.accept(text), status, invitation.signal)
    },
    async acceptAnswer(text) { if (!peer) throw Error('Create an offer first'); await peer.accept(text) },
    send(raw) { void receive(raw).catch(fail) },
    close() {
      if (closed) return
      closed = true; channel.readyState = 3
      clearInterval(timer); invitation?.abort(); peer?.close(); host?.close()
      document.removeEventListener('visibilitychange', visibility)
      channel.onclose?.({ code: 1000 })
    },
  }
  const emit = (type, extra) => { if (!closed) channel.onmessage?.({ data: JSON.stringify({ protocol: 2, type, ...extra }) }) }
  const fail = error => { emit('error', { reason: error.message }); channel.close() }
  const visibility = () => {
    if (document.hidden && host) void host.controlClock({ ...host.current.clock, running: false }).catch(fail)
  }
  const receive = async raw => {
    if (!host || closed) return
    const message = JSON.parse(raw)
    if (message.protocol !== 2) throw Error('invalid-protocol')
    if (message.type === 'command') {
      const receipt = await host.submit(message.command)
      emit('receipt', { requestId: message.requestId, receipt })
    } else if (message.type === 'clock.control') {
      await host.controlClock({ running: message.running, speed: message.speed })
      emit('clock-receipt', { requestId: message.requestId, accepted: true, clock: host.current.clock })
    } else if (message.type === 'resync') emit('snapshot', host.current)
  }
  // Let the caller register listeners before opening.
  queueMicrotask(async () => {
    try {
      host = await createLocalSessionHost({ sessionId, onSnapshot: value => { emit('snapshot', value); peer?.publish(value) } })
      if (closed) { host.close(); return }
      channel.readyState = 1; channel.onopen?.({})
      emit('welcome', host.current)
      document.addEventListener('visibilitychange', visibility)
      const schedule = () => { timer = setTimeout(async () => {
        try { await host.pulse(); if (!closed) schedule() } catch (error) { fail(error) }
      }, 1000) }
      schedule()
    } catch (error) { fail(error) }
  })
  return channel
}
