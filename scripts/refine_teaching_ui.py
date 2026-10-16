from pathlib import Path

p = Path('src/teaching/TeachingWorkspace.tsx')
s = p.read_text()
s = s.replace('''  laserEnabled = false,
  laserAvailable = false,
  onLaserEnabledChange,
''','',1)
s = s.replace('''  laserEnabled?: boolean
  laserAvailable?: boolean
  onLaserEnabledChange?: (enabled: boolean) => void
''','',1)
laser_block = '''      {onLaserEnabledChange && (
        <div className="teaching-laser-control-row">
          <button
            type="button"
            className={`teaching-laser-toggle ${laserEnabled ? 'active' : ''}`}
            disabled={!laserAvailable}
            aria-pressed={laserEnabled}
            onClick={() => onLaserEnabledChange(!laserEnabled)}
          ><span className="teaching-laser-button-dot" />{laserEnabled ? 'Laser pointer on' : 'Laser pointer'}</button>
          <small>{laserAvailable ? (laserEnabled ? 'Move over the simulator display to point. Use Exit on the display or press here again to stop.' : 'Show a live pointer on candidate simulator displays.') : 'Start an instructor session to use the laser pointer.'}</small>
        </div>
      )}

'''
assert laser_block in s
s = s.replace(laser_block, '', 1)
start = s.index('export function TeachingCandidateOverlay({')
s = s[:start] + '''export function TeachingCandidateOverlay({
  role,
  prompt,
  myResponse,
  busy,
  error,
  onSubmit,
}: {
  role: TeachingRole
  prompt: TeachingPromptRow | null
  myResponse: TeachingPromptResponseRow | null
  busy: boolean
  error: string | null
  onSubmit: (optionId: string) => Promise<void>
}) {
  const [selectedOptionId, setSelectedOptionId] = useState('')
  const [dismissedPromptId, setDismissedPromptId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setSelectedOptionId('')
    setDismissedPromptId(null)
    setCollapsed(false)
  }, [prompt?.id])

  if (role !== 'candidate' || !prompt || dismissedPromptId === prompt.id) return null
  const hasSubmitted = Boolean(myResponse)

  if (collapsed) {
    return (
      <button type="button" className="teaching-prompt-reopen" onClick={() => setCollapsed(false)} aria-label="Show current teaching question">
        <span>{prompt.kind === 'message' ? 'Teaching point' : prompt.kind === 'poll' ? 'Poll' : 'Question'}</span><strong>Show</strong>
      </button>
    )
  }

  return (
    <div className="teaching-prompt-overlay" role="presentation">
      <section className="teaching-prompt-modal" role="dialog" aria-modal="false" aria-labelledby="teaching-prompt-title">
        <div className="teaching-prompt-dock-header">
          <span className="teaching-prompt-kind">{prompt.kind === 'message' ? 'Instructor information' : prompt.kind === 'mcq' ? 'Question' : 'Poll'}</span>
          <button type="button" onClick={() => setCollapsed(true)} aria-label="Temporarily hide question">Hide</button>
        </div>
        <h2 id="teaching-prompt-title">{prompt.title || (prompt.kind === 'message' ? 'Teaching point' : 'Your response')}</h2>
        <p className="teaching-prompt-body">{prompt.body}</p>
        {prompt.kind !== 'message' && (
          <div className="teaching-prompt-candidate-options">
            {prompt.options.map((option, index) => {
              const selected = selectedOptionId === option.id || myResponse?.option_id === option.id
              return <button key={option.id} type="button" className={selected ? 'selected' : ''} disabled={hasSubmitted || busy} onClick={() => setSelectedOptionId(option.id)}><strong>{String.fromCharCode(65 + index)}</strong><span>{option.text}</span></button>
            })}
          </div>
        )}
        {prompt.kind === 'message' ? (
          <button className="teaching-prompt-primary" type="button" onClick={() => setDismissedPromptId(prompt.id)}>Continue</button>
        ) : hasSubmitted ? (
          <div className="teaching-prompt-submitted"><strong>Response submitted</strong><span>Your answer has been sent to the instructor.</span><button type="button" onClick={() => setDismissedPromptId(prompt.id)}>Return to simulator</button></div>
        ) : (
          <button className="teaching-prompt-primary" type="button" disabled={!selectedOptionId || busy} onClick={() => void onSubmit(selectedOptionId)}>Submit response</button>
        )}
        {error && <div className="teaching-prompt-error">{error}</div>}
      </section>
    </div>
  )
}
'''
p.write_text(s)

