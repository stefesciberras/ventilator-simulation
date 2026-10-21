import { useCallback, useEffect, useState } from 'react'

export interface ScenarioLibraryRepository<TRow, TScenario> {
  list: () => Promise<TRow[]>
  create: (name: string, scenario: TScenario) => Promise<TRow>
  update: (id: string, updates: { name?: string; scenario?: TScenario }) => Promise<TRow>
  remove: (id: string) => Promise<void>
}

interface UseScenarioLibraryManagerOptions<TRow, TScenario> {
  enabled: boolean
  repository: ScenarioLibraryRepository<TRow, TScenario>
  loadErrorMessage?: string
}

/** Shared EDUSIM controller for an instructor-owned scenario library. */
export function useScenarioLibraryManager<TRow, TScenario>({
  enabled,
  repository,
  loadErrorMessage = 'Unable to load instructor scenarios.',
}: UseScenarioLibraryManagerOptions<TRow, TScenario>) {
  const [items, setItems] = useState<TRow[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setItems([])
      return [] as TRow[]
    }
    try {
      const next = await repository.list()
      setItems(next)
      return next
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : loadErrorMessage)
      return [] as TRow[]
    }
  }, [enabled, loadErrorMessage, repository])

  useEffect(() => {
    if (enabled) void refresh()
    else setItems([])
  }, [enabled, refresh])

  const runMutation = useCallback(async <T,>(operation: () => Promise<T>) => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await operation()
      await refresh()
      return result
    } catch (cause) {
      const next = cause instanceof Error ? cause.message : 'Unable to update the scenario library.'
      setMessage(next)
      throw cause
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const create = useCallback((name: string, scenario: TScenario) => runMutation(() => repository.create(name, scenario)), [repository, runMutation])
  const update = useCallback((id: string, updates: { name?: string; scenario?: TScenario }) => runMutation(() => repository.update(id, updates)), [repository, runMutation])
  const remove = useCallback((id: string) => runMutation(() => repository.remove(id)), [repository, runMutation])

  return { items, busy, message, setMessage, refresh, create, update, remove }
}
