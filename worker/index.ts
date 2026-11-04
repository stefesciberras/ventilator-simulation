import { sessionV2Readiness } from './sessionV2Readiness.mjs'
import { decodeV2WebSocketSecret } from '../src/session-v2/websocketAuth.mjs'
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

    if (url.pathname === '/api/session-v2/status') {
      // Public diagnostics contain NO credential values or token-derived
      // information. Feature remains disabled until all requirements exist.
      return Response.json(sessionV2Readiness(env), {
        headers: { 'cache-control': 'no-store' },
      })
    }

    if (url.pathname === '/api/session-v2/ws') {
      // This opt-in gateway must not be enabled until secrets and
      // Cloudflare Durable Object binding are configured explicitly.
      if (!sessionV2Readiness(env).ready) {
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
      const offeredProtocols = (request.headers.get('Sec-WebSocket-Protocol') ?? '')
        .split(',').map(value => value.trim())
      // Browser clients require a selected offered subprotocol in the 101
      // response. Never echo the credential-bearing protocol in the response.
      if (!offeredProtocols.includes('loppjusim-v2')) {
        return new Response('Missing loppjusim-v2 protocol', { status: 400 })
      }
      const presented = decodeV2WebSocketSecret(request.headers.get('Sec-WebSocket-Protocol')) ?? ''
      const role = tokenEquals(presented, env.SESSION_V2_INSTRUCTOR_TOKEN) ? 'instructor'
        : tokenEquals(presented, env.SESSION_V2_CANDIDATE_TOKEN) ? 'candidate' : null
      if (!role) return new Response('Unauthorized', { status: 401 })
      const headers = new Headers(request.headers)
      // Remove untrusted role headers and substitute identity assigned by
      // the Worker after verification. DO binding cannot be called directly.
      headers.set('x-v2-verified-role', role)
      headers.set('x-v2-session-id', sessionId)
      headers.set('x-v2-selected-protocol', 'loppjusim-v2')
      // Strip the credential and forward only the public protocol so the
      // Durable Object can negotiate it without exposing the secret.
      headers.set('Sec-WebSocket-Protocol', 'loppjusim-v2')
      // Preserve the original Worker WebSocket upgrade request, including
      // runtime-specific handshake state, when creating the internal request.
      const internalRequest = new Request(request, { headers })
      const id = env.SESSION_V2_ROOMS.idFromName(sessionId)
      try {
        return await env.SESSION_V2_ROOMS.get(id).fetch(internalRequest)
      } catch (error) {
        // Never log a credential, request headers or the encoded protocol.
        console.error('session-v2 durable-object upgrade failed',
          error instanceof Error ? error.name : 'unknown-error')
        return new Response('Session authority unavailable', { status: 503 })
      }
    }

    return new Response(null, { status: 404 })
  },
}
