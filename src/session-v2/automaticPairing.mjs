import { createCandidatePeerTransport } from './peerSession.mjs'
const key = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
export function parseCandidateLink(text) {
  const url = new URL(text, location.href)
  if (url.origin !== location.origin) throw Error('Use a candidate link from this site')
  const match = /^#local-pair=([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(url.hash)
  if (!match) throw Error('Invalid candidate link; copy the complete link')
  return { id: match[1], token: match[2] }
}
async function request(id, token, method = 'GET', body, signal) {
  const response = await fetch(`/api/local-pairing/${id}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000), cache: 'no-store', credentials: 'omit' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw Error(data.error || 'Automatic pairing unavailable. Check internet access or use manual pairing.')
  return data
}
export async function createAutomaticInvitation(offer, accept, status, signal) {
  const id = key(), owner = key(), token = key()
  const { expires } = await request(id, owner, 'POST', JSON.stringify({ offer, candidate: token }), signal)
  const url = new URL(location.href); url.searchParams.set('sessionV2Preview', '1'); url.hash = `local-pair=${id}.${token}`
  const cleanup = () => { void request(id, owner, 'DELETE').catch(() => {}) }
  signal.addEventListener('abort', cleanup, { once: true })
  void (async () => {
    try {
      while (!signal.aborted && Date.now() < expires) {
        const { answer } = await request(id, owner, 'GET', undefined, signal)
        if (answer) { await accept(answer); if (!signal.aborted) status('Answer received automatically; connecting…'); return }
        await new Promise(resolve => { const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }; const timer = setTimeout(done, 1200); signal.addEventListener('abort', done, { once: true }) })
      }
      if (!signal.aborted) status('Candidate link expired; create a new link')
    } catch (error) { if (!signal.aborted) status(error.message) }
    finally { signal.removeEventListener('abort', cleanup); cleanup() }
  })()
  return url.href
}
export function createAutomaticCandidateTransport(link) {
  const { id, token } = parseCandidateLink(link)
  const controller = new AbortController()
  let peer, closed = false
  const channel = {
    readyState: 0, protocol: 'loppjusim-v2', onopen: null, onmessage: null, onclose: null, onerror: null,
    send(raw) { peer?.send(raw) },
    close() { if (closed) return; closed = true; controller.abort(); peer?.close(); channel.readyState = 3; channel.onclose?.({ code: 1000 }) },
  }
  const fail = error => { if (!closed) { channel.onmessage?.({ data: JSON.stringify({ protocol: 2, type: 'error', reason: error.message }) }); channel.close() } }
  queueMicrotask(async () => {
    try {
      const { offer } = await request(id, token, 'GET', undefined, controller.signal)
      if (closed) return
      peer = createCandidatePeerTransport(offer, answer => { void request(id, token, 'PUT', answer, controller.signal).catch(fail) })
      peer.onopen = event => { channel.readyState = 1; channel.onopen?.(event) }
      peer.onmessage = event => channel.onmessage?.(event)
      peer.onclose = () => channel.close()
      peer.onerror = () => channel.onerror?.()
    } catch (error) { fail(error) }
  })
  return channel
}
