import { LOPPJUSIM_SIMULATION_RESET_EVENT } from './platformEvents'

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
 * Session/invite parameters survive so the same room, participants and session key stay
 * connected while scenario and product state are reset in memory.
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
    // Scenario teardown is a separate lifecycle from session teardown. Runtime panels listen
    // for this event and call their real stop/close path without ending the live room.
    window.dispatchEvent(new Event(LOPPJUSIM_SIMULATION_RESET_EVENT))

    // Remove active pharmacology/event effects before restoring the product baseline so the
    // freshly reset state is not immediately modified by a lingering action runtime.
    try {
      const actionRuntime = await import('../edusim/actions/ActionRuntime')
      actionRuntime.clearActionRuntime()
      actionRuntime.clearActionRuntimeLog()
    } catch {
      // MV does not depend on ActionRuntime; failure here must not block reset.
    }

    // Product-owned handlers restore physiology/device state in memory. They must never
    // end/leave the teaching session; session teardown belongs exclusively to End session.
    await Promise.allSettled([...handlers].map((handler) => Promise.resolve(handler())))

    // Clear durable simulator/scenario state only. Session recovery data and transport
    // ownership are intentionally untouched, so there is no disconnect/rejoin cycle.
    clearProductPersistence(productLabel)
    clearScenarioLaunchParameters()
  } finally {
    resetInProgress = false
  }
}
