import { createClient } from '@supabase/supabase-js'

const MAX_RECIPIENTS = 25
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PRODUCTS: Record<string, { label: string; description: string }> = {
  eduvent: { label: 'EDUVENT', description: 'interactive mechanical ventilation simulation' },
  'edumon-ana': { label: 'EDUMON-Ana', description: 'interactive anaesthesia patient-monitor simulation' },
  'edumon-icu': { label: 'EDUMON-ICU', description: 'interactive intensive-care patient-monitor simulation' },
}

function corsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': req.headers.get('origin') ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })
}

function getSupabaseSecretKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (legacy) return legacy
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')?.trim()
  if (!raw) return null
  try {
    const keys = JSON.parse(raw) as Record<string, string>
    return keys.default ?? Object.values(keys)[0] ?? null
  } catch { return null }
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

function uniqueRecipients(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim().toLowerCase()).filter(Boolean)))
}

function validateJoinUrl(raw: unknown, sessionKey: string, requestOrigin: string | null) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('The candidate join URL is missing.')
  const url = new URL(raw)
  const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  if (url.protocol !== 'https:' && !localHttp) throw new Error('The candidate join URL must use HTTPS.')
  if (requestOrigin && url.origin !== requestOrigin) throw new Error('The candidate join URL does not match this EDUSIM deployment.')
  if (url.searchParams.get('session')?.toUpperCase() !== sessionKey.toUpperCase()) throw new Error('The candidate join URL does not match this teaching session.')
  url.hash = ''
  return url.toString()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed.' }, 405)

  try {
    const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return json(req, { error: 'Sign in to the active instructor session before sending invitations.' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
    const secretKey = getSupabaseSecretKey()
    if (!supabaseUrl || !secretKey) return json(req, { error: 'Supabase server credentials are unavailable.' }, 503)
    const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data: userData, error: userError } = await admin.auth.getUser(jwt)
    if (userError || !userData.user) return json(req, { error: 'The instructor session is no longer authenticated.' }, 401)

    const body = await req.json().catch(() => null) as { sessionId?: unknown; recipients?: unknown; joinUrl?: unknown; productId?: unknown } | null
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
    const productId = typeof body?.productId === 'string' ? body.productId.trim().toLowerCase() : ''
    const recipients = uniqueRecipients(body?.recipients)
    if (!sessionId || !productId) return json(req, { error: 'Teaching session details are incomplete.' }, 400)
    if (!recipients.length) return json(req, { error: 'Enter at least one candidate email address.' }, 400)
    if (recipients.length > MAX_RECIPIENTS) return json(req, { error: `Send to at most ${MAX_RECIPIENTS} candidates at a time.` }, 400)
    const invalid = recipients.filter((email) => !EMAIL_RE.test(email))
    if (invalid.length) return json(req, { error: `Invalid email address${invalid.length === 1 ? '' : 'es'}: ${invalid.join(', ')}` }, 400)

    const { data: session, error: sessionError } = await admin.from('teaching_sessions').select('id, session_key, instructor_id, status, expires_at, product_id').eq('id', sessionId).single()
    if (sessionError || !session) return json(req, { error: 'Teaching session not found.' }, 404)
    if (session.instructor_id !== userData.user.id) return json(req, { error: 'Only the instructor who owns this teaching session may email invitations.' }, 403)
    if (String(session.product_id ?? 'eduvent').toLowerCase() !== productId) return json(req, { error: 'This invitation does not match the active simulator.' }, 409)
    if (session.status !== 'active') return json(req, { error: 'This teaching session is no longer active.' }, 409)
    if (Date.parse(session.expires_at) <= Date.now()) return json(req, { error: 'This teaching session has expired.' }, 409)

    const product = PRODUCTS[productId] ?? { label: 'EDUSIM', description: 'interactive clinical simulation' }
    const joinUrl = validateJoinUrl(body?.joinUrl, String(session.session_key), req.headers.get('origin'))
    const brevoApiKey = Deno.env.get('BREVO_API_KEY')?.trim()
    const fromEmail = (Deno.env.get('BREVO_FROM_EMAIL') ?? Deno.env.get('BREVO_SENDER_EMAIL'))?.trim()
    const fromName = (Deno.env.get('BREVO_FROM_NAME') ?? Deno.env.get('BREVO_SENDER_NAME') ?? 'EDUSIM').trim()
    const replyTo = Deno.env.get('BREVO_REPLY_TO')?.trim()
    if (!brevoApiKey || !fromEmail) return json(req, { error: 'Brevo delivery is not configured for this Edge Function.' }, 503)

    const safeUrl = escapeHtml(joinUrl)
    const safeKey = escapeHtml(String(session.session_key))
    const safeLabel = escapeHtml(product.label)
    const safeDescription = escapeHtml(product.description)
    const htmlContent = `<!doctype html><html><body style="margin:0;background:#eef4f6;font-family:Arial,Helvetica,sans-serif;color:#17313b"><table width="100%" role="presentation" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #d7e3e7;border-radius:16px;overflow:hidden"><tr><td style="background:#0c3542;padding:28px 32px;color:#fff"><div style="font-size:13px;font-weight:700;letter-spacing:.16em;color:#9fd6df">${safeLabel}</div><div style="margin-top:8px;font-size:25px;font-weight:700">You're invited to a teaching session</div><div style="margin-top:8px;color:#c8dde2">${safeDescription}</div></td></tr><tr><td style="padding:32px"><p>You have been invited by your instructor to join a live ${safeLabel} session.</p><div style="margin:22px 0;padding:18px 20px;background:#f4f8f9;border:1px solid #dce8eb;border-radius:12px"><div style="font-size:12px;font-weight:700;color:#6a858f">SESSION KEY</div><div style="margin-top:5px;font-family:monospace;font-size:24px;font-weight:700;letter-spacing:.12em;color:#0c5063">${safeKey}</div></div><p><a href="${safeUrl}" style="display:inline-block;padding:14px 24px;background:#0e6578;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">Join ${safeLabel} session</a></p><p style="font-size:14px;color:#5c737c">Open the link and enter your name when prompted.</p><div style="font-size:12px;word-break:break-all;color:#35606e">${safeUrl}</div></td></tr></table></td></tr></table></body></html>`
    const textContent = `${product.label} teaching session invitation\n\nYou have been invited to join a live ${product.label} session.\n\nSession key: ${session.session_key}\n\nJoin the session:\n${joinUrl}\n\nOpen the link and enter your name when prompted.`

    const payload: Record<string, unknown> = {
      sender: { name: fromName || 'EDUSIM', email: fromEmail },
      to: recipients.map((email) => ({ email })),
      subject: `You’re invited to a ${product.label} teaching session`,
      htmlContent,
      textContent,
      tags: ['edusim-candidate-invite', productId],
    }
    if (replyTo && EMAIL_RE.test(replyTo)) payload.replyTo = { email: replyTo }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { accept: 'application/json', 'api-key': brevoApiKey, 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    const result = await response.json().catch(() => null) as { messageId?: string; message?: string } | null
    if (!response.ok) return json(req, { error: result?.message || `Brevo rejected the invitation (${response.status}).` }, 502)
    return json(req, { sent: recipients.length, messageId: result?.messageId ?? null })
  } catch (cause) {
    console.error('EDUSIM candidate invitation failure', cause)
    return json(req, { error: cause instanceof Error ? cause.message : 'Unable to send candidate invitation.' }, 500)
  }
})
