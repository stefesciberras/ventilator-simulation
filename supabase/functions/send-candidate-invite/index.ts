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
    const htmlContent = `<!doctype html>
<html>
  <body style="font-family:Arial,Helvetica,sans-serif;color:#16232d;line-height:1.5;margin:0;padding:24px;background:#f4f7f8">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dce5e8;border-radius:12px;padding:28px">
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#59717d">EDUVENT</p>
      <h2 style="margin:0 0 16px;font-size:22px;color:#10232d">Mechanical Ventilation Teaching Session</h2>
      <p>You have been invited to join an EDUVENT teaching session.</p>
      <p style="font-size:16px">Session key: <strong>${safeSessionKey}</strong></p>
      <p style="margin:24px 0">
        <a href="${safeJoinUrl}" style="display:inline-block;background:#0e596d;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Join teaching session</a>
      </p>
      <p style="font-size:13px;color:#5b6f78">Open the link and enter your name to join. If the button does not work, copy this address into your browser:</p>
      <p style="font-size:12px;word-break:break-all;color:#36515d">${safeJoinUrl}</p>
    </div>
  </body>
</html>`

    const brevoPayload: Record<string, unknown> = {
      sender: { name: fromName || 'EDUVENT', email: fromEmail },
      to: recipients.map((email) => ({ email })),
      subject: `EDUVENT teaching session ${sessionKey}`,
      htmlContent,
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
