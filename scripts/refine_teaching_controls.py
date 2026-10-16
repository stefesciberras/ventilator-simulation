from pathlib import Path

# App: move laser control to ventilator top action bar and remove Teaching-pane block.
p = Path('src/App.tsx')
s = p.read_text()
anchor = "function NebuliserIcon() {"
assert anchor in s
icon = '''function LaserPointerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="7" cy="17" r="2.2" fill="currentColor" />
      <path d="M9 15l8.5-8.5M13.5 6.5l4 4M17.5 3.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

'''
s = s.replace(anchor, icon + anchor, 1)
old = '''            <div className="action-bar console-top-actions">
            <div className={`oxygen-enrichment-control ${oxygenBoost ? 'active' : ''}`}>
'''
assert old in s
new = '''            <div className="action-bar console-top-actions">
            {teachingSession.role !== 'candidate' && (
              <button
                type="button"
                className={`hardware-button icon-button teaching-laser-console-button ${teachingLaserEnabled ? 'active' : ''}`}
                onClick={() => setTeachingLaserEnabled((enabled) => !enabled)}
                title={teachingLaserEnabled ? 'Turn off teaching laser pointer' : 'Turn on teaching laser pointer'}
                aria-label={teachingLaserEnabled ? 'Turn off teaching laser pointer' : 'Turn on teaching laser pointer'}
                aria-pressed={teachingLaserEnabled}
              ><LaserPointerIcon /></button>
            )}
            <div className={`oxygen-enrichment-control ${oxygenBoost ? 'active' : ''}`}>
'''
s = s.replace(old, new, 1)
old = '''                <TeachingLaserControl
                  role={teachingSession.role}
                  enabled={teachingLaserEnabled}
                  shared={teachingSession.role === 'instructor' && Boolean(teachingSession.session)}
                  onEnabledChange={(enabled) => {
                    setTeachingLaserEnabled(enabled)
                    if (enabled) setMobileWorkspacePage('ventilator')
                  }}
                />
'''
if old in s:
    s = s.replace(old, '', 1)
s = s.replace('TeachingLaserControl, ', '')
p.write_text(s)

# Teaching workspace: draggable candidate panel on wide screens.
p = Path('src/teaching/TeachingWorkspace.tsx')
s = p.read_text()
s = s.replace("import { useEffect, useMemo, useState } from 'react'", "import { useEffect, useMemo, useRef, useState } from 'react'", 1)
old = "  const [collapsed, setCollapsed] = useState(false)\n"
assert old in s
new = '''  const [collapsed, setCollapsed] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
'''
s = s.replace(old, new, 1)
s = s.replace("    setCollapsed(false)\n  }, [prompt?.id])", "    setCollapsed(false)\n    setPosition({ x: 0, y: 0 })\n    dragRef.current = null\n  }, [prompt?.id])", 1)
insert_before = "  if (role !== 'candidate' || !prompt || dismissedPromptId === prompt.id) return null\n"
assert insert_before in s
drag = '''  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (window.innerWidth < 900 || (event.target as HTMLElement).closest('button')) return
    event.preventDefault()
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || window.innerWidth < 900) return
    const panel = event.currentTarget.closest('.teaching-prompt-modal') as HTMLElement | null
    const rect = panel?.getBoundingClientRect()
    const proposedX = drag.originX + event.clientX - drag.startX
    const proposedY = drag.originY + event.clientY - drag.startY
    if (!rect) {
      setPosition({ x: proposedX, y: proposedY })
      return
    }
    const baseLeft = window.innerWidth - rect.width - 18
    const baseTop = window.innerHeight / 2
    const minX = 16 - baseLeft
    const maxX = 0
    const minY = 16 - (baseTop - rect.height / 2)
    const maxY = window.innerHeight - 16 - (baseTop + rect.height / 2)
    setPosition({
      x: Math.max(minX, Math.min(maxX, proposedX)),
      y: Math.max(minY, Math.min(maxY, proposedY)),
    })
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

'''
s = s.replace(insert_before, drag + insert_before, 1)
old = '''      <section className="teaching-prompt-modal" role="dialog" aria-modal="false" aria-labelledby="teaching-prompt-title">
        <div className="teaching-prompt-dock-header">
'''
assert old in s
new = '''      <section
        className="teaching-prompt-modal"
        role="dialog"
        aria-modal="false"
        aria-labelledby="teaching-prompt-title"
        style={{ transform: `translate(${position.x}px, calc(-50% + ${position.y}px))` }}
      >
        <div
          className="teaching-prompt-dock-header"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title="Drag to move this question on wide screens"
        >
'''
s = s.replace(old, new, 1)
p.write_text(s)

