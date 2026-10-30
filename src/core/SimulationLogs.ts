import { clearActionRuntimeLog } from '../edusim/actions/ActionRuntime'
import { clearScenarioLogs } from '../scenario-logger'
import { clearStandaloneSessionLog } from '../teaching/session/sessionLog'

const LOCAL_LOG_PRODUCT_IDS = ['eduvent', 'edumon-ana', 'edumon-icu'] as const

/**
 * Clears browser-local diagnostic/runtime/session logs for every LoppjuSIM simulator.
 * Shared Teaching/Simulation session audit entries stored in Supabase are intentionally
 * preserved; those are server-side session records rather than local diagnostics.
 */
export function clearAllLocalSimulationLogs(): void {
  clearScenarioLogs()
  clearActionRuntimeLog()
  for (const productId of LOCAL_LOG_PRODUCT_IDS) clearStandaloneSessionLog(productId)
}
