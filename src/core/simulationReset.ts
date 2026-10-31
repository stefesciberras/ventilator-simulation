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

/**
 * Resetting the simulator is deliberately independent of the live session lifecycle.
 * Session/invite parameters must survive so an instructor remains in the same room and
 * candidates keep the same session key while the product runtime is reconstructed.
 */
function clearScenarioLaunchParameters() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('scenario')
  url.searchParams.delete('assignment')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

export async function resetSimulation(productLabel: string) {
  if (resetInProgress || typeof window === 'undefined') return
  resetInProgress = true
  try {
    // Product-owned reset handlers may perform immediate in-memory cleanup. They must not
    // end/leave the teaching session; session teardown belongs exclusively to End session.
    await Promise.allSettled([...handlers].map((handler) => Promise.resolve(handler())))
    try {
      const actionRuntime = await import('../edusim/actions/ActionRuntime')
      actionRuntime.clearActionRuntime()
      actionRuntime.clearActionRuntimeLog()
    } catch {
      // MV does not depend on ActionRuntime; failure here must not block reset.
    }

    // Retire the current scenario and product state, but preserve sessionStorage/local
    // recovery metadata used by the live teaching/simulation connection.
    clearProductPersistence(productLabel)
    clearScenarioLaunchParameters()

    // Reconstruct the product from its defaults. The existing session hook resumes the
    // same instructor/candidate room and therefore retains its session id/key.
    window.location.reload()
  } finally {
    resetInProgress = false
  }
}
