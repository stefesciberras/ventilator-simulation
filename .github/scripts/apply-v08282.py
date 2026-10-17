from pathlib import Path

root = Path('.')

p = root / 'src/teaching/TeachingMediaPanel.tsx'
s = p.read_text()
old = '''      <button className="teaching-media-heading" type="button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>
        <span><strong>Media</strong><small>Images and short video clips</small></span>
        <span className="teaching-media-heading-right">
          {activeMediaId && <em>LIVE</em>}
          <b aria-hidden="true">{collapsed ? '▸' : '▾'}</b>
        </span>
      </button>
'''
new = '''      <div className="teaching-prompt-section-heading teaching-media-section-heading">
        <div><h3>Media</h3></div>
        <div className="teaching-prompt-heading-actions">
          {activeMediaId && <span className="teaching-prompt-live-badge">LIVE</span>}
          <button
            type="button"
            className={`teaching-workspace-collapse ${collapsed ? 'collapsed' : 'expanded'}`}
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand Media' : 'Collapse Media'}
          ><span className="teaching-collapse-caret" aria-hidden="true" /></button>
        </div>
      </div>
'''
assert old in s, 'Media heading pattern not found'
p.write_text(s.replace(old, new))

p = root / 'src/teaching/TeachingWorkspace.tsx'
s = p.read_text()
old = '''          <button type="button" className="teaching-workspace-collapse" onClick={() => setWorkspaceCollapsed((collapsed) => !collapsed)} aria-expanded={!workspaceCollapsed} aria-label={workspaceCollapsed ? 'Expand Questions and Polls' : 'Collapse Questions and Polls'}>{workspaceCollapsed ? '⌄' : '⌃'}</button>'''
new = '''          <button type="button" className={`teaching-workspace-collapse ${workspaceCollapsed ? 'collapsed' : 'expanded'}`} onClick={() => setWorkspaceCollapsed((collapsed) => !collapsed)} aria-expanded={!workspaceCollapsed} aria-label={workspaceCollapsed ? 'Expand Questions and Polls' : 'Collapse Questions and Polls'}><span className="teaching-collapse-caret" aria-hidden="true" /></button>'''
assert old in s, 'Workspace collapse pattern not found'
s = s.replace(old, new)
old = '''{kind === 'mcq' && <button type="button" className={`teaching-mark-correct ${markedCorrect ? 'selected' : ''}`} onClick={() => setCorrectOptionId(optionId)} aria-pressed={markedCorrect} title={`Mark option ${String.fromCharCode(65 + index)} as correct`} aria-label={`Mark option ${String.fromCharCode(65 + index)} as correct`}>✓</button>}'''
new = '''{kind === 'mcq' && <button type="button" className={`teaching-mark-correct ${markedCorrect ? 'selected' : ''}`} onClick={() => setCorrectOptionId(optionId)} aria-pressed={markedCorrect} title={`Mark option ${String.fromCharCode(65 + index)} as correct`} aria-label={`Mark option ${String.fromCharCode(65 + index)} as correct`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}'''
assert old in s, 'Correct mark pattern not found'
p.write_text(s.replace(old, new))

p = root / 'src/teaching/teaching.css'
s = p.read_text()
s += '''\n\n/* v0.82.8.2 Teaching visual consistency */\n.teaching-prompt-section-heading { min-height:30px; margin-bottom:12px; }\n.teaching-prompt-section-heading h3 { margin:0; font-size:1rem; line-height:1.2; font-weight:800; letter-spacing:0; }\n.teaching-workspace-collapse { position:relative; display:flex; align-items:center; justify-content:center; width:30px; height:30px; padding:0; line-height:1; }\n.teaching-collapse-caret { display:block; width:9px; height:9px; border-right:2px solid currentColor; border-bottom:2px solid currentColor; transform:translateY(-2px) rotate(45deg); transform-origin:center; transition:transform .15s ease; }\n.teaching-workspace-collapse.expanded .teaching-collapse-caret { transform:translateY(2px) rotate(225deg); }\n.teaching-mark-correct { display:flex; align-items:center; justify-content:center; padding:0; line-height:1; }\n.teaching-mark-correct svg { display:block; width:17px; height:17px; flex:0 0 17px; }\n'''
p.write_text(s)

