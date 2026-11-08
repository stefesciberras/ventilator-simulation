import assert from 'node:assert/strict'
import { LocalPairingRoom } from '../worker/localPairing.mjs'
import { parsePairing } from '../src/session-v2/peerSession.mjs'
import { createAutomaticInvitation, createAutomaticCandidateTransport, parseCandidateLink } from '../src/session-v2/automaticPairing.mjs'
const owner = 'a'.repeat(64), candidate = 'b'.repeat(64)
const offer = JSON.stringify({ protocol: 2, sessionId: 'test-session', token: 't'.repeat(36), description: { type: 'offer', sdp: 'v=0' } })
const answer = JSON.stringify({ ...JSON.parse(offer), description: { type: 'answer', sdp: 'v=0' } })
let value, alarm
const state = { blockConcurrencyWhile: fn => fn(), storage: {
  get: async () => value, put: async (_, v) => { value = v }, setAlarm: async v => { alarm = v }, deleteAll: async () => { value = undefined },
} }
const room = new LocalPairingRoom(state)
const req = (method, token, body) => room.fetch(new Request('https://test/api/local-pairing/id', { method, headers: { Authorization: `Bearer ${token}` }, body }))
assert.throws(() => parsePairing(offer, 'answer'), /Expected an answer/)
assert.throws(() => parsePairing('{', 'offer'), /Incomplete or damaged/)
assert.throws(() => parsePairing('', 'offer'), /complete offer/)
assert.throws(() => parsePairing('null', 'offer'), /Invalid pairing/)
assert.equal(parsePairing('```json\n'+offer+'\n```', 'offer').sessionId, 'test-session')
assert.equal((await req('POST', owner, JSON.stringify({ candidate, offer }))).status, 200)
assert(alarm > Date.now())
assert.equal((await req('POST', owner, JSON.stringify({ candidate, offer }))).status, 409)
assert.equal((await req('GET', 'c'.repeat(64))).status, 403)
assert.deepEqual(await (await req('GET', owner)).json(), { answer: null })
assert.deepEqual(await (await req('GET', candidate)).json(), { offer })
assert.equal((await req('PUT', owner, answer)).status, 405)
assert.equal((await req('DELETE', candidate)).status, 405)
assert.equal((await req('PUT', candidate, answer.replace('test-session', 'wrong-session'))).status, 400)
assert.equal((await req('PUT', candidate, answer)).status, 200)
assert.equal((await req('PUT', candidate, answer)).status, 409)
assert.deepEqual(await (await req('GET', owner)).json(), { answer })
assert.equal((await req('DELETE', owner)).status, 200)
assert.equal((await req('GET', candidate)).status, 410)
await room.alarm(); assert.equal(value, undefined)
await req('POST', owner, JSON.stringify({ candidate, offer })); value.expires = Date.now() - 1
assert.equal((await req('GET', owner)).status, 410)
// Exercise actual automatic invitation client against the mailbox, including cleanup.
value = undefined
const originalFetch = globalThis.fetch, originalLocation = globalThis.location
try {
  globalThis.location = new URL('https://test/anaesth')
  globalThis.fetch = async (url, options) => room.fetch(new Request(new URL(url, location.href), options))
  let accepted, resolveAccepted
  const completion = new Promise(resolve => { resolveAccepted = resolve })
  const controller = new AbortController()
  const link = await createAutomaticInvitation(offer, async text => { accepted = text; resolveAccepted() }, () => {}, controller.signal)
  const parsed = parseCandidateLink(link)
  assert.equal(parsed.token, value.candidate)
  assert.throws(() => parseCandidateLink(link.replace('https://test', 'https://evil')), /this site/)
  assert.equal((await req('PUT', parsed.token, answer)).status, 200)
  await Promise.race([completion, new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('automatic exchange timed out')), 4000); timer.unref() })])
  assert.equal(accepted, answer)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(value.expires, 0)
  controller.abort()
  // Candidate downloads offer, uploads answer and forwards channel events.
  value = undefined
  await req('POST', owner, JSON.stringify({ candidate, offer }))
  const previousRtc = globalThis.RTCPeerConnection
  let rtc
  globalThis.RTCPeerConnection = class {
    constructor() { rtc = this; this.iceGatheringState = 'complete' }
    async setRemoteDescription(desc) { assert.equal(desc.type, 'offer') }
    async createAnswer() { return { type: 'answer', sdp: 'v=0' } }
    async setLocalDescription(desc) { this.localDescription = { toJSON: () => desc } }
    close() {}
  }
  try {
    const transport = createAutomaticCandidateTransport(`https://test/anaesth#local-pair=${'d'.repeat(64)}.${candidate}`)
    let packet
    transport.onmessage = event => { packet = JSON.parse(event.data) }
    for (let n = 0; n < 20 && !value.answer; n++) await new Promise(resolve => setTimeout(resolve, 5))
    assert.equal(value.answer, answer)
    const dc = { readyState: 'open', bufferedAmount: 0, send(raw) { this.sent = JSON.parse(raw) }, close() {} }
    rtc.ondatachannel({ channel: dc }); dc.onopen()
    assert.equal(transport.readyState, 1)
    assert.equal(dc.sent.type, 'hello')
    dc.onmessage({ data: JSON.stringify({ protocol: 2, type: 'welcome' }) })
    assert.equal(packet.type, 'welcome')
    transport.close(); assert.equal(transport.readyState, 3)
  } finally { globalThis.RTCPeerConnection = previousRtc }

  globalThis.fetch = async () => { throw TypeError('Failed to fetch') }
  let reason
  const unavailable = createAutomaticCandidateTransport(`https://test/anaesth#local-pair=${'d'.repeat(64)}.${candidate}`)
  unavailable.onmessage = event => { reason = JSON.parse(event.data).reason }
  for (let n = 0; n < 20 && !reason; n++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.match(reason, /Candidate links require internet/)
  assert.match(reason, /manual offer and answer/)
  assert.equal(unavailable.readyState, 3)
} finally { globalThis.fetch = originalFetch; globalThis.location = originalLocation }
console.log('Automatic pairing exchange, capability separation, single-use, expiry and diagnostic regressions passed')