# Teaching CSS: orange prompt border + drag affordance; laser icon styling.
p = Path('src/teaching/teaching.css')
s = p.read_text()
s = s.replace('border:1px solid #516670; border-radius:16px;', 'border:2px solid #ef8a27; border-radius:16px;', 1)
s += '''\n/* EDUVENT console laser trigger */
.teaching-laser-console-button { color: #ff766d; }
.teaching-laser-console-button.active {
  color: #fff;
  border-color: #ff5a4f;
  background: #5b2723;
  box-shadow: 0 0 0 1px rgba(255,90,79,.2), 0 0 14px rgba(255,59,48,.35);
}
.teaching-laser-console-button svg { width: 21px; height: 21px; }

@media (min-width: 900px) {
  .teaching-prompt-dock-header { cursor: grab; user-select: none; touch-action: none; }
  .teaching-prompt-dock-header:active { cursor: grabbing; }
}
'''
p.write_text(s)

# Candidate invitation: QR belongs inside Share / Invite dialog.
p = Path('src/components/CandidateInvitation.tsx')
s = p.read_text()
s = s.replace("import { useEffect, useMemo, useState } from 'react'", "import { useEffect, useMemo, useState } from 'react'\nimport { QRCodeSVG } from 'qrcode.react'", 1)
old = '''            <div className="candidate-invite-link-card">
              <span>Direct join link</span>
              <strong>{joinUrl}</strong>
            </div>

            <textarea readOnly value={invitationText} aria-label="Invitation text" rows={7} />
'''
assert old in s
new = '''            <div className="candidate-invite-share-card">
              <div className="candidate-invite-qr" title={joinUrl} aria-label={`QR code to join session ${sessionKey}`}>
                <QRCodeSVG value={joinUrl} size={156} level="M" bgColor="#ffffff" fgColor="#071a24" marginSize={1} />
              </div>
              <div className="candidate-invite-link-card">
                <span>Direct join link</span>
                <strong>{joinUrl}</strong>
                <small>Candidates can scan the QR code or open this direct link.</small>
              </div>
            </div>

            <textarea readOnly value={invitationText} aria-label="Invitation text" rows={7} />
'''
s = s.replace(old, new, 1)
p.write_text(s)

# Candidate invitation CSS.
p = Path('src/candidate-invitation.css')
s = p.read_text()
s += '''\n.candidate-invite-share-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 1rem;
  align-items: center;
  margin-bottom: 0.9rem;
}
.candidate-invite-share-card .candidate-invite-link-card { margin-bottom: 0; }
.candidate-invite-qr {
  display: grid;
  place-items: center;
  padding: 8px;
  border-radius: 12px;
  background: #fff;
  line-height: 0;
}
@media (max-width: 640px) {
  .candidate-invite-share-card { grid-template-columns: 1fr; }
  .candidate-invite-qr { justify-self: center; }
}
'''
p.write_text(s)

# Session panel: QR removed from dashboard and import no longer needed.
p = Path('src/components/SessionPanel.tsx')
s = p.read_text()
s = s.replace("import { QRCodeSVG } from 'qrcode.react'\n", '', 1)
old = '''            {candidateJoinUrl && !simulatorExpanded && (
              <div className="session-qr-code" title={candidateJoinUrl} aria-label={`QR code to join session ${session?.session_key ?? ''}`}>
                <QRCodeSVG value={candidateJoinUrl} size={124} level="M" bgColor="#ffffff" fgColor="#071a24" marginSize={1} />
              </div>
            )}
'''
assert old in s
s = s.replace(old, '', 1)
p.write_text(s)

# Version bump.
p = Path('src/appVersion.ts')
s = p.read_text()
s = s.replace("export const APP_VERSION = '0.82.6.0'", "export const APP_VERSION = '0.82.6.1'")
p.write_text(s)
