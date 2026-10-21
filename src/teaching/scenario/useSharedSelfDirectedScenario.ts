import { useEffect, useRef, useState } from 'react'
import { selfDirectedAssignmentUrl, startSelfDirectedRun, updateSelfDirectedRun, type SelfDirectedRunStart } from '../../selfDirectedAssignments'
import type { ScenarioProductId } from './products'
import type { TeachingScenarioRuntimeStatus } from './runtimeCore'

export interface SharedSelfDirectedScenarioOptions<TScenario> {
  product: ScenarioProductId
  enabled?: boolean
  stageIndex: number
  status: TeachingScenarioRuntimeStatus
  complete: boolean
  onStart: (run: SelfDirectedRunStart<TScenario>) => void | Promise<void>
  onClear?: () => void
}

/**
 * Shared assignment/runtime envelope. It owns assignment-code routing, run
 * persistence and URL cleanup; simulator adapters only load/apply scenario state.
 */
export function useSharedSelfDirectedScenario<TScenario>({
  product,
  enabled = true,
  stageIndex,
  status,
  complete,
  onStart,
  onClear,
}: SharedSelfDirectedScenarioOptions<TScenario>) {
  const [run, setRun] = useState<SelfDirectedRunStart<TScenario> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const launchedRef = useRef<string | null>(null)
  const onStartRef = useRef(onStart)
  const onClearRef = useRef(onClear)
  useEffect(() => { onStartRef.current = onStart }, [onStart])
  useEffect(() => { onClearRef.current = onClear }, [onClear])

  useEffect(() => {
    if (!enabled || run) return
    const code = new URLSearchParams(window.location.search).get('assignment')?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) ?? ''
    if (code.length !== 8 || launchedRef.current === code) return
    launchedRef.current = code
    let cancelled = false
    void startSelfDirectedRun<TScenario>(code).then(async (next) => {
      if (cancelled) return
      if (next.product !== product) {
        window.location.assign(selfDirectedAssignmentUrl(code, next.product))
        return
      }
      setError(null)
      setRun(next)
      await onStartRef.current(next)
    }).catch((cause) => {
      if (cancelled) return
      launchedRef.current = null
      setError(cause instanceof Error ? cause.message : 'Unable to start this self-directed scenario.')
    })
    return () => { cancelled = true }
  }, [enabled, product, run])

  useEffect(() => {
    if (!run || status === 'idle') return
    void updateSelfDirectedRun(run.runId, stageIndex, complete || status === 'complete').catch(() => undefined)
  }, [complete, run?.runId, stageIndex, status])

  const clear = () => {
    setRun(null)
    setError(null)
    onClearRef.current?.()
    const url = new URL(window.location.href)
    if (url.searchParams.has('assignment')) {
      url.searchParams.delete('assignment')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }

  return { run, error, clear, active: Boolean(run) }
}
