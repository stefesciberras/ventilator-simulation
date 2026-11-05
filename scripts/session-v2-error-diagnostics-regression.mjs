import assert from 'node:assert/strict'
import { describeSessionV2GatewayError } from '../worker/sessionV2ErrorDiagnostics.mjs'

const secret = 'instructor-test-secret-with-more-than-32-characters'
const diagnostic = describeSessionV2GatewayError(
  new Error(`failed for ${secret}; url=https://example.test/ws?token=${secret}; Sec-WebSocket-Protocol: ${secret}`),
  [secret],
)
assert.equal(diagnostic.name, 'Error')
assert.ok(!diagnostic.message.includes(secret), 'never include a configured credential')
assert.ok(!diagnostic.message.includes('https://'), 'never include a request URL')
assert.ok(diagnostic.message.length <= 240, 'bound diagnostic size')
assert.equal(describeSessionV2GatewayError('failure').name, 'unknown-error')
console.log('Session v2 gateway error diagnostics redact credentials and URLs')
