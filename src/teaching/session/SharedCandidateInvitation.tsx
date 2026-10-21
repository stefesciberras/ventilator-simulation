import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../../session/supabase'
import '../../candidate-invitation.css'

export interface SharedCandidateInvitationProps {
  sessionId: string
  sessionKey: string
  joinUrl: string
  productId: string
  productLabel: string
  productDescription?: string
}

type InviteToast = { kind: 'success' | 'error'; message: string }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_RECIPIENTS = 25

function splitRecipients(value: string) {
  return Array.from(new Set(value.split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean)))
}

export function SharedCandidateInvitation({ sessionId, sessionKey, joinUrl, productId, productLabel, productDescription = 'interactive clinical simulation' }: SharedCandidateInvitationProps) {
  const [open, setOpen] = useState(false)
  const [emails, setEmails] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<InviteToast | null>(null)

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), toast.kind === 'error' ? 8000 : 5500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const invitationText = useMemo(() => [
    `You have been invited to join a ${productLabel} teaching session.`,
    '',
    `Join directly: ${joinUrl}`,
    `Session key: ${sessionKey}`,
    '',
    'Open the link, enter your name, and join the session.',
  ].join('\n'), [joinUrl, productLabel, sessionKey])

  const report = (kind: InviteToast['kind'], message: string) => { setStatus(message); setToast({ kind, message }) }

  const copyInvitation = async () => {
    try { await navigator.clipboard.writeText(invitationText); setStatus('Invitation copied to clipboard.') }
    catch { setStatus('Unable to copy automatically. Please copy the invitation text manually.') }
  }

  const emailInvitation = async () => {
    const recipients = splitRecipients(emails)
    if (!recipients.length) return report('error', 'Enter at least one candidate email address.')
    if (recipients.length > MAX_RECIPIENTS) return report('error', `Send to at most ${MAX_RECIPIENTS} candidates at a time.`)
    const invalid = recipients.filter((email) => !EMAIL_RE.test(email))
    if (invalid.length) return report('error', `Check the following email address${invalid.length > 1 ? 'es' : ''}: ${invalid.join(', ')}`)

    setSending(true); setStatus(null); setToast(null)
    try {
      const { data, error } = await supabase.functions.invoke<{ sent?: number; error?: string }>('send-candidate-invite', {
        body: { sessionId, recipients, joinUrl, productId, productLabel, productDescription },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      const sent = data?.sent ?? recipients.length
      report('success', `Invitation email sent to ${sent} candidate${sent === 1 ? '' : 's'}.`)
    } catch (cause) {
      report('error', cause instanceof Error ? cause.message : 'Unable to send the invitation.')
    } finally { setSending(false) }
  }

  if (!sessionId || !sessionKey || !joinUrl) return null

  return <div className="candidate-invitation">
    <button type="button" className="session-primary-button candidate-invite-trigger" onClick={() => { setOpen(true); setStatus(null) }}>Share / Invite candidates</button>
    {open && <div className="candidate-invite-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className="candidate-invite-dialog" role="dialog" aria-modal="true" aria-labelledby="candidate-invite-title">
        <div className="candidate-invite-heading"><div><span>Candidate invitation</span><h3 id="candidate-invite-title">Share session {sessionKey}</h3></div><button type="button" aria-label="Close invitation" onClick={() => setOpen(false)}>×</button></div>
        <div className="candidate-invite-share-card">
          <div className="candidate-invite-qr" title={joinUrl}><QRCodeSVG value={joinUrl} size={156} level="M" bgColor="#ffffff" fgColor="#071a24" marginSize={1} /></div>
          <div className="candidate-invite-link-card"><span>Direct join link</span><strong>{joinUrl}</strong><small>Candidates can scan the QR code or open this direct link.</small></div>
        </div>
        <textarea readOnly value={invitationText} aria-label="Invitation text" rows={7} />
        <div className="candidate-invite-actions"><button type="button" className="session-secondary-button" onClick={() => void copyInvitation()}>Copy invitation</button></div>
        <div className="candidate-invite-email">
          <label htmlFor="candidate-invite-emails">Email candidates</label>
          <textarea id="candidate-invite-emails" value={emails} onChange={(event) => setEmails(event.target.value)} placeholder="candidate1@example.com, candidate2@example.com" rows={3} />
          <small>Separate multiple addresses with commas, spaces, semicolons or new lines. Maximum {MAX_RECIPIENTS} recipients per send.</small>
          <button type="button" className="session-primary-button" disabled={sending} onClick={() => void emailInvitation()}>{sending ? 'Sending…' : 'Email invitation'}</button>
        </div>
        {status && <div className="candidate-invite-status" role="status">{status}</div>}
      </section>
    </div>}
    {toast && <div className={`candidate-invite-toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}><div><strong>{toast.kind === 'success' ? 'Invitation sent' : 'Invitation not sent'}</strong><span>{toast.message}</span></div><button type="button" onClick={() => setToast(null)}>×</button></div>}
  </div>
}
