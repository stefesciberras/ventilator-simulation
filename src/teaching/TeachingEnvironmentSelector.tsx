import { TEACHING_ENVIRONMENTS, TEACHING_ENVIRONMENT_ALL, normaliseTeachingEnvironments } from './environments'

export function TeachingEnvironmentSelector({
  value,
  onChange,
  disabled = false,
  label = 'Simulation environments',
}: {
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  label?: string
}) {
  const selected = normaliseTeachingEnvironments(value)
  const toggle = (id: string) => {
    if (id === TEACHING_ENVIRONMENT_ALL) {
      onChange([TEACHING_ENVIRONMENT_ALL])
      return
    }
    const withoutAll = selected.filter((item) => item !== TEACHING_ENVIRONMENT_ALL)
    const next = withoutAll.includes(id)
      ? withoutAll.filter((item) => item !== id)
      : [...withoutAll, id]
    onChange(normaliseTeachingEnvironments(next, TEACHING_ENVIRONMENT_ALL))
  }

  return (
    <fieldset className="teaching-environment-selector" disabled={disabled}>
      <legend>{label}</legend>
      <div className="teaching-environment-options">
        {TEACHING_ENVIRONMENTS.map((environment) => (
          <label key={environment.id} className={selected.includes(environment.id) ? 'selected' : ''}>
            <input
              type="checkbox"
              checked={selected.includes(environment.id)}
              onChange={() => toggle(environment.id)}
            />
            <span>{environment.label}</span>
          </label>
        ))}
      </div>
      <small>“All” makes this item available in every current and future simulation environment.</small>
    </fieldset>
  )
}
