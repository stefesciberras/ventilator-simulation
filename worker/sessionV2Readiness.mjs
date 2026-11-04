/**
 * Nonsecret configuration readiness for experimental Session Engine v2.
 * Never return or log a test credential, even when configuration is incomplete.
 */
export function sessionV2Readiness(env) {
  const enabled = env?.SESSION_V2_EXPERIMENTAL === '1'
  const bound = Boolean(env?.SESSION_V2_ROOMS)
  const instructor = env?.SESSION_V2_INSTRUCTOR_TOKEN
  const candidate = env?.SESSION_V2_CANDIDATE_TOKEN
  const credentialsConfigured = typeof instructor === 'string' &&
    instructor.length >= 32 && typeof candidate === 'string' &&
    candidate.length >= 32 && instructor !== candidate
  return {
    protocol: 2,
    ready: enabled && bound && credentialsConfigured,
    reason: !enabled ? 'experimental-disabled'
      : !bound ? 'durable-object-binding-missing'
      : !credentialsConfigured ? 'test-credentials-not-configured'
      : 'ready',
  }
}
