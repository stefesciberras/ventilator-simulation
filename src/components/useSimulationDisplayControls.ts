import { useCallback, useEffect } from 'react'
import type { TeachingRole } from '../teaching'
import { useTeachingDisplaySync } from '../teaching'

const SIMULATOR_LASER_LOCK_ATTRIBUTE = 'data-edusim-simulator-laser-active'

function setSimulatorLaserInteractionLock(active: boolean) {
  if (typeof document === 'undefined') return
  if (active) document.documentElement.setAttribute(SIMULATOR_LASER_LOCK_ATTRIBUTE, 'true')
  else document.documentElement.removeAttribute(SIMULATOR_LASER_LOCK_ATTRIBUTE)
}

interface UseSimulationDisplayControlsOptions<TSnapshot> {
  role: TeachingRole
  sessionId: string | null
  frozen: boolean
  setFrozen: (frozen: boolean) => void
  frozenSnapshot: TSnapshot | null
  setFrozenSnapshot: (snapshot: TSnapshot | null) => void
  captureSnapshot: () => TSnapshot
  laserEnabled: boolean
  setLaserEnabled: (enabled: boolean) => void
  onFreezeActivated?: () => void
}

/**
 * Product-neutral freeze/laser authority for simulator displays.
 *
 * Products own the shape/rendering of a frozen snapshot. Core owns local vs
 * instructor-shared authority, candidate locking, teaching-session laser freeze
 * behaviour, and synchronization over the EDUSIM teaching display bus.
 */
export function useSimulationDisplayControls<TSnapshot>({
  role,
  sessionId,
  frozen,
  setFrozen,
  frozenSnapshot,
  setFrozenSnapshot,
  captureSnapshot,
  laserEnabled,
  setLaserEnabled,
  onFreezeActivated,
}: UseSimulationDisplayControlsOptions<TSnapshot>) {
  const freezeLocal = useCallback((active: boolean) => {
    if (active) {
      if (!frozenSnapshot) setFrozenSnapshot(captureSnapshot())
      if (!frozen) onFreezeActivated?.()
      setFrozen(true)
    } else {
      setFrozen(false)
      setFrozenSnapshot(null)
    }
  }, [captureSnapshot, frozen, frozenSnapshot, onFreezeActivated, setFrozen, setFrozenSnapshot])

  const displaySync = useTeachingDisplaySync(role, sessionId, {
    localLaserEnabled: laserEnabled,
    onCandidateFrozenChange: freezeLocal,
    onCandidateLaserChange: setLaserEnabled,
  })

  useEffect(() => {
    setSimulatorLaserInteractionLock(role !== 'candidate' && laserEnabled)
  }, [laserEnabled, role])

  useEffect(() => () => {
    setSimulatorLaserInteractionLock(false)
  }, [])

  const setSharedFrozen = useCallback((active: boolean) => {
    if (role !== 'instructor' || !sessionId) return
    freezeLocal(active)
    displaySync.setFrozen(active)
  }, [displaySync, freezeLocal, role, sessionId])

  const toggleFreeze = useCallback(() => {
    if (role === 'candidate' && displaySync.state.frozen) return
    const next = !frozen
    freezeLocal(next)
    if (role === 'instructor' && sessionId && displaySync.state.frozen) displaySync.setFrozen(next)
  }, [displaySync, freezeLocal, frozen, role, sessionId])

  const toggleLaser = useCallback(() => {
    if (role === 'candidate') return
    const next = !laserEnabled
    const sharedTeachingLaser = role === 'instructor' && Boolean(sessionId)

    // Claim or release the interaction lock synchronously with the button action.
    // Do not wait for React to render the active laser layer before mobile swipe
    // recognition knows that the display belongs to the laser.
    setSimulatorLaserInteractionLock(next)

    if (next && sharedTeachingLaser && !frozen) {
      freezeLocal(true)
      displaySync.setFrozen(true)
    }
    setLaserEnabled(next)
    if (sharedTeachingLaser) displaySync.setLaserEnabled(next)
  }, [displaySync, freezeLocal, frozen, laserEnabled, role, sessionId, setLaserEnabled])

  return {
    sharedState: displaySync.state,
    sharedFrozen: displaySync.state.frozen,
    sharedLaserEnabled: displaySync.state.laserEnabled,
    freezeDisabled: role === 'candidate' && displaySync.state.frozen,
    laserDisabled: role === 'candidate',
    freezeLocal,
    setSharedFrozen,
    toggleFreeze,
    toggleLaser,
  }
}