p = root / 'src/teaching/TeachingMediaPanel.css'
p.write_text('''.teaching-media-panel{margin-top:12px;padding:14px;border:1px solid #334650;border-radius:10px;background:rgba(18,28,34,.96)}.teaching-media-section-heading{margin-bottom:12px}.teaching-media-body{display:grid;gap:10px}.teaching-media-upload-row{display:grid;grid-template-columns:1fr auto;gap:8px}.teaching-media-upload-row input{min-width:0;border:1px solid #40545f;border-radius:7px;background:#0c151a;color:#edf5f7;padding:9px 10px;font:inherit}.teaching-media-upload{display:inline-flex;align-items:center;justify-content:center;border:1px solid #4e6772;border-radius:7px;background:#1c3039;color:#edf5f7;padding:8px 11px;font-weight:800;cursor:pointer}.teaching-media-upload input{display:none}.teaching-media-upload.disabled{opacity:.45;cursor:not-allowed}.teaching-media-session-note{color:#9aabb2}.teaching-media-library{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(180px,.9fr);gap:10px}.teaching-media-list{display:grid;gap:8px;max-height:420px;overflow:auto}.teaching-media-item{padding:9px;border:1px solid #354a54;border-radius:9px;background:#0d171c}.teaching-media-item.selected{border-color:#6b8793}.teaching-media-select{display:grid;grid-template-columns:28px 1fr;gap:8px;align-items:center;width:100%;border:0;background:transparent;color:#eef5f7;text-align:left;padding:0;cursor:pointer}.teaching-media-select>span:last-child{display:grid;gap:2px}.teaching-media-select small{color:#8fa2ab}.teaching-media-kind{display:grid;place-items:center;width:28px;height:28px;border-radius:7px;background:#20323a;color:#f0a05a}.teaching-media-badges{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.teaching-media-badges em{font-style:normal;padding:3px 6px;border-radius:999px;background:#263942;color:#bfd0d7;font-size:.66rem}.teaching-media-badges em.live{background:#ef8a27;color:#111;font-weight:900}.teaching-media-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.teaching-media-actions button{border:1px solid #40545f;border-radius:7px;background:#18272e;color:#edf5f7;padding:6px 8px;font-size:.75rem;cursor:pointer}.teaching-media-actions button.primary{border-color:#ef8a27;background:#ef8a27;color:#111;font-weight:900}.teaching-media-actions button.danger{border-color:#a24c45;background:#4c2523}.teaching-media-actions button.delete{color:#ffaaaa}.teaching-media-actions button:disabled{opacity:.4;cursor:not-allowed}.teaching-media-preview{display:grid;align-content:start;gap:8px;min-height:180px;padding:10px;border:1px solid #354a54;border-radius:9px;background:#0d171c;color:#aebdc4}.teaching-media-preview>strong{color:#eef5f7}.teaching-media-preview-stage{display:grid;place-items:center;min-height:160px;max-height:320px;overflow:hidden;border-radius:7px;background:#060c0f}.teaching-media-preview-stage img,.teaching-media-preview-stage video{display:block;max-width:100%;max-height:320px;object-fit:contain}.teaching-media-message{padding:8px 10px;border:1px solid #315c4c;border-radius:7px;background:#142b24;color:#cce8dc;font-size:.8rem}.teaching-media-error{padding:8px 10px;border:1px solid #783d3d;border-radius:7px;background:#321c1c;color:#ffb2b2;font-size:.8rem}.teaching-media-empty{padding:16px 10px;border:1px dashed #40515a;border-radius:8px;color:#93a5ad;text-align:center}@media(max-width:900px){.teaching-media-library{grid-template-columns:1fr}.teaching-media-preview-stage{max-height:260px}.teaching-media-preview-stage img,.teaching-media-preview-stage video{max-height:260px}}@media(max-width:640px){.teaching-media-upload-row{grid-template-columns:1fr}.teaching-media-upload{min-height:42px}.teaching-media-actions button{flex:1 1 calc(50% - 6px)}}\n''')

