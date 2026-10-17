from pathlib import Path
import re

ROOT = Path('.')

def replace(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Expected text not found in {path}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1))

# types
replace('src/teaching/types.ts',
"""  options: TeachingPromptOption[]\n  status: 'active' | 'closed'\n""",
"""  options: TeachingPromptOption[]\n  answer_released_at: string | null\n  released_correct_option_id: string | null\n  status: 'active' | 'closed'\n""")
replace('src/teaching/types.ts',
"""export interface TeachingPromptDraft {\n  kind: TeachingPromptKind\n  title?: string\n  body: string\n  options?: TeachingPromptOption[]\n}\n""",
"""export interface TeachingPromptDraft {\n  kind: TeachingPromptKind\n  title?: string\n  body: string\n  options?: TeachingPromptOption[]\n  correctOptionId?: string | null\n  explanation?: string | null\n}\n""")

# repository
replace('src/teaching/repository.ts',
"""  const { error } = await supabase.from('teaching_prompts').insert({\n    session_id: sessionId,\n    instructor_id: user.id,\n    kind: draft.kind,\n    title: draft.title?.trim() || null,\n    body: draft.body.trim(),\n    options,\n    status: 'active',\n  })\n  if (error) throw error\n}\n""",
"""  const correctOptionId = draft.kind === 'mcq' ? draft.correctOptionId ?? null : null\n  if (draft.kind === 'mcq' && (!correctOptionId || !options.some((option) => option.id === correctOptionId))) {\n    throw new Error('Choose the correct answer before presenting this MCQ.')\n  }\n\n  const { data: prompt, error } = await supabase.from('teaching_prompts').insert({\n    session_id: sessionId,\n    instructor_id: user.id,\n    kind: draft.kind,\n    title: draft.title?.trim() || null,\n    body: draft.body.trim(),\n    options,\n    status: 'active',\n  }).select('id').single()\n  if (error) throw error\n\n  if (correctOptionId) {\n    const { error: keyError } = await supabase.from('teaching_prompt_answer_keys').insert({\n      prompt_id: prompt.id,\n      session_id: sessionId,\n      instructor_id: user.id,\n      correct_option_id: correctOptionId,\n      explanation: draft.explanation?.trim() || null,\n    })\n    if (keyError) {\n      await supabase.from('teaching_prompts').delete().eq('id', prompt.id)\n      throw keyError\n    }\n  }\n}\n\nexport async function releaseSessionPromptAnswer(promptId: string) {\n  const { data: answerKey, error: keyError } = await supabase\n    .from('teaching_prompt_answer_keys')\n    .select('correct_option_id')\n    .eq('prompt_id', promptId)\n    .single()\n  if (keyError) throw keyError\n\n  const { error } = await supabase\n    .from('teaching_prompts')\n    .update({\n      released_correct_option_id: answerKey.correct_option_id,\n      answer_released_at: new Date().toISOString(),\n    })\n    .eq('id', promptId)\n    .eq('status', 'active')\n  if (error) throw error\n}\n""")

# hook
replace('src/teaching/useTeachingInteractions.ts',
"""  presentSessionPrompt,\n  submitSessionPromptResponse,\n""",
"""  presentSessionPrompt,\n  releaseSessionPromptAnswer,\n  submitSessionPromptResponse,\n""")
replace('src/teaching/useTeachingInteractions.ts',
"""  const submitResponse = async (optionId: string) => {\n""",
"""  const releaseAnswer = async () => {\n    if (role !== 'instructor' || !activePrompt || activePrompt.kind !== 'mcq' || activePrompt.answer_released_at) return\n    setBusy(true)\n    setError(null)\n    try {\n      await releaseSessionPromptAnswer(activePrompt.id)\n      await refresh()\n    } catch (cause) {\n      const message = cause instanceof Error ? cause.message : 'Unable to release the correct answer.'\n      setError(message)\n      throw cause\n    } finally {\n      setBusy(false)\n    }\n  }\n\n  const submitResponse = async (optionId: string) => {\n""")
replace('src/teaching/useTeachingInteractions.ts',
"""  return { activePrompt, responses, myResponse, busy, error, presentPrompt, closePrompt, submitResponse }\n""",
"""  return { activePrompt, responses, myResponse, busy, error, presentPrompt, closePrompt, releaseAnswer, submitResponse }\n""")

