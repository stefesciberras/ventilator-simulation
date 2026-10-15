export const SIMULATION_SPEEDS = [1, 1.5, 2, 4] as const
export type SimulationSpeed = typeof SIMULATION_SPEEDS[number]

export function isSimulationSpeed(value: unknown): value is SimulationSpeed {
  return value === 1 || value === 1.5 || value === 2 || value === 4
}