p = root / 'src/App.tsx'
s = p.read_text()
old = 'export default function App() {\n  const [ventilator, setVentilator]'
new = 'export default function App() {\n  const [aboutOpen, setAboutOpen] = useState(false)\n  const [ventilator, setVentilator]'
assert old in s, 'App function pattern not found'
s = s.replace(old, new, 1)
old = '''          <span className="version">v{APP_VERSION}</span>'''
new = '''          <span className="version">v{APP_VERSION}</span>\n          <button type="button" className="top-about-button" onClick={() => setAboutOpen(true)}>About</button>'''
assert old in s, 'Version pattern not found'
s = s.replace(old, new, 1)
old = '''      <PhysiologyMeasurementsDialog open={measurementsOpen} measurements={displayedPhysiologyMeasurements} oesophagealEnabled={oesophagealMonitoringEnabled} onClose={() => setMeasurementsOpen(false)} />'''
new = '''      <PhysiologyMeasurementsDialog open={measurementsOpen} measurements={displayedPhysiologyMeasurements} oesophagealEnabled={oesophagealMonitoringEnabled} onClose={() => setMeasurementsOpen(false)} />\n      {aboutOpen && (\n        <div className="about-backdrop" onMouseDown={() => setAboutOpen(false)}>\n          <section className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title" onMouseDown={(event) => event.stopPropagation()}>\n            <div className="about-dialog-heading">\n              <div><span>EDUVENT</span><h2 id="about-title">Mechanical Ventilation Simulator</h2></div>\n              <button type="button" onClick={() => setAboutOpen(false)} aria-label="Close About">×</button>\n            </div>\n            <p>An interactive mechanical ventilation simulator for education and training.</p>\n            <div className="about-version-row"><span>Version</span><strong>v{APP_VERSION}</strong></div>\n            <p className="about-disclaimer">Educational simulation only — not a medical device and not for clinical decision-making.</p>\n          </section>\n        </div>\n      )}'''
assert old in s, 'Physiology dialog pattern not found'
s = s.replace(old, new, 1)
p.write_text(s)

p = root / 'src/styles.css'
s = p.read_text()
s += '''\n\n/* v0.82.8.2 About */\n.top-about-button { padding:5px 7px; border-radius:5px; background:#182229; color:#bfd0d7; border:1px solid #334650; font-size:11px; letter-spacing:.04em; }\n.about-backdrop { position:fixed; inset:0; z-index:8000; display:grid; place-items:center; padding:20px; background:rgba(3,8,11,.76); backdrop-filter:blur(5px); }\n.about-dialog { width:min(460px,100%); padding:22px; border:1px solid #40545f; border-radius:15px; background:#101a20; box-shadow:0 24px 70px rgba(0,0,0,.55); }\n.about-dialog-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }\n.about-dialog-heading span { color:#79c6e2; font-size:11px; font-weight:800; letter-spacing:.2em; }\n.about-dialog-heading h2 { margin:4px 0 0; font-size:1.25rem; line-height:1.2; }\n.about-dialog-heading button { width:32px; height:32px; padding:0; display:grid; place-items:center; border-radius:50%; font-size:20px; line-height:1; }\n.about-dialog > p { color:#b8c6cc; line-height:1.5; }\n.about-version-row { display:flex; align-items:center; justify-content:space-between; gap:16px; margin:18px 0; padding:10px 12px; border:1px solid #334650; border-radius:8px; background:#0d171c; }\n.about-version-row span { color:#8fa2ab; }\n.about-version-row strong { color:#eef5f7; }\n.about-disclaimer { margin-bottom:0; padding-top:14px; border-top:1px solid #293840; font-size:.82rem; color:#8799a1 !important; }\n'''
p.write_text(s)

p = root / 'src/appVersion.ts'
s = p.read_text().replace("export const APP_VERSION = '0.82.8.1'", "export const APP_VERSION = '0.82.8.2'")
p.write_text(s)