# workspace draft/library state + props
replace('src/teaching/TeachingWorkspace.tsx',
"""    options: item.options.map((option) => option.text),\n    module: item.module,\n    tags: item.tags.join(', '),\n""",
"""    options: item.options.map((option) => option.text),\n    module: item.module,\n    tags: item.tags.join(', '),\n    correctOptionId: item.correct_option_id,\n    explanation: item.explanation ?? '',\n""")
replace('src/teaching/TeachingWorkspace.tsx', "MCQ · unmarked", "MCQ")
replace('src/teaching/TeachingWorkspace.tsx',
"""  onPresent,\n  onClose,\n  onSaveLibrary,\n""",
"""  onPresent,\n  onClose,\n  onReleaseAnswer,\n  onSaveLibrary,\n""")
replace('src/teaching/TeachingWorkspace.tsx',
"""  onPresent: (input: TeachingPromptDraft) => Promise<void>\n  onClose: () => Promise<void>\n  onSaveLibrary: (draft: TeachingLibraryDraft, existingId?: string | null) => Promise<TeachingLibraryItem>\n""",
"""  onPresent: (input: TeachingPromptDraft) => Promise<void>\n  onClose: () => Promise<void>\n  onReleaseAnswer: () => Promise<void>\n  onSaveLibrary: (draft: TeachingLibraryDraft, existingId?: string | null) => Promise<TeachingLibraryItem>\n""")
replace('src/teaching/TeachingWorkspace.tsx',
"""  const [options, setOptions] = useState(['', '', '', ''])\n  const [module, setModule] = useState(host.defaultModule)\n""",
"""  const [options, setOptions] = useState(['', '', '', ''])\n  const [correctOptionId, setCorrectOptionId] = useState<string | null>(null)\n  const [explanation, setExplanation] = useState('')\n  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false)\n  const [module, setModule] = useState(host.defaultModule)\n""")
replace('src/teaching/TeachingWorkspace.tsx',
"""    setOptions(['', '', '', ''])\n    setModule(host.defaultModule)\n""",
"""    setOptions(['', '', '', ''])\n    setCorrectOptionId(null)\n    setExplanation('')\n    setModule(host.defaultModule)\n""")
replace('src/teaching/TeachingWorkspace.tsx',
"""    setOptions([...draft.options, '', '', '', '', '', ''].slice(0, Math.max(2, Math.min(6, draft.options.length || 4))))\n    setModule(draft.module)\n""",
"""    setOptions([...draft.options, '', '', '', '', '', ''].slice(0, Math.max(2, Math.min(6, draft.options.length || 4))))\n    setCorrectOptionId(draft.correctOptionId)\n    setExplanation(draft.explanation)\n    setModule(draft.module)\n""")
replace('src/teaching/TeachingWorkspace.tsx',
"""  const promptDraft = (): TeachingPromptDraft => ({\n    kind,\n    title,\n    body: body.trim(),\n    options: kind === 'message' ? [] : normaliseOptions(options),\n  })\n\n  const valid = Boolean(body.trim()) && (kind === 'message' || normaliseOptions(options).length >= 2)\n""",
"""  const promptDraft = (): TeachingPromptDraft => ({\n    kind,\n    title,\n    body: body.trim(),\n    options: kind === 'message' ? [] : normaliseOptions(options),\n    correctOptionId: kind === 'mcq' ? correctOptionId : null,\n    explanation: kind === 'mcq' ? explanation : null,\n  })\n\n  const normalisedOptions = normaliseOptions(options)\n  const markedCorrectAnswerIsValid = kind !== 'mcq' || Boolean(correctOptionId && normalisedOptions.some((option) => option.id === correctOptionId))\n  const valid = Boolean(body.trim()) && (kind === 'message' || normalisedOptions.length >= 2) && markedCorrectAnswerIsValid\n""")
replace('src/teaching/TeachingWorkspace.tsx',
"""      module: module.trim() || host.defaultModule,\n      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),\n""",
"""      module: module.trim() || host.defaultModule,\n      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),\n      correctOptionId: kind === 'mcq' ? correctOptionId : null,\n      explanation: kind === 'mcq' ? explanation : null,\n""")

