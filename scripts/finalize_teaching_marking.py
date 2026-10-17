from pathlib import Path

workspace = Path('src/teaching/TeachingWorkspace.tsx')
text = workspace.read_text()
text = text.replace('MCQ · unmarked', 'MCQ')

anchor = """  useEffect(() => {\n    setSelectedOptionId('')\n    setDismissedPromptId(null)\n    setCollapsed(false)\n    setPosition({ x: 0, y: 0 })\n    dragRef.current = null\n  }, [prompt?.id])\n"""
addition = anchor + """\n  useEffect(() => {\n    if (!prompt?.answer_released_at || !myResponse) return\n    setDismissedPromptId(null)\n    setCollapsed(false)\n  }, [prompt?.answer_released_at, myResponse?.id])\n"""
if addition not in text:
    if anchor not in text:
        raise SystemExit('candidate prompt reset effect not found')
    text = text.replace(anchor, addition, 1)
workspace.write_text(text)

css = Path('src/teaching/teaching.css')
ct = css.read_text()
marker = '/* v0.82.7 responsive candidate prompt finalization */'
if marker not in ct:
    ct += r'''

/* v0.82.7 responsive candidate prompt finalization */
@media (max-width:899px) {
  .teaching-prompt-overlay {
    display:flex;
    align-items:flex-start;
    justify-content:flex-end;
    padding:74px 10px 10px;
  }
  .teaching-prompt-modal {
    position:relative;
    top:auto;
    right:auto;
    width:min(430px,58vw);
    max-height:calc(100dvh - 84px);
    transform:none !important;
  }
}
@media (max-width:640px) {
  .teaching-prompt-overlay {
    display:flex;
    align-items:flex-end;
    justify-content:stretch;
    padding:0;
  }
  .teaching-prompt-modal {
    width:100%;
    max-height:72dvh;
    border-radius:18px 18px 0 0;
    border-left:0;
    border-right:0;
    border-bottom:0;
    padding:18px 16px calc(18px + env(safe-area-inset-bottom));
  }
}
'''
css.write_text(ct)

print('Final teaching marking refinements applied')
