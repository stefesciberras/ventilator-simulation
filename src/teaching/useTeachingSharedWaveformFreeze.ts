import type { TeachingRole } from './types'
import { useTeachingDisplaySync } from './useTeachingDisplaySync'

/**
 * Compatibility wrapper retained for EDUVENT call sites while the shared display
 * core is adopted across EDUSIM products.
 */
export function useTeachingSharedWaveformFreeze(
  role: TeachingRole,
  sessionId: string | null,
  onCandidateState: (active: boolean) => void,
) {
  const display = useTeachingDisplaySync(role, sessionId, {
    onCandidateFrozenChange: onCandidateState,
  })
  return {
    active: display.state.frozen,
    setActive: display.setFrozen,
  }
}