# collapsible heading/body
replace('src/teaching/TeachingWorkspace.tsx',
"""      <div className=\"teaching-prompt-section-heading\">\n        <div><h3>Questions and Polls</h3></div>\n        {activePrompt && <span className=\"teaching-prompt-live-badge\">LIVE</span>}\n      </div>\n\n      {activePrompt && role === 'instructor' ? (\n""",
"""      <div className=\"teaching-prompt-section-heading\">\n        <div><h3>Questions and Polls</h3></div>\n        <div className=\"teaching-prompt-heading-actions\">\n          {activePrompt && <span className=\"teaching-prompt-live-badge\">LIVE</span>}\n          <button type=\"button\" className=\"teaching-workspace-collapse\" onClick={() => setWorkspaceCollapsed((collapsed) => !collapsed)} aria-expanded={!workspaceCollapsed} aria-label={workspaceCollapsed ? 'Expand Questions and Polls' : 'Collapse Questions and Polls'}>{workspaceCollapsed ? '⌄' : '⌃'}</button>\n        </div>\n      </div>\n\n      {!workspaceCollapsed && <>\n      {activePrompt && role === 'instructor' ? (\n""")
replace('src/teaching/TeachingWorkspace.tsx',
"""      {(promptError || libraryError) && <div className=\"teaching-prompt-error\">{promptError || libraryError}</div>}\n    </section>\n""",
"""      {(promptError || libraryError) && <div className=\"teaching-prompt-error\">{promptError || libraryError}</div>}\n      </>}\n    </section>\n""")

# instructor release button
replace('src/teaching/TeachingWorkspace.tsx',
"""          <button className=\"teaching-prompt-close\" type=\"button\" disabled={promptBusy} onClick={() => void onClose()}>Close prompt</button>\n""",
"""          <div className=\"teaching-live-actions\">\n            {activePrompt.kind === 'mcq' && (\n              <button className=\"teaching-answer-release\" type=\"button\" disabled={promptBusy || Boolean(activePrompt.answer_released_at)} onClick={() => void onReleaseAnswer()}>\n                {activePrompt.answer_released_at ? 'Answer released' : 'Release correct answer'}\n              </button>\n            )}\n            <button className=\"teaching-prompt-close\" type=\"button\" disabled={promptBusy} onClick={() => void onClose()}>Close prompt</button>\n          </div>\n""")

# MCQ selector UI
replace('src/teaching/TeachingWorkspace.tsx',
"""                <div className=\"teaching-prompt-option-editor\">\n                  {options.map((option, index) => (\n                    <label key={index}><span>{String.fromCharCode(65 + index)}</span><input value={option} maxLength={500} onChange={(event) => setOptions((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} /></label>\n                  ))}\n""",
"""                <div className=\"teaching-prompt-option-editor\">\n                  {kind === 'mcq' && <div className=\"teaching-correct-answer-hint\">Mark the correct answer</div>}\n                  {options.map((option, index) => {\n                    const optionId = `opt-${index + 1}`\n                    const markedCorrect = correctOptionId === optionId\n                    return (\n                      <label key={index} className={markedCorrect ? 'correct-answer-marked' : ''}>\n                        <span>{String.fromCharCode(65 + index)}</span>\n                        <input value={option} maxLength={500} onChange={(event) => setOptions((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} />\n                        {kind === 'mcq' && <button type=\"button\" className={`teaching-mark-correct ${markedCorrect ? 'selected' : ''}`} onClick={() => setCorrectOptionId(optionId)} aria-pressed={markedCorrect} title={`Mark option ${String.fromCharCode(65 + index)} as correct`} aria-label={`Mark option ${String.fromCharCode(65 + index)} as correct`}>✓</button>}\n                      </label>\n                    )\n                  })}\n""")

# direct library presentation includes key and old unmarked MCQs cannot present
replace('src/teaching/TeachingWorkspace.tsx',
"""{role === 'instructor' && <button type=\"button\" className=\"primary\" disabled={promptBusy} onClick={() => { void onPresent({ kind: item.kind, title: item.title ?? '', body: item.body, options: item.options }).catch(() => undefined) }}>Present</button>}\n""",
"""{role === 'instructor' && <button type=\"button\" className=\"primary\" disabled={promptBusy || (item.kind === 'mcq' && !item.correct_option_id)} title={item.kind === 'mcq' && !item.correct_option_id ? 'Edit this saved MCQ and mark the correct answer before presenting it.' : undefined} onClick={() => { void onPresent({ kind: item.kind, title: item.title ?? '', body: item.body, options: item.options, correctOptionId: item.correct_option_id, explanation: item.explanation }).catch(() => undefined) }}>Present</button>}\n""")

