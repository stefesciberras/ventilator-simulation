from pathlib import Path

# Simplify reusable questions/polls workspace wording and navigation.
p = Path('src/teaching/TeachingWorkspace.tsx')
s = p.read_text()

s = s.replace(
    "return libraryItems.filter((item) => [item.title ?? '', item.body, item.module, ...item.tags].join(' ').toLowerCase().includes(needle))",
    "return libraryItems.filter((item) => [item.title ?? '', item.body, ...item.tags].join(' ').toLowerCase().includes(needle))",
)

old = '''      <div className="teaching-prompt-section-heading">
        <div><span className="session-kicker">Reusable teaching module</span><h3>Teaching workspace</h3><small>{host.appName}</small></div>
        {activePrompt && <span className="teaching-prompt-live-badge">LIVE</span>}
      </div>'''
assert old in s
new = '''      <div className="teaching-prompt-section-heading">
        <div><h3>Questions and Polls</h3></div>
        {activePrompt && <span className="teaching-prompt-live-badge">LIVE</span>}
      </div>'''
s = s.replace(old, new, 1)

old = '''          <div className="teaching-workspace-tabs">
            <button type="button" className={view === 'compose' ? 'active' : ''} onClick={() => setView('compose')}>Compose</button>
            <button type="button" className={view === 'library' ? 'active' : ''} onClick={() => setView('library')}>Question library <span>{libraryItems.length}</span></button>
          </div>'''
assert old in s
new = '''          <div className="teaching-workspace-navigation">
            <button
              type="button"
              className={`teaching-add-question ${view === 'compose' ? 'active' : ''}`}
              onClick={() => { resetComposer(); setView('compose') }}
            >
              <span className="teaching-add-question-icon" aria-hidden="true">+</span>
              <span>Add new Question / Poll</span>
            </button>
            <button
              type="button"
              className={`teaching-library-navigation ${view === 'library' ? 'active' : ''}`}
              onClick={() => setView('library')}
            >
              <span>Question library</span>
              <span className="teaching-library-count">{libraryItems.length}</span>
            </button>
          </div>'''
s = s.replace(old, new, 1)

s = s.replace(
    '''              <div className="teaching-composer-toolbar"><button type="button" onClick={resetComposer}>New</button>{editingLibraryId && <span>Editing saved question</span>}</div>\n''',
    '''              {editingLibraryId && <div className="teaching-composer-toolbar"><span>Editing saved question</span></div>}\n''',
    1,
)

module_label = '''              <label>Module<input value={module} maxLength={120} onChange={(event) => setModule(event.target.value)} placeholder="e.g. Ventilation, Anaesthesia, Airway" /></label>\n'''
assert module_label in s
s = s.replace(module_label, '', 1)

standalone_hint = '''              {role !== 'instructor' && <small className="teaching-library-hint">You can prepare questions now. Start an instructor session when you want to present them.</small>}\n'''
assert standalone_hint in s
s = s.replace(standalone_hint, '', 1)

s = s.replace('placeholder="Search title, text, module or tags…"', 'placeholder="Search questions, polls or tags…"', 1)

old = '''                          <div className="teaching-library-card-heading"><div><span>{item.module}</span><strong>{item.title || 'Untitled'}</strong></div><em>{item.kind === 'message' ? 'Info' : item.kind.toUpperCase()}</em></div>'''
assert old in s
new = '''                          <div className="teaching-library-card-heading"><div><strong>{item.title || 'Untitled'}</strong></div><em>{item.kind === 'message' ? 'Info' : item.kind.toUpperCase()}</em></div>'''
s = s.replace(old, new, 1)

s = s.replace(
    ") : <div className=\"teaching-library-empty\">No saved questions match this search.</div>}",
    ") : <div className=\"teaching-library-empty\">{search.trim() ? 'No saved questions or polls match this search.' : 'No saved questions or polls yet.'}</div>}",
    1,
)

p.write_text(s)

# Styling: vertical add/library navigation and laser-dot toolbar icon.
p = Path('src/teaching/teaching.css')
s = p.read_text()
old = '''.teaching-workspace-tabs { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:12px; }
.teaching-workspace-tabs button { border:1px solid #3c505a; border-radius:8px; background:#142128; color:#bdd0d8; padding:9px 10px; font-weight:700; cursor:pointer; }
.teaching-workspace-tabs button.active { border-color:#ef8a27; color:#fff; background:#26231c; }
.teaching-workspace-tabs button span { margin-left:5px; opacity:.7; }
'''
assert old in s
new = '''.teaching-workspace-navigation { display:grid; gap:7px; margin-bottom:12px; }
.teaching-workspace-navigation button { width:100%; box-sizing:border-box; border:1px solid #3c505a; border-radius:8px; background:#142128; color:#bdd0d8; padding:10px 12px; font-weight:700; cursor:pointer; }
.teaching-workspace-navigation button.active { border-color:#658492; color:#fff; background:#1d2c33; }
.teaching-add-question { display:flex; align-items:center; gap:10px; text-align:left; }
.teaching-add-question-icon { display:grid; place-items:center; width:28px; height:28px; flex:0 0 28px; border-radius:50%; background:#ef8a27; color:#111; font-size:1.35rem; font-weight:500; line-height:1; }
.teaching-library-navigation { display:flex; align-items:center; justify-content:space-between; gap:12px; text-align:left; }
.teaching-library-count { display:grid; place-items:center; min-width:24px; height:24px; padding:0 5px; box-sizing:border-box; border-radius:999px; background:#263942; color:#c7d7dd; font-size:.76rem; }
'''
s = s.replace(old, new, 1)

# Remove obsolete module-label-specific visual emphasis; keep generic card heading intact.
s += '''
/* Compact laser control: match the visible laser spot rather than a pointer glyph. */
.teaching-laser-console-button svg { display:none; }
.teaching-laser-console-button::before {
  content:'';
  display:block;
  width:10px;
  height:10px;
  border-radius:50%;
  background:#ff3228;
  box-shadow:0 0 4px rgba(255,255,255,.75), 0 0 8px rgba(255,50,40,.95), 0 0 15px rgba(255,45,32,.7);
}
.teaching-laser-console-button.active::before {
  background:#ff4338;
  box-shadow:0 0 5px #fff, 0 0 11px #ff3b30, 0 0 20px rgba(255,59,48,.95);
}
'''
p.write_text(s)

# Toolbar tooltip wording.
p = Path('src/App.tsx')
s = p.read_text()
s = s.replace(
    "title={teachingLaserEnabled ? 'Turn off teaching laser pointer' : 'Turn on teaching laser pointer'}",
    "title={teachingLaserEnabled ? 'Turn off laser pointer' : 'Laser pointer'}",
    1,
)
s = s.replace(
    "aria-label={teachingLaserEnabled ? 'Turn off teaching laser pointer' : 'Turn on teaching laser pointer'}",
    "aria-label={teachingLaserEnabled ? 'Turn off laser pointer' : 'Laser pointer'}",
    1,
)
p.write_text(s)

# Version bump.
p = Path('src/appVersion.ts')
s = p.read_text()
assert "export const APP_VERSION = '0.82.6.1'" in s
s = s.replace("export const APP_VERSION = '0.82.6.1'", "export const APP_VERSION = '0.82.6.2'", 1)
p.write_text(s)
