/**
 * Keep gateway failure logs useful without exposing WebSocket credentials,
 * URLs, or opaque protocol values that may be present in runtime errors.
 */
export function describeSessionV2GatewayError(error, secrets = []) {
  const name = error instanceof Error ? error.name : 'unknown-error'
  let message = error instanceof Error ? error.message : String(error ?? '')

  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length > 0) {
      message = message.split(secret).join('[redacted]')
    }
  }

  message = message
    .replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/gi, '[redacted-url]')
    .replace(/((?:authorization|token|secret|sec-websocket-protocol)\s*[:=]\s*)[^\s,;]+/gi,
      '$1[redacted]')
    .replace(/\b[A-Za-z0-9+/_=-]{32,}\b/g, '[redacted-value]')

  return { name, message: message.slice(0, 240) }
}
