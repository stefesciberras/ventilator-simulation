from pathlib import Path
import re


def require_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'{label} anchor not found')
    return text.replace(old, new, 1)

panel = Path('src/components/SessionPanel.tsx')
text = panel.read_text()
if "from 'qrcode.react'" not in text:
    text = require_replace(
        text,
        "import { useEffect, useMemo, useState } from 'react'\n",
        "import { useEffect, useMemo, useState } from 'react'\nimport { QRCodeSVG } from 'qrcode.react'\n",
        'QR import',
    )

if "const deepLinkKey" not in text:
    state_anchor = """  const [sessionControlsExpanded, setSessionControlsExpanded] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!recoverableCandidate) return
"""
    state_replacement = """  const [sessionControlsExpanded, setSessionControlsExpanded] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (role !== 'standalone') return
    const rawKey = new URLSearchParams(window.location.search).get('session') ?? ''
    const deepLinkKey = rawKey.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    if (deepLinkKey.length !== 6) return
    setSessionKey(deepLinkKey)
    setJoinMode(true)
  }, [role])

  useEffect(() => {
    if (!recoverableCandidate) return
"""
    text = require_replace(text, state_anchor, state_replacement, 'SessionPanel deep-link state')

online_anchor = """  const onlineCandidates = candidates.filter((member) => {
    const lastSeen = new Date(member.last_seen).getTime()
    return Number.isFinite(lastSeen) && now - lastSeen <= 30000
  }).length

"""
if "const candidateJoinUrl" not in text:
    pos = text.rfind(online_anchor)
    if pos < 0:
        raise SystemExit('candidateJoinUrl anchor not found')
    insertion = online_anchor + """  const candidateJoinUrl = useMemo(() => {
    if (!session?.session_key || typeof window === 'undefined') return ''
    const url = new URL(window.location.href)
    url.search = ''
    url.hash = ''
    url.searchParams.set('session', session.session_key)
    return url.toString()
  }, [session?.session_key])

"""
    text = text[:pos] + insertion + text[pos + len(online_anchor):]

old_card = """          <div className=\"session-key-card\">
            <span>Candidate session key</span>
            <strong>{session?.session_key ?? '———'}</strong>
            <small>Share this key with all candidates in this session.</small>
          </div>"""
new_card = """          <div className=\"session-key-card session-share-card\">
            <div className=\"session-key-details\">
              <span>Candidate session key</span>
              <strong>{session?.session_key ?? '———'}</strong>
              <small>Scan the QR code or enter this key manually.</small>
            </div>
            {candidateJoinUrl && (
              <div className=\"session-qr-code\" title={candidateJoinUrl} aria-label={`QR code to join session ${session?.session_key ?? ''}`}>
                <QRCodeSVG value={candidateJoinUrl} size={124} level=\"M\" bgColor=\"#ffffff\" fgColor=\"#071a24\" marginSize={1} />
              </div>
            )}
          </div>"""
if 'session-share-card' not in text:
    text = require_replace(text, old_card, new_card, 'session QR card')

text = text.replace("version.textContent = 'v0.58'", "version.textContent = 'v0.59'")
panel.write_text(text)

css = Path('src/instructor.css')
css_text = css.read_text()
css_block = """

/* v0.59 instructor QR join */
.instructor-session-panel .session-share-card {
  grid-template-columns: minmax(0, 1fr) auto;
  place-items: stretch;
  gap: 16px;
  text-align: left;
}
.instructor-session-panel .session-key-details {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 4px;
  min-width: 0;
  text-align: center;
}
.instructor-session-panel .session-qr-code {
  align-self: center;
  justify-self: end;
  padding: 6px;
  border-radius: 9px;
  background: #fff;
  line-height: 0;
  box-shadow: 0 0 0 1px rgba(255,255,255,.18);
}
@media (max-width: 620px) {
  .instructor-session-panel .session-share-card {
    grid-template-columns: 1fr;
    justify-items: center;
  }
  .instructor-session-panel .session-qr-code { justify-self: center; }
}
"""
if 'v0.59 instructor QR join' not in css_text:
    css.write_text(css_text.rstrip() + css_block + '\n')

wave = Path('src/components/Waveform.tsx')
wave_text = wave.read_text()
pattern = re.compile(r"      if \(showPatientEffortMarkers\) \{.*?\n      \}\n\n      samples\.forEach\(\(sample, index\) => \{\n        if \(!sample\.ventilatorTriggerDetected\) return", re.S)
replacement = r'''      if (showPatientEffortMarkers) {
        const leftLung = new Path2D('M317.298 367.792 C299.364 347.527 275.001 352.427 259.883 367.792 C132.746 497.013 172.64 644.993 172.885 645.487 C177.728 655.243 177.118 678.717 215.088 681.107 C244.197 682.94 328.537 661.448 337.718 633.32 C347.514 603.308 348.369 510.398 348.297 494.118 C347.867 397.513 348.418 402.955 317.298 367.792 Z')
        const rightLung = new Path2D('M446.838 363.832 C464.773 343.567 489.136 348.466 504.254 363.832 C631.39 493.053 591.497 641.033 591.252 641.526 C586.408 651.283 587.019 674.756 549.048 677.147 C519.939 678.98 435.6 657.488 426.418 629.359 C416.622 599.348 415.767 506.437 415.84 490.158 C416.27 393.553 415.719 398.995 446.838 363.832 Z')
        const tracheaLeft = new Path2D('M382.873 328.423 C383.477 368.694 384.761 432.717 382.07 472.669 C381.084 487.316 341.977 521.926 335.778 521.926')
        const tracheaRight = new Path2D('M422.553 511.955 C411.537 511.955 393.695 498.815 384.703 477.126')

        samples.forEach((sample, index) => {
          if (!sample.patientEffortStart) return
          const x = (index / Math.max(1, samples.length - 1)) * width

          // Exact geometry from the supplied lung SVG. The SVG has no white
          // background element, so only the coloured paths are drawn.
          // Tight crop: source bounds x=140..620, y=300..700.
          ctx.save()
          const markerWidth = 18
          const markerHeight = 15
          ctx.translate(x - markerWidth / 2, 1)
          ctx.scale(markerWidth / 480, markerHeight / 400)
          ctx.translate(-140, -300)
          ctx.fillStyle = '#84e4f0'
          ctx.strokeStyle = '#84e4f0'
          ctx.lineWidth = 40
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.fill(leftLung)
          ctx.fill(rightLung)
          ctx.stroke(tracheaLeft)
          ctx.stroke(tracheaRight)
          ctx.restore()
        })
      }

      samples.forEach((sample, index) => {
        if (!sample.ventilatorTriggerDetected) return'''
wave_text, count = pattern.subn(replacement, wave_text, count=1)
if count != 1:
    raise SystemExit(f'patient effort marker replacement count={count}')
wave.write_text(wave_text)

app = Path('src/App.tsx')
app_text = app.read_text().replace('v0.58', 'v0.59')
app.write_text(app_text)

diag = Path('src/diagnostics.ts')
diag_text = diag.read_text()
diag_text = re.sub(r"export const APP_VERSION = '[^']+'", "export const APP_VERSION = '0.59'", diag_text, count=1)
diag.write_text(diag_text)

print('v0.59 patch applied')
