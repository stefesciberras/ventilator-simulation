type SimulationResetHandler = () => void | Promise<void>

const handlers = new Set<SimulationResetHandler>()
let resetInProgress = false

export function registerSimulationResetHandler(handler: SimulationResetHandler) {
  handlers.add(handler)
  return () => handlers.delete(handler)
}

function persistencePrefixesFor(productLabel: string) {
  if (productLabel === 'LoppjuSIM-MV') return ['edusim.mv.', 'edusim.eduvent.', 'eduvent.']
  if (productLabel === 'LoppjuSIM-Anaesth') return ['edusim.anaesth.', 'edusim.edumon-ana.']
  if (productLabel === 'LoppjuSIM-ICU') return ['edusim.icu.', 'edusim.edumon-icu.']
  return []
}

function clearProductPersistence(productLabel: string) {
  if (typeof window === 'undefined') return
  try {
    const prefixes = persistencePrefixesFor(productLabel)
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index)
      if (!key) continue
      if (prefixes.some((prefix) => key.startsWith(prefix))) window.localStorage.removeItem(key)
    }
    if (productLabel === 'LoppjuSIM-Anaesth' || productLabel === 'LoppjuSIM-ICU') {
      window.localStorage.removeItem('edumon.alarm-limits')
      window.localStorage.removeItem('edumon.patient-transition-seconds')
    }
    window.localStorage.removeItem(`loppjusim.scenario-runtime:${window.location.pathname}`)
  } catch {
    // Local persistence is best-effort; the in-memory handlers still reset the runtime.
  }
}

function clearLaunchParameters() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('session')
  url.searchParams.delete('mode')
  url.searchParams.delete('scenario')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

export async function resetSimulation(productLabel: string) {
  if (resetInProgress || typeof window === 'undefined') return
  resetInProgress = true
  try {
    await Promise.allSettled([...handlers].map((handler) => Promise.resolve(handler())))
    try {
      const actionRuntime = await import('../edusim/actions/ActionRuntime')
      actionRuntime.clearActionRuntime()
      actionRuntime.clearActionRuntimeLog()
    } catch {
      // MV does not depend on ActionRuntime; failure here must not block reset.
    }
    clearProductPersistence(productLabel)
    clearLaunchParameters()
    window.location.reload()
  } finally {
    resetInProgress = false
  }
}
