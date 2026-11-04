import assert from 'node:assert/strict'
import { sessionV2Readiness } from '../worker/sessionV2Readiness.mjs'

const instructor = 'i'.repeat(40)
const candidate = 'c'.repeat(40)
const configured = { SESSION_V2_EXPERIMENTAL: '1', SESSION_V2_ROOMS: {},
  SESSION_V2_INSTRUCTOR_TOKEN: instructor, SESSION_V2_CANDIDATE_TOKEN: candidate }
assert.deepEqual(sessionV2Readiness(configured), { protocol: 2, ready: true, reason: 'ready' })
assert.equal(sessionV2Readiness({ ...configured, SESSION_V2_EXPERIMENTAL: '0' }).reason, 'experimental-disabled')
assert.equal(sessionV2Readiness({ ...configured, SESSION_V2_ROOMS: null }).reason, 'durable-object-binding-missing')
assert.equal(sessionV2Readiness({ ...configured, SESSION_V2_CANDIDATE_TOKEN: instructor }).reason, 'test-credentials-not-configured')
assert.equal(sessionV2Readiness({ ...configured, SESSION_V2_INSTRUCTOR_TOKEN: 'short' }).ready, false)
assert.equal(sessionV2Readiness({}).ready, false)
const sanitized = JSON.stringify(sessionV2Readiness(configured))
assert.ok(!sanitized.includes(instructor) && !sanitized.includes(candidate))
console.log('Cloudflare Session v2 nonsecret readiness diagnostics passed')
