import fs from 'node:fs'

function edit(path, changes) {
  let text = fs.readFileSync(path, 'utf8')
  for (const { from, to, label, regex } of changes) {
    if (regex) {
      if (!regex.test(text)) throw new Error(`${path}: missing ${label}`)
      text = text.replace(regex, to)
    } else {
      if (!text.includes(from)) throw new Error(`${path}: missing ${label}`)
      text = text.replace(from, to)
    }
  }
  fs.writeFileSync(path, text)
}

edit('src/App.tsx', [
  {
    label: 'shared freeze short press behavior',
    from: `  const handleFreezeClick = () => {\n    if (freezeLongPressTriggeredRef.current) {\n      freezeLongPressTriggeredRef.current = false\n      return\n    }\n    toggleFreeze()\n  }`,
    to: `  const handleFreezeClick = () => {\n    if (freezeLongPressTriggeredRef.current) {\n      freezeLongPressTriggeredRef.current = false\n      return\n    }\n    if (teachingSession.role === 'candidate' && sharedWaveformFreeze.active) return\n    if (teachingSession.role === 'instructor' && sharedWaveformFreeze.active) {\n      setWaveformFrozen(false)\n      setFrozenSamples(null)\n      sharedWaveformFreeze.setActive(false)\n      return\n    }\n    toggleFreeze()\n  }`,
  },
  {
    label: 'freeze control group',
    regex: /            <button\n              className=\{`hardware-button icon-button freeze-button \$\{waveformFrozen \? 'active' : ''\} \$\{sharedWaveformFreeze\.active \? 'shared-freeze' : ''\}`\}[\s\S]*?            ><FreezeWaveformIcon \/><\/button>/,
    to: `            <div className="freeze-control-group">\n              <button\n                className={\`hardware-button icon-button freeze-button \${waveformFrozen ? 'active' : ''} \${sharedWaveformFreeze.active ? 'shared-freeze' : ''}\`}\n                onClick={handleFreezeClick}\n                onPointerDown={startFreezeLongPress}\n                onPointerUp={finishFreezePress}\n                onPointerCancel={finishFreezePress}\n                onPointerLeave={finishFreezePress}\n                onContextMenu={(event) => event.preventDefault()}\n                disabled={teachingSession.role === 'candidate' && sharedWaveformFreeze.active}\n                title={sharedWaveformFreeze.active\n                  ? (teachingSession.role === 'instructor' ? 'All screens frozen — press to resume all' : 'All screens frozen by instructor')\n                  : (teachingSession.role === 'instructor' ? 'Press to freeze locally; hold to freeze instructor and candidate waveforms' : (waveformFrozen ? 'Resume waveforms' : 'Freeze waveforms'))}\n                aria-label={sharedWaveformFreeze.active ? 'All screens frozen' : (waveformFrozen ? 'Resume waveforms' : 'Freeze waveforms')}\n              ><FreezeWaveformIcon /></button>\n              {sharedWaveformFreeze.active && <span className="shared-freeze-label">All screens frozen</span>}\n            </div>`,
  },
])

const stylesPath = 'src/styles.css'
let styles = fs.readFileSync(stylesPath, 'utf8')
if (!styles.includes('.shared-freeze-label')) {
  styles += `\n\n.freeze-control-group { display:flex; flex-direction:column; align-items:center; justify-content:flex-start; gap:2px; min-width:0; }\n.freeze-control-group .freeze-button { flex:0 0 auto; }\n.shared-freeze-label { max-width:64px; color:#ef9a46; font-size:.58rem; font-weight:800; line-height:1.05; text-align:center; white-space:normal; }\n.freeze-control-group .freeze-button:disabled { opacity:.72; cursor:not-allowed; }\n`
  fs.writeFileSync(stylesPath, styles)
}

const teachingCssPath = 'src/teaching/teaching.css'
let teachingCss = fs.readFileSync(teachingCssPath, 'utf8')
if (!teachingCss.includes('.teaching-media-laser-overlay')) {
  teachingCss += `\n\n/* Presented-media laser pointer */\n.teaching-media-laser-overlay { position:fixed; inset:0; z-index:6200; display:grid; place-items:center; padding:18px; background:rgba(3,8,11,.78); backdrop-filter:blur(5px); }\n.teaching-media-laser-modal { width:min(980px,96vw); max-height:94vh; display:grid; grid-template-rows:auto minmax(0,1fr); overflow:hidden; border:2px solid #ef8a27; border-radius:16px; background:#101b21; box-shadow:0 24px 70px rgba(0,0,0,.58); }\n.teaching-media-laser-modal > header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 14px; border-bottom:1px solid #344751; }\n.teaching-media-laser-modal > header > div { display:grid; gap:2px; }\n.teaching-media-laser-modal > header span { color:#ef9a46; font-size:.72rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }\n.teaching-media-laser-modal > header strong { color:#fff; }\n.teaching-media-laser-modal > header button { border:1px solid #53636a; border-radius:8px; background:#24343c; color:#eef5f7; padding:7px 11px; font-weight:800; cursor:pointer; }\n.teaching-media-laser-stage { min-height:0; display:grid; place-items:center; overflow:auto; padding:14px; cursor:crosshair; touch-action:none; user-select:none; }\n.teaching-media-laser-image-frame { position:relative; display:inline-block; max-width:100%; line-height:0; }\n.teaching-media-laser-image-frame img { display:block; max-width:100%; max-height:78vh; width:auto; height:auto; object-fit:contain; }\n.teaching-media-laser-image-frame.candidate img { max-height:70vh; }\n.teaching-media-laser-dot { position:absolute; width:13px; height:13px; border-radius:50%; transform:translate(-50%,-50%); background:#ff2d20; border:2px solid rgba(255,255,255,.95); box-shadow:0 0 5px #fff,0 0 12px #ff3b30,0 0 24px rgba(255,59,48,.95); pointer-events:none; z-index:4; }\n.teaching-media-laser-dot::after { content:''; position:absolute; inset:-12px; border-radius:50%; border:1px solid rgba(255,70,60,.45); box-shadow:0 0 18px rgba(255,45,32,.45); }\n@media (max-width:640px) { .teaching-media-laser-overlay { padding:0; align-items:end; } .teaching-media-laser-modal { width:100%; max-height:96dvh; border-radius:18px 18px 0 0; border-left:0; border-right:0; border-bottom:0; } }\n`
  fs.writeFileSync(teachingCssPath, teachingCss)
}

edit('src/appVersion.ts', [
  { label: 'version bump', from: `export const APP_VERSION = '0.82.9.5'`, to: `export const APP_VERSION = '0.82.9.6'` },
])

console.log('Applied v0.82.9.6 UI and freeze changes')