# candidate dragging geometry
p = ROOT / 'src/teaching/TeachingWorkspace.tsx'
text = p.read_text()
pattern = re.compile(r"  const dragRef = useRef<\{ pointerId: number; startX: number; startY: number; originX: number; originY: number \} \| null>\(null\).*?  const endDrag = \(event: React\.PointerEvent<HTMLDivElement>\) => \{\n    if \(dragRef\.current\?\.pointerId === event\.pointerId\) dragRef\.current = null\n    if \(event\.currentTarget\.hasPointerCapture\?\.\(event\.pointerId\)\) event\.currentTarget\.releasePointerCapture\?\.\(event\.pointerId\)\n  \}\n", re.S)
replacement = """  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; baseLeft: number; baseTop: number; width: number; height: number } | null>(null)\n\n  useEffect(() => {\n    setSelectedOptionId('')\n    setDismissedPromptId(null)\n    setCollapsed(false)\n    setPosition({ x: 0, y: 0 })\n    dragRef.current = null\n  }, [prompt?.id])\n\n  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {\n    if (window.innerWidth < 900 || (event.target as HTMLElement).closest('button')) return\n    const panel = event.currentTarget.closest('.teaching-prompt-modal') as HTMLElement | null\n    if (!panel) return\n    event.preventDefault()\n    const rect = panel.getBoundingClientRect()\n    dragRef.current = {\n      pointerId: event.pointerId,\n      startX: event.clientX,\n      startY: event.clientY,\n      originX: position.x,\n      originY: position.y,\n      baseLeft: rect.left - position.x,\n      baseTop: rect.top - position.y,\n      width: rect.width,\n      height: rect.height,\n    }\n    event.currentTarget.setPointerCapture?.(event.pointerId)\n  }\n\n  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {\n    const drag = dragRef.current\n    if (!drag || drag.pointerId !== event.pointerId || window.innerWidth < 900) return\n    const proposedX = drag.originX + event.clientX - drag.startX\n    const proposedY = drag.originY + event.clientY - drag.startY\n    const margin = 12\n    const minX = margin - drag.baseLeft\n    const maxX = window.innerWidth - margin - (drag.baseLeft + drag.width)\n    const minY = margin - drag.baseTop\n    const maxY = window.innerHeight - margin - (drag.baseTop + drag.height)\n    setPosition({\n      x: Math.max(minX, Math.min(maxX, proposedX)),\n      y: Math.max(minY, Math.min(maxY, proposedY)),\n    })\n  }\n\n  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {\n    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null\n    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)\n  }\n"""
text2, n = pattern.subn(replacement, text, count=1)
if n != 1:
    raise SystemExit(f'candidate drag block replace count {n}')
p.write_text(text2)

# fix transform / candidate feedback
replace('src/teaching/TeachingWorkspace.tsx',
"""        style={{ transform: `translate(${position.x}px, calc(-50% + ${position.y}px))` }}\n""",
"""        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}\n""")
replace('src/teaching/TeachingWorkspace.tsx',
"""              const selected = selectedOptionId === option.id || myResponse?.option_id === option.id\n              return <button key={option.id} type=\"button\" className={selected ? 'selected' : ''} disabled={hasSubmitted || busy} onClick={() => setSelectedOptionId(option.id)}><strong>{String.fromCharCode(65 + index)}</strong><span>{option.text}</span></button>\n""",
"""              const selected = selectedOptionId === option.id || myResponse?.option_id === option.id\n              const answerReleased = Boolean(prompt.answer_released_at && prompt.released_correct_option_id)\n              const correct = answerReleased && prompt.released_correct_option_id === option.id\n              const selectedWrong = answerReleased && myResponse?.option_id === option.id && !correct\n              return <button key={option.id} type=\"button\" className={`${selected ? 'selected' : ''} ${correct ? 'answer-correct' : ''} ${selectedWrong ? 'answer-incorrect' : ''}`} disabled={hasSubmitted || busy} onClick={() => setSelectedOptionId(option.id)}><strong>{String.fromCharCode(65 + index)}</strong><span>{option.text}</span></button>\n""")
replace('src/teaching/TeachingWorkspace.tsx',
"""          <div className=\"teaching-prompt-submitted\"><strong>Response submitted</strong><span>Your answer has been sent to the instructor.</span><button type=\"button\" onClick={() => setDismissedPromptId(prompt.id)}>Return to simulator</button></div>\n""",
"""          <div className={`teaching-prompt-submitted ${prompt.answer_released_at ? 'answer-released' : ''}`}>\n            {prompt.answer_released_at && prompt.released_correct_option_id ? (\n              <>\n                <strong>{myResponse?.option_id === prompt.released_correct_option_id ? 'Correct' : 'Not correct'}</strong>\n                <span>{myResponse?.option_id === prompt.released_correct_option_id ? 'Your response is correct.' : `Correct answer: ${String.fromCharCode(65 + Math.max(0, prompt.options.findIndex((option) => option.id === prompt.released_correct_option_id)))}. ${prompt.options.find((option) => option.id === prompt.released_correct_option_id)?.text ?? ''}`}</span>\n              </>\n            ) : (\n              <>\n                <strong>Response submitted</strong>\n                <span>Your answer has been sent to the instructor. The correct answer will be released by the instructor.</span>\n              </>\n            )}\n            <button type=\"button\" onClick={() => setDismissedPromptId(prompt.id)}>Return to simulator</button>\n          </div>\n""")

