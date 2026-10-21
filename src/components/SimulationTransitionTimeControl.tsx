export const SIMULATION_TRANSITION_SECONDS = [0, 5, 10, 30, 60] as const

export function SimulationTransitionTimeControl({
  value,
  onChange,
  disabled = false,
  label = 'Transition time',
}: {
  value: number
  onChange: (seconds: number) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <label className="simulation-transition-time-control">
      <span>{label} <b>{value === 0 ? 'Immediate' : `${value} s`}</b></span>
      <select disabled={disabled} value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {SIMULATION_TRANSITION_SECONDS.map((seconds) => (
          <option key={seconds} value={seconds}>{seconds === 0 ? 'Immediate' : `${seconds} seconds`}</option>
        ))}
      </select>
    </label>
  )
}
