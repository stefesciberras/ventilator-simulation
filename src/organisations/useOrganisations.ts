import { useCallback, useEffect, useMemo, useState } from 'react'
import { subscribeToInstructorAccount } from '../teaching/account/InstructorAccountService'
import {
  getStoredActiveOrganisationId,
  listMyPendingOrganisationInvitations,
  listOrganisationMemberships,
  setStoredActiveOrganisationId,
  type OrganisationInvitationRow,
  type OrganisationMembership,
} from './OrganisationService'

export function useOrganisations() {
  const [memberships, setMemberships] = useState<OrganisationMembership[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<OrganisationInvitationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(() => getStoredActiveOrganisationId())

  const refresh = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const [nextMemberships, nextInvitations] = await Promise.all([
        listOrganisationMemberships(),
        listMyPendingOrganisationInvitations(),
      ])
      setMemberships(nextMemberships)
      setPendingInvitations(nextInvitations)
      const stored = getStoredActiveOrganisationId()
      const resolved = nextMemberships.find((row) => row.organisation.id === stored) ?? nextMemberships[0] ?? null
      setActiveId(resolved?.organisation.id ?? null)
      if (resolved && resolved.organisation.id !== stored) setStoredActiveOrganisationId(resolved.organisation.id)
      if (!resolved && stored) setStoredActiveOrganisationId(null)
    } catch (cause) {
      setMemberships([])
      setPendingInvitations([])
      setMessage(cause instanceof Error ? cause.message : 'Unable to load organisations.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const unsubscribeAuth = subscribeToInstructorAccount(() => { void refresh() })
    const onOrganisationChange = (event: Event) => {
      const next = (event as CustomEvent<string | null>).detail ?? getStoredActiveOrganisationId()
      setActiveId(next)
    }
    window.addEventListener('lopjusim:active-organisation-changed', onOrganisationChange)
    return () => {
      unsubscribeAuth()
      window.removeEventListener('lopjusim:active-organisation-changed', onOrganisationChange)
    }
  }, [refresh])

  const active = useMemo(
    () => memberships.find((row) => row.organisation.id === activeId) ?? memberships[0] ?? null,
    [memberships, activeId],
  )

  const setActiveOrganisation = useCallback((id: string) => {
    setStoredActiveOrganisationId(id)
    setActiveId(id)
  }, [])

  return { memberships, active, pendingInvitations, loading, message, refresh, setActiveOrganisation }
}
