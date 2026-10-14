import { useMemo, useState } from 'react'
import { supabase } from '../session/supabase'
import '../candidate-invitation.css'

interface CandidateInvitationProps {
  sessionId: string
  sessionKey: string
  joinUrl: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_RECIPIENTS = 25

function splitRecipients(value: string) {
  return Array.from(new Set(
    value
      .split(/[\s,;]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  ))
}

export function CandidateInvitation({ sessionId, sessionKey, joinUrl }: CandidateInvitationProps) {
  const [open, setOpen] = useState(false)
  const [emails, setEmails] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const invitationText = useMemo(() => [
    'You have been invited to join an EDUVENT teaching session.',
    '',
    `Join directly: ${joinUrl}`,
    `Session key: ${sessionKey}`,
    '',
    'Open the link, enter your name, and join the session.',
  ].join('\n'), [joinUrl, sessionKey])

  const copyInvitation = async () => {
    try {
      await navigator.clipboard.writeText(invitationText)
      setStatus('Invitation copied to clipboard.')
    } catch {
      setStatus('Unable to copy automatically. Please copy the invitation text manually.')
    }
  }

  const emailInvitation = async () => {
    const recipients = splitRecipients(emails)
    if (!recipients.length) {
      setStatus('Enter at least one candidate email address.')
      return
    }
    if (recipients.length > MAX_RECIPIENTS) {
      setStatus(`Send to at most ${MAX_RECIPIENTS} candidates at a time.`)
      return
    }
    const invalid = recipients.filter((email) => !EMAIL_RE.test(email))
    if (invalid.length) {
      setStatus(`Check the following email address${invalid.length > 1 ? 'es' : ''}: ${invalid.join(', ')}`)
      return
    }

    setSending(true)
    setStatus(null)
    try {
      const { data, error } = await supabase.functions.invoke<{ sent?: number; error?: string }>('send-candidate-invite', {
        body: {
          sessionId,
          recipients,
          joinUrl,
        },
      })

      if (error) {
        let message = error.message || 'Unable to send the invitation.'
        const context = (error as { context?: Response }).context
        if (context instanceof Response) {
          const payload = await context.clone().json().catch(() => null) as { error?: string } | null
          if (payload?.error) message = payload.error
        }
        throw new Error(message)
      }
      if (data?.error) throw new Error(data.error)

      const sent = data?.sent ?? recipients.length
      setStatus(`Invitation sent through Brevo to ${sent} candidate${sent === 1 ? '' : 's'}.`)
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Unable to send the invitation.')
    } finally {
      setSending(false)
    }
  }

  if (!sessionId || !sessionKey || !joinUrl) return null

  return (
    <div className="candidate-invitation">
      <button type="button" className="session-primary-button candidate-invite-trigger" onClick={() => {
        setOpen(true)
        setStatus(null)
      }}>
        Share / Invite candidates
      </button>

      {open && (
        <div className="candidate-invite-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false)
        }}>
          <section className="candidate-invite-dialog" role="dialog" aria-modal="true" aria-labelledby="candidate-invite-title">
            <div className="candidate-invite-heading">
              <div>
                <span>Candidate invitation</span>
                <h3 id="candidate-invite-title">Share session {sessionKey}</h3>
              </div>
              <button type="button" aria-label="Close invitation" onClick={() => setOpen(false)}>×</button>
            </div>

            <div className="candidate-invite-link-card">
              <span>Direct join link</span>
              <strong>{joinUrl}</strong>
              <small>Candidate enters their name after opening the link.</small>
            </div>

            <textarea readOnly value={invitationText} aria-label="Invitation text" rows={7} />

            <div className="candidate-invite-actions">
              <button type="button" className="session-secondary-button" onClick={() => void copyInvitation()}>Copy invitation</button>
            </div>

            <div className="candidate-invite-email">
              <label htmlFor="candidate-invite-emails">Email candidates</label>
              <textarea
                id="candidate-invite-emails"
                value={emails}
                onChange={(event) => setEmails(event.target.value)}
                placeholder="candidate1@example.com, candidate2@example.com"
                rows={3}
              />
              <small>Separate multiple addresses with commas, spaces, semicolons or new lines. Maximum {MAX_RECIPIENTS} recipients per send.</small>
              <button type="button" className="session-primary-button" disabled={sending} onClick={() => void emailInvitation()}>
                {sending ? 'Sending…' : 'Email invitation'}
              </button>
              <small className="candidate-invite-delivery-note">
                Invitations are sent securely by the EDUVENT Supabase Edge Function through Brevo.
              </small>
            </div>

            {status && <div className="candidate-invite-status" role="status">{status}</div>}
          </section>
        </div>
      )}
    </div>
  )
}
