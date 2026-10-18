import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'eduvent.keep-screen-awake'

interface WakeLockSentinelLike {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

function loadPreference() {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(STORAGE_KEY) !== 'false'
}

export function useScreenWakeLock() {
  const [enabled, setEnabledState] = useState(loadPreference)
  const [active, setActive] = useState(false)
  const supported = typeof navigator !== 'undefined' && Boolean((navigator as WakeLockNavigator).wakeLock?.request)
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)

  const release = useCallback(async () => {
    const sentinel = sentinelRef.current
    sentinelRef.current = null
    setActive(false)
    if (!sentinel || sentinel.released) return
    try { await sentinel.release() } catch { /* browser may already have released it */ }
  }, [])

  const request = useCallback(async () => {
    if (!enabled || !supported || document.visibilityState !== 'visible' || sentinelRef.current) return
    try {
      const sentinel = await (navigator as WakeLockNavigator).wakeLock!.request('screen')
      sentinelRef.current = sentinel
      setActive(true)
      sentinel.addEventListener('release', () => {
        if (sentinelRef.current === sentinel) sentinelRef.current = null
        setActive(false)
      })
    } catch {
      setActive(false)
    }
  }, [enabled, supported])

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value)
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, String(value))
  }, [])

  useEffect(() => {
    if (!enabled) {
      void release()
      return
    }
    void request()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void request()
      else void release()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void release()
    }
  }, [enabled, release, request])

  return { enabled, setEnabled, supported, active }
}
