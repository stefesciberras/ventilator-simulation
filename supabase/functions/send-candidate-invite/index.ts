import { createClient } from '@supabase/supabase-js'

const MAX_RECIPIENTS = 25
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function corsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': req.headers.get('origin') ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

function getSupabaseSecretKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (legacy) return legacy

  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')?.trim()
  if (!raw) return null
  try {
    const keys = JSON.parse(raw) as Record<string, string>
    return keys.default ?? Object.values(keys)[0] ?? null
  } catch {
    return null
  }
}

function uniqueRecipients(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  ))
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function validatedJoinUrl(raw: unknown, expectedSessionKey: string, requestOrigin: string | null) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('The candidate join URL is missing.')
  const url = new URL(raw)
  const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  if (url.protocol !== 'https:' && !localHttp) throw new Error('The candidate join URL must use HTTPS.')
  if (requestOrigin && url.origin !== requestOrigin) throw new Error('The candidate join URL does not match this EDUVENT deployment.')
  if (url.searchParams.get('session')?.toUpperCase() !== expectedSessionKey.toUpperCase()) {
    throw new Error('The candidate join URL does not match this teaching session.')
  }
  url.hash = ''
  return url.toString()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed.' }, 405)

  try {
    const authorization = req.headers.get('authorization')
    const jwt = authorization?.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return json(req, { error: 'Sign in to the active instructor session before sending invitations.' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
    const secretKey = getSupabaseSecretKey()
    if (!supabaseUrl || !secretKey) return json(req, { error: 'Supabase server credentials are unavailable.' }, 503)

    const admin = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userError } = await admin.auth.getUser(jwt)
    if (userError || !userData.user) return json(req, { error: 'The instructor session is no longer authenticated.' }, 401)

    const body = await req.json().catch(() => null) as { sessionId?: unknown; recipients?: unknown; joinUrl?: unknown } | null
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
    const recipients = uniqueRecipients(body?.recipients)
    if (!sessionId) return json(req, { error: 'Teaching session identifier is missing.' }, 400)
    if (!recipients.length) return json(req, { error: 'Enter at least one candidate email address.' }, 400)
    if (recipients.length > MAX_RECIPIENTS) return json(req, { error: `Send to at most ${MAX_RECIPIENTS} candidates at a time.` }, 400)

    const invalid = recipients.filter((email) => !EMAIL_RE.test(email))
    if (invalid.length) return json(req, { error: `Invalid email address${invalid.length === 1 ? '' : 'es'}: ${invalid.join(', ')}` }, 400)

    const { data: session, error: sessionError } = await admin
      .from('teaching_sessions')
      .select('id, session_key, instructor_id, status, expires_at')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) return json(req, { error: 'Teaching session not found.' }, 404)
    if (session.instructor_id !== userData.user.id) return json(req, { error: 'Only the instructor who owns this teaching session may email invitations.' }, 403)
    if (session.status !== 'active') return json(req, { error: 'This teaching session is no longer active.' }, 409)
    if (Date.parse(session.expires_at) <= Date.now()) return json(req, { error: 'This teaching session has expired.' }, 409)

    const joinUrl = validatedJoinUrl(body?.joinUrl, session.session_key, req.headers.get('origin'))

    const brevoApiKey = Deno.env.get('BREVO_API_KEY')?.trim()
    const fromEmail = (Deno.env.get('BREVO_FROM_EMAIL') ?? Deno.env.get('BREVO_SENDER_EMAIL'))?.trim()
    const fromName = (Deno.env.get('BREVO_FROM_NAME') ?? Deno.env.get('BREVO_SENDER_NAME') ?? 'EDUVENT').trim()
    const replyTo = Deno.env.get('BREVO_REPLY_TO')?.trim()
    if (!brevoApiKey || !fromEmail) {
      return json(req, {
        error: 'Brevo delivery is not configured for this Edge Function. Add BREVO_API_KEY and BREVO_FROM_EMAIL to the Supabase Edge Function secrets.',
      }, 503)
    }

    const sessionKey = String(session.session_key)
    const safeJoinUrl = escapeHtml(joinUrl)
    const safeSessionKey = escapeHtml(sessionKey)
    const preheader = 'You have been invited to join a live EDUVENT mechanical ventilation teaching session.'

    const htmlContent = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light only">
    <title>EDUVENT teaching session invitation</title>
  </head>
  <body style="margin:0;padding:0;background:#eef4f6;font-family:Arial,Helvetica,sans-serif;color:#17313b;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#eef4f6;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #d7e3e7;border-radius:16px;overflow:hidden;box-shadow:0 8px 28px rgba(24,58,70,.08);">
            <tr>
              <td style="background:#0c3542;padding:28px 32px;">
                <div style="font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#9fd6df;">EDUVENT</div>
                <div style="margin-top:8px;font-size:25px;line-height:1.2;font-weight:700;color:#ffffff;">You're invited to a teaching session</div>
                <div style="margin-top:8px;font-size:14px;line-height:1.5;color:#c8dde2;">Interactive mechanical ventilation simulation</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#29454f;">You have been invited by your instructor to join a live EDUVENT session. Open the session on the device you will use during the simulation.</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0;background:#f4f8f9;border:1px solid #dce8eb;border-radius:12px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6a858f;">Session key</div>
                      <div style="margin-top:5px;font-family:Menlo,Consolas,monospace;font-size:24px;font-weight:700;letter-spacing:.12em;color:#0c5063;">${safeSessionKey}</div>
                    </td>
                  </tr>
                </table>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 22px;">
                  <tr>
                    <td bgcolor="#0e6578" style="border-radius:10px;">
                      <a href="${safeJoinUrl}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">Join EDUVENT session</a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#5c737c;">After opening the link, enter your name when prompted. Keep this email available in case you need to reconnect.</p>

                <div style="margin-top:24px;padding-top:20px;border-top:1px solid #e5ecef;">
                  <div style="font-size:12px;line-height:1.5;color:#7a8e96;">If the button does not open EDUVENT, copy and paste this address into your browser:</div>
                  <div style="margin-top:7px;font-size:12px;line-height:1.5;word-break:break-all;color:#35606e;">${safeJoinUrl}</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:#f7fafb;padding:18px 32px;border-top:1px solid #e4ecef;">
                <div style="font-size:12px;line-height:1.5;color:#789099;">This is a transactional invitation to an EDUVENT teaching session. If you were not expecting this email, you can ignore it.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

    const textContent = `EDUVENT teaching session invitation\n\nYou have been invited by your instructor to join a live EDUVENT mechanical ventilation teaching session.\n\nSession key: ${sessionKey}\n\nJoin the session:\n${joinUrl}\n\nOpen the link and enter your name when prompted. Keep this email available in case you need to reconnect.\n\nIf you were not expecting this invitation, you can ignore this email.`

    const brevoPayload: Record<string, unknown> = {
      sender: { name: fromName || 'EDUVENT', email: fromEmail },
      to: recipients.map((email) => ({ email })),
      subject: 'You’re invited to an EDUVENT teaching session',
      htmlContent,
      textContent,
      tags: ['eduvent-candidate-invite'],
    }
    if (replyTo && EMAIL_RE.test(replyTo)) brevoPayload.replyTo = { email: replyTo }

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(brevoPayload),
    })

    const brevoResult = await brevoResponse.json().catch(() => null) as { messageId?: string; message?: string } | null
    if (!brevoResponse.ok) {
      console.error('Brevo invitation error', brevoResponse.status, brevoResult?.message ?? 'Unknown Brevo error')
      return json(req, { error: brevoResult?.message || `Brevo rejected the invitation (${brevoResponse.status}).` }, 502)
    }

    return json(req, {
      sent: recipients.length,
      messageId: brevoResult?.messageId ?? null,
    })
  } catch (cause) {
    console.error('Candidate invitation failure', cause)
    return json(req, { error: cause instanceof Error ? cause.message : 'Unable to send candidate invitation.' }, 500)
  }
})
