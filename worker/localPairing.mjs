import { parsePairing } from '../src/session-v2/peerSession.mjs'
const KEY = /^[a-f0-9]{64}$/
const reply = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
async function boundedText(request) {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let bytes = 0, text = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) return text + decoder.decode()
    bytes += chunk.value.byteLength
    if (bytes > 270000) { await reader.cancel(); return null }
    text += decoder.decode(chunk.value, { stream: true })
  }
}
// Ephemeral connection descriptions only. Never hosts simulation state or commands.
export class LocalPairingRoom {
  constructor(state) { this.state = state }
  async fetch(request) {
    return this.state.blockConcurrencyWhile(async () => {
      const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
      if (!KEY.test(token)) return reply({ error: 'Invalid pairing credential' }, 401)
      let room = await this.state.storage.get('pairing')
      if (room && room.expires <= Date.now()) return reply({ error: 'Pairing link expired; create a new link' }, 410)
      if (request.method === 'POST') {
        if (room) return reply({ error: 'Pairing already exists' }, 409)
        const raw = await boundedText(request)
        if (raw === null) return reply({ error: 'Pairing too large' }, 413)
        let data
        try { data = JSON.parse(raw); parsePairing(data.offer, 'offer'); if (!KEY.test(data.candidate)) throw Error() }
        catch { return reply({ error: 'Invalid offer' }, 400) }
        room = { owner: token, candidate: data.candidate, offer: data.offer, expires: Date.now() + 300000 }
        await this.state.storage.put('pairing', room)
        await this.state.storage.setAlarm(room.expires)
        return reply({ expires: room.expires })
      }
      if (!room) return reply({ error: 'Pairing link unavailable; create a new link' }, 404)
      const owner = token === room.owner, candidate = token === room.candidate
      if (!owner && !candidate) return reply({ error: 'Invalid pairing credential' }, 403)
      if (request.method === 'DELETE' && owner) {
        await this.state.storage.put('pairing', { ...room, offer: null, answer: null, expires: 0 })
        return reply({ ok: true })
      }
      if (request.method === 'GET') return reply(owner ? { answer: room.answer ?? null } : { offer: room.offer })
      if (request.method === 'PUT' && candidate) {
        if (room.answer) return reply({ error: 'Link already used; ask for a new candidate link' }, 409)
        const raw = await boundedText(request)
        if (raw === null) return reply({ error: 'Pairing too large' }, 413)
        try {
          const answer = parsePairing(raw, 'answer'), offer = parsePairing(room.offer, 'offer')
          if (answer.sessionId !== offer.sessionId || answer.token !== offer.token) throw Error()
        } catch { return reply({ error: 'Answer does not match this pairing' }, 400) }
        await this.state.storage.put('pairing', { ...room, answer: raw })
        return reply({ ok: true })
      }
      return reply({ error: 'Method not allowed' }, 405)
    })
  }
  async alarm() { await this.state.storage.deleteAll() }
}
