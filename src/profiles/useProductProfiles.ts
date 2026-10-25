import { useCallback, useEffect, useState } from 'react'
import { subscribeToInstructorAccount } from '../teaching/account/InstructorAccountService'
import type { ScenarioProductId } from '../teaching/scenario/products'
import { listProductProfilesIfSignedIn, type ProductProfileRow } from './ProfileRepository'

export function useProductProfiles<TValues extends object>(product: ScenarioProductId) {
  const [rows, setRows] = useState<Array<ProductProfileRow<TValues>>>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      setRows(await listProductProfilesIfSignedIn<TValues>(product))
    } catch (cause) {
      setRows([])
      setMessage(cause instanceof Error ? cause.message : 'Unable to load profiles.')
    } finally {
      setLoading(false)
    }
  }, [product])

  useEffect(() => {
    void refresh()
    const unsubscribe = subscribeToInstructorAccount(() => { void refresh() })
    return unsubscribe
  }, [refresh])

  return { rows, loading, message, refresh }
}
