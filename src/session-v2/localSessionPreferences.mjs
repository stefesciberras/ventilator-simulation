const key = 'loppjusim-v2-local-selection'
export function readLocalSelection(storage) {
  try {
    storage ??= globalThis.localStorage
    const value = JSON.parse(storage.getItem(key))
    if (['local', 'peer'].includes(value?.mode) && /^[a-zA-Z0-9_-]{3,80}$/.test(value.sessionId)) return value
  } catch { /* Storage can be unavailable in private/restricted browsers. */ }
  return null
}
export function saveLocalSelection(mode, sessionId, storage) {
  try {
    storage ??= globalThis.localStorage
    if (['local', 'peer'].includes(mode) && /^[a-zA-Z0-9_-]{3,80}$/.test(sessionId)) storage.setItem(key, JSON.stringify({ mode, sessionId }))
  } catch { /* Checkpoints remain owned by IndexedDB; preferences are optional. */ }
}
