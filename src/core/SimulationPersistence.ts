import { normaliseSimulationProductId, toLegacyProductId, type LegacySimulationProductId, type SimulationProductId } from './SimulationProductAdapter'

export interface SimulationPersistence {
  key: (name: string) => string
  readJson: <T>(name: string, fallback: T, legacyKeys?: string[]) => T
  writeJson: <T>(name: string, value: T) => void
  readNumber: (name: string, fallback: number, legacyKeys?: string[]) => number
  writeNumber: (name: string, value: number) => void
  readString: (name: string, fallback: string, legacyKeys?: string[]) => string
  writeString: (name: string, value: string) => void
  remove: (name: string) => void
}

const isBrowser = () => typeof window !== 'undefined' && Boolean(window.localStorage)

export function createSimulationPersistence(productAlias: SimulationProductId | LegacySimulationProductId): SimulationPersistence {
  const productId = normaliseSimulationProductId(productAlias)
  if (!productId) throw new Error(`Unknown simulation product: ${productAlias}`)

  const prefix = `edusim.${productId}.`
  const legacyPrefix = `edusim.${toLegacyProductId(productId)}.`
  const key = (name: string) => `${prefix}${name}`
  const legacyProductKey = (name: string) => `${legacyPrefix}${name}`

  const readRaw = (name: string, legacyKeys: string[] = []) => {
    if (!isBrowser()) return null
    const currentKey = key(name)
    const current = window.localStorage.getItem(currentKey)
    if (current != null) return current

    const migrationKeys = [legacyProductKey(name), ...legacyKeys]
    for (const legacyKey of migrationKeys) {
      if (legacyKey === currentKey) continue
      const legacy = window.localStorage.getItem(legacyKey)
      if (legacy == null) continue
      try { window.localStorage.setItem(currentKey, legacy) } catch { /* best-effort migration */ }
      return legacy
    }
    return null
  }

  return {
    key,
    readJson<T>(name: string, fallback: T, legacyKeys: string[] = []) {
      const raw = readRaw(name, legacyKeys)
      if (raw == null) return fallback
      try { return JSON.parse(raw) as T } catch { return fallback }
    },
    writeJson<T>(name: string, value: T) {
      if (!isBrowser()) return
      try { window.localStorage.setItem(key(name), JSON.stringify(value)) } catch { /* optional persistence */ }
    },
    readNumber(name: string, fallback: number, legacyKeys: string[] = []) {
      const raw = readRaw(name, legacyKeys)
      if (raw == null) return fallback
      const parsed = Number(raw)
      return Number.isFinite(parsed) ? parsed : fallback
    },
    writeNumber(name: string, value: number) {
      if (!isBrowser()) return
      try { window.localStorage.setItem(key(name), String(value)) } catch { /* optional persistence */ }
    },
    readString(name: string, fallback: string, legacyKeys: string[] = []) {
      return readRaw(name, legacyKeys) ?? fallback
    },
    writeString(name: string, value: string) {
      if (!isBrowser()) return
      try { window.localStorage.setItem(key(name), value) } catch { /* optional persistence */ }
    },
    remove(name: string) {
      if (!isBrowser()) return
      try { window.localStorage.removeItem(key(name)) } catch { /* optional persistence */ }
    },
  }
}