# App wiring
replace('src/App.tsx',
"""                  onPresent={teachingPrompts.presentPrompt}\n                  onClose={teachingPrompts.closePrompt}\n""",
"""                  onPresent={teachingPrompts.presentPrompt}\n                  onClose={teachingPrompts.closePrompt}\n                  onReleaseAnswer={teachingPrompts.releaseAnswer}\n""")

# version
replace('src/appVersion.ts', "export const APP_VERSION = '0.82.6.2'", "export const APP_VERSION = '0.82.7.0'")

# CSS append + replace positioning
css = ROOT / 'src/teaching/teaching.css'
ct = css.read_text()
ct = ct.replace(
".teaching-prompt-overlay { inset:0; display:flex; align-items:flex-start; justify-content:flex-end; padding:84px 18px 18px; background:transparent; backdrop-filter:none; pointer-events:none; }\n.teaching-prompt-modal { width:min(430px,38vw); max-height:calc(100dvh - 102px); border-radius:14px; padding:18px; box-shadow:0 18px 48px rgba(0,0,0,.48); pointer-events:auto; }",
".teaching-prompt-overlay { inset:0; display:block; padding:0; background:transparent; backdrop-filter:none; pointer-events:none; }\n.teaching-prompt-modal { position:fixed; top:86px; right:18px; width:min(430px,38vw); max-height:calc(100dvh - 104px); overflow:auto; border-radius:14px; padding:18px; box-shadow:0 18px 48px rgba(0,0,0,.48); pointer-events:auto; }"
)
ct += r'''

/* v0.82.7 teaching marking and workspace refinements */
.teaching-prompt-heading-actions { display:flex; align-items:center; gap:8px; }
.teaching-workspace-collapse { width:30px; height:30px; display:grid; place-items:center; border:1px solid #40545f; border-radius:7px; background:#15242b; color:#dce9ed; cursor:pointer; font-size:1rem; font-weight:800; }
.teaching-prompt-instructor:has(.teaching-workspace-collapse[aria-expanded="false"]) { padding-bottom:10px; }
.teaching-live-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
.teaching-live-actions .teaching-prompt-close { margin-top:0; }
.teaching-answer-release { border:1px solid #ef8a27; border-radius:8px; background:#3a2a18; color:#ffc17d; padding:10px 12px; font-weight:800; cursor:pointer; }
.teaching-answer-release:disabled { opacity:.65; cursor:default; }
.teaching-correct-answer-hint { color:#f0b06e; font-size:.76rem; font-weight:800; letter-spacing:.02em; }
.teaching-prompt-option-editor label { grid-template-columns:28px 1fr auto; }
.teaching-prompt-option-editor label.correct-answer-marked { padding:4px; margin:-4px; border-radius:8px; background:rgba(52, 121, 77, .16); }
.teaching-mark-correct { width:30px; height:30px; display:grid; place-items:center; border:1px solid #4a5d66; border-radius:50%; background:#17262e; color:#8fa2ab; cursor:pointer; font-weight:900; }
.teaching-mark-correct.selected { border-color:#4ebc76; background:#245c38; color:#effff4; box-shadow:0 0 0 2px rgba(78,188,118,.12); }
.teaching-prompt-candidate-options button.answer-correct { border-color:#4ebc76; background:#173524; }
.teaching-prompt-candidate-options button.answer-correct strong { background:#3c9b5e; color:#fff; }
.teaching-prompt-candidate-options button.answer-incorrect { border-color:#d96666; background:#3a2020; }
.teaching-prompt-candidate-options button.answer-incorrect strong { background:#a94646; color:#fff; }
.teaching-prompt-submitted.answer-released { border-color:#4a6f5c; }
@media (min-width:900px) {
  .teaching-prompt-dock-header { position:sticky; top:-18px; z-index:3; margin:-18px -18px 10px; padding:12px 14px; background:#101b21; border-bottom:1px solid #344751; cursor:grab; }
  .teaching-prompt-dock-header:active { cursor:grabbing; }
}
@media (max-width:899px) {
  .teaching-prompt-modal { position:relative; top:auto; right:auto; transform:none !important; }
}
@media (max-width:640px) {
  .teaching-live-actions { grid-template-columns:1fr; }
}
'''
css.write_text(ct)

print('Teaching marking implementation patched successfully')
