import assert from 'node:assert/strict'
import { encodeV2WebSocketSecret, decodeV2WebSocketSecret } from '../src/session-v2/websocketAuth.mjs'

// WebSocket subprotocols must be HTTP tokens; punctuation in source secrets
// must never appear directly in the constructor's protocols argument.
for (const secret of [
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef',
  '-ilLoB*&UX&g?*e(t6)LkPl3>lw)n?IQ',
  'ab c,d;={}/"\\<>()[]?@:',
  '🔐secure-éü-密码-012345678901234567890123456789',
]) {
  const encoded = encodeV2WebSocketSecret(secret)
  assert.match(encoded, /^v2hex\.[0-9a-f]+$/, 'encoded subprotocol is RFC token-safe')
  assert.equal(decodeV2WebSocketSecret(encoded), secret, 'round-trip UTF-8 bytes')
  assert.equal(decodeV2WebSocketSecret(`loppjusim, ${encoded}`), secret, 'multiple offered subprotocols')
}
for (const protocol of [
  null, '', 'v2auth.raw', 'v2hex.', 'v2hex.f', 'v2hex.gg',
  'v2hex.12 34', 'v2hex.' + '00'.repeat(257), 'v2hex.ffff',
]) {
  assert.equal(decodeV2WebSocketSecret(protocol), null, 'malformed UTF-8 or protocol rejected')
}
assert.throws(() => encodeV2WebSocketSecret(''), /invalid-test-secret/)
assert.throws(() => encodeV2WebSocketSecret('a'.repeat(257)), /invalid-test-secret/)
console.log('Session v2 Cloudflare WebSocket subprotocol encoding regressions passed')
