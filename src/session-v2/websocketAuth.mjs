/**
 * Encode experimental WebSocket test credentials into a valid subprotocol token.
 * Hex encoding is transport encoding, NOT encryption. Use only via WSS and
 * do not treat a credential embedded in handshake metadata as a production
 * authentication design.
 */
const prefix = 'v2hex.'
const maxSecretBytes = 256
export function encodeV2WebSocketSecret(secret) {
  if (typeof secret !== 'string') throw Error('invalid-test-secret')
  const bytes = new TextEncoder().encode(secret)
  if (!bytes.length || bytes.length > maxSecretBytes) throw Error('invalid-test-secret')
  return prefix + [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function decodeV2WebSocketSecret(protocolHeader) {
  if (typeof protocolHeader !== 'string') return null
  const protocols = protocolHeader.split(',').map(value => value.trim())
  const candidate = protocols.find(value => value.startsWith(prefix))
  if (!candidate) return null
  const hex = candidate.slice(prefix.length)
  if (hex.length < 2 || hex.length > maxSecretBytes * 2 ||
      hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) return null
  try {
    const bytes = Uint8Array.from(hex.match(/.{2}/g), pair => Number.parseInt(pair, 16))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}