p = Path('src/App.tsx')
s = p.read_text()
s = s.replace('TeachingCandidateOverlay, TeachingInstructorWorkspace, TeachingLaserPointerSurface,', 'TeachingCandidateOverlay, TeachingInstructorWorkspace, TeachingLaserControl, TeachingLaserPointerSurface,', 1)
needle = '''                />
      <TeachingInstructorWorkspace
'''
assert needle in s
s = s.replace(needle, '''                />
      <TeachingLaserControl
        role={teachingSession.role}
        enabled={teachingLaserEnabled}
        sessionActive={teachingSession.role === 'instructor' && Boolean(teachingSession.session)}
        onEnabledChange={(enabled) => {
          setTeachingLaserEnabled(enabled)
          if (enabled) setMobileWorkspacePage('ventilator')
        }}
      />
      <TeachingInstructorWorkspace
''', 1)
block='''        laserEnabled={teachingLaserEnabled}
        laserAvailable={teachingSession.role === 'instructor' && Boolean(teachingSession.session)}
        onLaserEnabledChange={(enabled) => {
          setTeachingLaserEnabled(enabled)
          if (enabled) setMobileWorkspacePage('ventilator')
        }}
'''
assert block in s
s=s.replace(block,'',1)
p.write_text(s)

p = Path('src/teaching/teaching.css')
s = p.read_text()
s += '''

.teaching-laser-panel { margin-top:12px; padding:14px; border:1px solid #334650; border-radius:10px; background:rgba(18,28,34,.96); }
.teaching-laser-panel-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
.teaching-laser-panel-heading h3 { margin:2px 0 0; }
.teaching-laser-mode { padding:3px 7px; border-radius:999px; font-size:.7rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }
.teaching-laser-mode.local { background:#24343c; color:#b9d1dc; }
.teaching-laser-mode.shared { background:#492522; color:#ffb0aa; }
.teaching-laser-panel .teaching-laser-control-row { margin:0; }

.teaching-prompt-overlay { inset:0; display:flex; align-items:flex-start; justify-content:flex-end; padding:84px 18px 18px; background:transparent; backdrop-filter:none; pointer-events:none; }
.teaching-prompt-modal { width:min(430px,38vw); max-height:calc(100dvh - 102px); border-radius:14px; padding:18px; box-shadow:0 18px 48px rgba(0,0,0,.48); pointer-events:auto; }
.teaching-prompt-dock-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:4px; }
.teaching-prompt-dock-header .teaching-prompt-kind { margin-bottom:0; }
.teaching-prompt-dock-header button { border:1px solid #4a5d66; border-radius:999px; background:#1b2a31; color:#dfeaec; padding:5px 10px; cursor:pointer; }
.teaching-prompt-reopen { position:fixed; z-index:5001; top:92px; right:12px; display:flex; align-items:center; gap:9px; border:1px solid #ef8a27; border-radius:999px; background:#18242a; color:#eef5f7; padding:8px 11px 8px 13px; box-shadow:0 8px 24px rgba(0,0,0,.35); cursor:pointer; }
.teaching-prompt-reopen span { color:#f0b06e; font-size:.75rem; font-weight:800; text-transform:uppercase; letter-spacing:.05em; }
.teaching-prompt-reopen strong { font-size:.8rem; }
@media (max-width:900px) { .teaching-prompt-overlay { padding:74px 10px 10px; } .teaching-prompt-modal { width:min(390px,48vw); } }
@media (max-width:640px) { .teaching-prompt-overlay { align-items:end; justify-content:stretch; padding:0; } .teaching-prompt-modal { width:100%; max-height:72dvh; border-radius:18px 18px 0 0; border-left:0; border-right:0; border-bottom:0; padding:18px 16px calc(18px + env(safe-area-inset-bottom)); } .teaching-prompt-reopen { top:auto; right:10px; bottom:calc(12px + env(safe-area-inset-bottom)); } }
'''
p.write_text(s)
Path('src/appVersion.ts').write_text("export const APP_VERSION = '0.82.6.0'\n")
