import { useEffect, useMemo, useState } from 'react'
import {
  acceptOrganisationInvitation,
  createOrganisation,
  inviteOrganisationMember,
  listOrganisationInvitations,
  listOrganisationMembers,
  removeOrganisationMember,
  renameOrganisation,
  revokeOrganisationInvitation,
  updateOrganisationMemberRole,
  type OrganisationInvitationRow,
  type OrganisationMemberRow,
  type OrganisationRole,
} from '../organisations/OrganisationService'
import { useOrganisations } from '../organisations/useOrganisations'

const roleLabel: Record<OrganisationRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  instructor: 'Instructor',
}

export function OrganisationManager() {
  const { memberships, active, pendingInvitations, loading, message, refresh, setActiveOrganisation } = useOrganisations()
  const [members, setMembers] = useState<OrganisationMemberRow[]>([])
  const [invitations, setInvitations] = useState<OrganisationInvitationRow[]>([])
  const [newOrganisationName, setNewOrganisationName] = useState('')
  const [organisationName, setOrganisationName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'instructor'>('instructor')
  const [busy, setBusy] = useState(false)
  const [localMessage, setLocalMessage] = useState<string | null>(null)

  const role = active?.membership.role ?? null
  const canManage = role === 'owner' || role === 'admin'
  const canManageRoles = role === 'owner'

  const refreshDetails = async () => {
    if (!active) {
      setMembers([])
      setInvitations([])
      return
    }
    const [nextMembers, nextInvitations] = await Promise.all([
      listOrganisationMembers(active.organisation.id),
      listOrganisationInvitations(active.organisation.id),
    ])
    setMembers(nextMembers)
    setInvitations(nextInvitations)
    setOrganisationName(active.organisation.name)
  }

  useEffect(() => {
    void refreshDetails().catch((cause) => setLocalMessage(cause instanceof Error ? cause.message : 'Unable to load organisation details.'))
  }, [active?.organisation.id, active?.organisation.updated_at])

  const pendingForActive = useMemo(() => invitations.filter((invitation) => invitation.status === 'pending'), [invitations])

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setLocalMessage(null)
    try {
      await task()
      await refresh()
      await refreshDetails()
    } catch (cause) {
      setLocalMessage(cause instanceof Error ? cause.message : 'Unable to update organisation.')
    } finally {
      setBusy(false)
    }
  }

  const create = () => run(async () => {
    const created = await createOrganisation(newOrganisationName)
    setNewOrganisationName('')
    setActiveOrganisation(created.id)
    setLocalMessage('Organisation created. You are its Owner.')
  })

  const rename = () => {
    if (!active) return
    void run(async () => {
      await renameOrganisation(active.organisation.id, organisationName)
      setLocalMessage('Organisation name updated.')
    })
  }

  const invite = () => {
    if (!active) return
    void run(async () => {
      await inviteOrganisationMember(active.organisation.id, inviteEmail, inviteRole)
      setInviteEmail('')
      setLocalMessage('Invitation created. The user can accept it after signing in with that email address.')
    })
  }

  const accept = (invitation: OrganisationInvitationRow) => void run(async () => {
    await acceptOrganisationInvitation(invitation)
    setActiveOrganisation(invitation.organisation_id)
    setLocalMessage('Organisation invitation accepted.')
  })

  return (
    <section className="studio-organisation-manager">
      <aside className="studio-organisation-sidebar">
        <div className="studio-profile-list-heading">
          <span>Organisation workspace</span>
          <strong>{active?.organisation.name ?? 'No organisation'}</strong>
        </div>
        {memberships.map(({ organisation, membership }) => (
          <button
            type="button"
            key={organisation.id}
            className={active?.organisation.id === organisation.id ? 'selected' : ''}
            onClick={() => setActiveOrganisation(organisation.id)}
          >
            <span>{organisation.name}</span>
            <small>{roleLabel[membership.role]}</small>
          </button>
        ))}
        <div className="studio-organisation-create">
          <input value={newOrganisationName} onChange={(event) => setNewOrganisationName(event.target.value)} placeholder="New organisation name" />
          <button type="button" onClick={() => void create()} disabled={busy || !newOrganisationName.trim()}>Create organisation</button>
        </div>
      </aside>

      <div className="studio-organisation-detail">
        {pendingInvitations.length > 0 && (
          <section className="studio-organisation-card">
            <h2>Invitations for you</h2>
            {pendingInvitations.map((invitation) => (
              <div className="studio-organisation-row" key={invitation.id}>
                <div><strong>Organisation invitation</strong><small>{roleLabel[invitation.role]}</small></div>
                <button type="button" className="scenario-builder-primary" onClick={() => accept(invitation)} disabled={busy}>Accept</button>
              </div>
            ))}
          </section>
        )}

        {!active ? (
          <section className="scenario-builder-state">
            <h2>Create your organisation</h2>
            <p>Organisation profiles are shared teaching assets. Create an organisation to start a shared LoppjuSIM library.</p>
          </section>
        ) : (
          <>
            <section className="studio-organisation-card">
              <header>
                <div><span>Active organisation</span><h2>{active.organisation.name}</h2><p>Your role: <strong>{roleLabel[active.membership.role]}</strong></p></div>
              </header>
              {canManage && (
                <div className="studio-organisation-inline-form">
                  <input value={organisationName} onChange={(event) => setOrganisationName(event.target.value)} />
                  <button type="button" onClick={rename} disabled={busy || !organisationName.trim()}>Rename</button>
                </div>
              )}
            </section>

            <section className="studio-organisation-card">
              <div className="studio-organisation-section-heading"><div><span>Members</span><h3>Organisation roles</h3></div></div>
              <div className="studio-organisation-table">
                {members.map((member) => (
                  <div className="studio-organisation-row" key={member.user_id}>
                    <div><strong>{member.email}</strong><small>{roleLabel[member.role]}</small></div>
                    <div className="studio-organisation-row-actions">
                      {canManageRoles && member.role !== 'owner' && (
                        <select value={member.role} onChange={(event) => void run(async () => {
                          await updateOrganisationMemberRole(active.organisation.id, member.user_id, event.target.value as 'admin' | 'instructor')
                          setLocalMessage('Member role updated.')
                        })} disabled={busy}>
                          <option value="admin">Admin</option>
                          <option value="instructor">Instructor</option>
                        </select>
                      )}
                      {member.role !== 'owner' && canManage && (role === 'owner' || member.role === 'instructor') && (
                        <button type="button" className="studio-profile-delete" onClick={() => void run(async () => {
                          await removeOrganisationMember(active.organisation.id, member.user_id)
                          setLocalMessage('Member removed.')
                        })} disabled={busy}>Remove</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {canManage && (
              <section className="studio-organisation-card">
                <div className="studio-organisation-section-heading"><div><span>Membership</span><h3>Invite instructor</h3></div></div>
                <div className="studio-organisation-inline-form invite">
                  <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="instructor@example.com" />
                  <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as 'admin' | 'instructor')}>
                    <option value="instructor">Instructor</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button type="button" className="scenario-builder-primary" onClick={invite} disabled={busy || !inviteEmail.trim()}>Create invitation</button>
                </div>
                {pendingForActive.length > 0 && <div className="studio-organisation-invitations">
                  {pendingForActive.map((invitation) => <div className="studio-organisation-row" key={invitation.id}>
                    <div><strong>{invitation.email}</strong><small>{roleLabel[invitation.role]} · pending</small></div>
                    <button type="button" onClick={() => void run(async () => {
                      await revokeOrganisationInvitation(invitation.id)
                      setLocalMessage('Invitation revoked.')
                    })} disabled={busy}>Revoke</button>
                  </div>)}
                </div>}
              </section>
            )}
          </>
        )}

        {(localMessage || message) && <div className="scenario-builder-message">{localMessage ?? message}</div>}
        {loading && <div className="scenario-builder-message">Refreshing organisation workspace…</div>}
      </div>
    </section>
  )
}
