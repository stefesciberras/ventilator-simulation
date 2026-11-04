import { SessionV2Room } from './sessionV2Room.mjs'
export { SessionV2Room } from './sessionV2Room.mjs'

type V2Env = {
  SESSION_V2_ROOMS?: {
    idFromName: (name: string) => unknown
    get: (id: unknown) => { fetch: (request: Request) => Promise<Response> }
  }
  SESSION_V2_EXPERIMENTAL?: string
  SESSION_V2_INSTRUCTOR_TOKEN?: string
  SESSION_V2_CANDIDATE_TOKEN?: string
}

const tokenEquals = (left: string, right: string): boolean => {
  // Compare digests to avoid a length-dependent secret comparison.
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

export default {
  async fetch(request: Request, env: V2Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/health') {
      return Response.json({
        ok: true,
        service: 'ventilator-simulation',
        version: '0.1.0',
      })
    }

    if (url.pathname === '/api/session-v2/ws') {
      // This opt-in gateway must not be enabled until secrets and
      // Cloudflare Durable Object binding are configured explicitly.
      if (env.SESSION_V2_EXPERIMENTAL !== '1' || !env.SESSION_V2_ROOMS ||
          !env.SESSION_V2_INSTRUCTOR_TOKEN || env.SESSION_V2_INSTRUCTOR_TOKEN.length < 32 ||
          !env.SESSION_V2_CANDIDATE_TOKEN || env.SESSION_V2_CANDIDATE_TOKEN.length < 32 ||
          env.SESSION_V2_CANDIDATE_TOKEN === env.SESSION_V2_INSTRUCTOR_TOKEN) {
        return new Response('Not found', { status: 404 })
      }
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('WebSocket required', { status: 426 })
      }
      const sessionId = url.searchParams.get('sessionId') ?? ''
      if (!/^[a-zA-Z0-9_-]{3,80}$/.test(sessionId)) return new Response('Invalid session', { status: 400 })

      // Browser WebSocket APIs cannot set Authorization headers. Test
      // secrets travel in the Sec-WebSocket-Protocol header over WSS,
      // never in query strings or persistent URLs.
      const protocols = (request.headers.get('Sec-WebSocket-Protocol') ?? '')
        .split(',').map(value => value.trim())
      const presented = protocols.find(value => value.startsWith('v2auth.'))?.slice(7) ?? ''
      const role = tokenEquals(presented, env.SESSION_V2_INSTRUCTOR_TOKEN) ? 'instructor'
        : tokenEquals(presented, env.SESSION_V2_CANDIDATE_TOKEN) ? 'candidate' : null
      if (!role) return new Response('Unauthorized', { status: 401 })
      const headers = new Headers(request.headers)
      // Remove untrusted role headers and substitute identity assigned by
      // the Worker after verification. DO binding cannot be called directly.
      headers.set('x-v2-verified-role', role)
      headers.set('x-v2-session-id', sessionId)
      headers.delete('Sec-WebSocket-Protocol')
      const internalRequest = new Request(request.url, { method: 'GET', headers })
      const id = env.SESSION_V2_ROOMS.idFromName(sessionId)
      return env.SESSION_V2_ROOMS.get(id).fetch(internalRequest)
    }

    return new Response(null, { status: 404 })
  },
}
