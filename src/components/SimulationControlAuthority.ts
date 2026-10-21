import type { SessionRole } from '../session/useTeachingSession'

export interface SimulationControlAuthority {
  controlledByInstructor: boolean
  pauseDisabled: boolean
  speedDisabled: boolean
  pauseTitle: string
  pauseAriaLabel: string
  speedTitle: string
}

export function simulationControlAuthority(role: SessionRole, simulationPaused: boolean): SimulationControlAuthority {
  const controlledByInstructor = role === 'candidate'
  const localPauseLabel = simulationPaused ? 'Resume whole simulation' : 'Pause whole simulation'
  const instructorPauseLabel = simulationPaused ? 'Simulation paused by instructor' : 'Simulation pause controlled by instructor'
  return {
    controlledByInstructor,
    pauseDisabled: controlledByInstructor,
    speedDisabled: controlledByInstructor,
    pauseTitle: controlledByInstructor ? instructorPauseLabel : localPauseLabel,
    pauseAriaLabel: controlledByInstructor ? instructorPauseLabel : localPauseLabel,
    speedTitle: controlledByInstructor ? 'Simulation speed controlled by instructor' : 'Simulation speed',
  }
}
