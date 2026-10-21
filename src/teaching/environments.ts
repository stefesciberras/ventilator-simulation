export interface TeachingEnvironmentDefinition {
  id: string
  label: string
}

/**
 * Shared library categories. IDs are deliberately plain strings so future
 * EDUSIM products can add categories without changing persisted row types.
 */
export const TEACHING_ENVIRONMENTS: TeachingEnvironmentDefinition[] = [
  { id: 'all', label: 'All' },
  { id: 'mechanical-ventilation', label: 'Mechanical Ventilation' },
  { id: 'anaesthesia', label: 'Anaesthesia' },
  { id: 'itu', label: 'ITU' },
]

export const TEACHING_ENVIRONMENT_ALL = 'all'

export function teachingEnvironmentLabel(id: string) {
  return TEACHING_ENVIRONMENTS.find((item) => item.id === id)?.label ?? id
}

export function normaliseTeachingEnvironments(values: string[] | null | undefined, fallback = TEACHING_ENVIRONMENT_ALL) {
  const unique = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
  if (unique.includes(TEACHING_ENVIRONMENT_ALL)) return [TEACHING_ENVIRONMENT_ALL]
  return unique.length ? unique : [fallback]
}

export function teachingEnvironmentMatches(values: string[] | null | undefined, environmentId: string) {
  const normalised = normaliseTeachingEnvironments(values)
  return normalised.includes(TEACHING_ENVIRONMENT_ALL) || normalised.includes(environmentId)
}
