export const SIMULATION_TRANSITION_SECONDS = [0, 5, 10, 30, 60] as const

export function SimulationTransitionTimeControl({
  value,
  onChange,
  disabled = false,
  label = 'Transition time',
  showValue = true,
}: {
  value: number
  onChange: (seconds: number) => void
  disabled?: boolean
  label?: string
  showValue?: boolean
}) {
  return (
    <label className="simulation-transition-time-control">
      <span>{label}{showValue ? <> <b>{value === 0 ? 'Immediate' : `${value} s`}</b></> : null}</span>
      <select disabled={disabled} value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {SIMULATION_TRANSITION_SECONDS.map((seconds) => (
          <option key={seconds} value={seconds}>{seconds === 0 ? 'Immediate' : `${seconds} seconds`}</option>
        ))}
      </select>
    </label>
  )
}
