from pathlib import Path

controls = Path('src/components/Controls.tsx')
text = controls.read_text()

old = """  const predictedBodyWeight = calculatePredictedBodyWeight(settings.sex ?? 'male', settings.heightCm ?? 170)\n  const [collapsed, setCollapsed] = useState(() => loadPanelCollapsed('patient-settings'))\n"""
new = """  const predictedBodyWeight = calculatePredictedBodyWeight(settings.sex ?? 'male', settings.heightCm ?? 170)\n  const [selectedPreset, setSelectedPreset] = useState<string | null>(() => {\n    if (typeof window === 'undefined') return null\n    return window.localStorage.getItem('eduvent.patient-preset')\n  })\n  const [collapsed, setCollapsed] = useState(() => loadPanelCollapsed('patient-settings'))\n"""
if old not in text: raise SystemExit('selected preset insertion target missing')
text = text.replace(old, new, 1)

old = """  const normalPhysiology = { sex: 'male' as const, heightCm: 170, oxygenConsumption: 250, frc: 2500, maxSpO2: 100, co2Production: 250, deadSpaceVolume: 150 }\n  const presets: Record<string, PatientSettings> = {\n    Normal: { ...normalPhysiology, shuntFraction: 0.03, compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1, effortRisePercent: 50, effortRelaxationPercent: 50, endExpiratoryOesophagealPressure: -5 },\n    ARDS: { ...normalPhysiology, shuntFraction: 0.25, compliance: 25, resistance: 8, expiratoryResistance: 10, spontaneousRate: 25, effort: 10, neuralInspiratoryTime: 0.8, effortRisePercent: 20, effortRelaxationPercent: 25, endExpiratoryOesophagealPressure: -5 },\n    COPD: { ...normalPhysiology, shuntFraction: 0.05, compliance: 80, resistance: 16, expiratoryResistance: 28, spontaneousRate: 18, effort: 8, neuralInspiratoryTime: 0.9, effortRisePercent: 30, effortRelaxationPercent: 40, endExpiratoryOesophagealPressure: -5 },\n    Asthma: { ...normalPhysiology, shuntFraction: 0.04, compliance: 70, resistance: 25, expiratoryResistance: 40, spontaneousRate: 24, effort: 11, neuralInspiratoryTime: 0.8, effortRisePercent: 20, effortRelaxationPercent: 30, endExpiratoryOesophagealPressure: -5 },\n  }\n\n"""
new = """  const normalAdultFrc = Math.round(calculatePredictedBodyWeight('male', 170) * 30)\n  const normalPhysiology = { sex: 'male' as const, heightCm: 170, oxygenConsumption: 250, frc: normalAdultFrc, maxSpO2: 100, co2Production: 250, deadSpaceVolume: 150 }\n  const presets: Record<string, PatientSettings> = {\n    Normal: { ...normalPhysiology, shuntFraction: 0.03, compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1, effortRisePercent: 50, effortRelaxationPercent: 50, endExpiratoryOesophagealPressure: -5 },\n    ARDS: { ...normalPhysiology, shuntFraction: 0.25, compliance: 25, resistance: 8, expiratoryResistance: 10, spontaneousRate: 0, effort: 10, neuralInspiratoryTime: 0.8, effortRisePercent: 20, effortRelaxationPercent: 25, endExpiratoryOesophagealPressure: -5 },\n    COPD: { ...normalPhysiology, shuntFraction: 0.05, compliance: 80, resistance: 16, expiratoryResistance: 28, spontaneousRate: 18, effort: 8, neuralInspiratoryTime: 0.9, effortRisePercent: 30, effortRelaxationPercent: 40, endExpiratoryOesophagealPressure: -5 },\n    Asthma: { ...normalPhysiology, shuntFraction: 0.04, compliance: 70, resistance: 25, expiratoryResistance: 40, spontaneousRate: 24, effort: 11, neuralInspiratoryTime: 0.8, effortRisePercent: 20, effortRelaxationPercent: 30, endExpiratoryOesophagealPressure: -5 },\n    Paed: { sex: 'male', heightCm: 110, oxygenConsumption: 120, frc: 500, shuntFraction: 0.03, maxSpO2: 100, co2Production: 100, deadSpaceVolume: 40, compliance: 20, resistance: 8, expiratoryResistance: 10, spontaneousRate: 22, effort: 5, neuralInspiratoryTime: 0.7, effortRisePercent: 40, effortRelaxationPercent: 40, endExpiratoryOesophagealPressure: -4 },\n  }\n\n  const applyPreset = (name: string) => {\n    const preset = presets[name]\n    if (!preset) return\n    setSelectedPreset(name)\n    try { window.localStorage.setItem('eduvent.patient-preset', name) } catch { /* optional UI preference */ }\n    onChange({ ...preset })\n  }\n\n"""
if old not in text: raise SystemExit('preset block target missing')
text = text.replace(old, new, 1)

text = text.replace(
    "<section className={`control-section patient-section ${collapsible && collapsed ? 'panel-collapsed' : ''}`}>",
    "<section className={`control-section patient-section ${view === 'physiology' ? 'physiology-view' : ''} ${collapsible && collapsed ? 'panel-collapsed' : ''}`}>",
    1,
)

old = """      {view !== 'physiology' && <div className=\"control-section-title\">\n        <h2>Patient settings</h2>\n        <div className=\"control-section-title-actions\">\n          <button className=\"reset-settings-button patient-reset-button\" type=\"button\" onClick={onReset}>Reset respiratory</button>\n          {collapsible && <button className=\"panel-collapse-button\" type=\"button\" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand patient settings' : 'Collapse patient settings'} title={collapsed ? 'Expand patient settings' : 'Collapse patient settings'}>{collapsed ? '▾' : '▴'}</button>}\n        </div>\n      </div>}\n      {view !== 'physiology' && <div className=\"patient-respiratory-controls\">\n      <div className=\"patient-transition-control\">\n        <label htmlFor=\"patient-transition-select\">\n          <span>Patient transition</span>\n          <select id=\"patient-transition-select\" value={transitionSeconds} onChange={(event) => onTransitionSecondsChange(Number(event.target.value))}>\n            <option value={0}>Now</option>\n            <option value={5}>5 s</option>\n            <option value={10}>10 s</option>\n            <option value={30}>30 s</option>\n            <option value={60}>60 s</option>\n          </select>\n        </label>\n        <small>{transitionSeconds === 0 ? 'Changes apply immediately' : `Patient physiology transitions smoothly over ${transitionSeconds} s`}</small>\n      </div>\n      <div className=\"preset-row\">{Object.keys(presets).map((name) => <button key={name} onClick={() => onChange({ ...presets[name] })}>{name}</button>)}</div>\n      <div className=\"patient-rr-control\">\n"""
new = """      {view !== 'physiology' ? (\n        <div className=\"control-section-title\">\n          <h2>Patient settings</h2>\n          <div className=\"control-section-title-actions\">\n            <button className=\"reset-settings-button patient-reset-button\" type=\"button\" onClick={onReset}>Reset respiratory</button>\n            {collapsible && <button className=\"panel-collapse-button\" type=\"button\" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand patient settings' : 'Collapse patient settings'} title={collapsed ? 'Expand patient settings' : 'Collapse patient settings'}>{collapsed ? '▾' : '▴'}</button>}\n          </div>\n        </div>\n      ) : (\n        <div className=\"control-section-title patient-physiology-title\">\n          <h2>Physiology settings</h2>\n          <button className=\"reset-settings-button patient-reset-button\" type=\"button\" onClick={onResetPhysiology}>Reset physiological</button>\n        </div>\n      )}\n      <div className=\"patient-shared-profile-controls\">\n        <div className=\"patient-transition-control\">\n          <label htmlFor={`patient-transition-select-${view}`}>\n            <span>Transition time</span>\n            <select id={`patient-transition-select-${view}`} value={transitionSeconds} onChange={(event) => onTransitionSecondsChange(Number(event.target.value))}>\n              <option value={0}>Now</option>\n              <option value={5}>5 s</option>\n              <option value={10}>10 s</option>\n              <option value={30}>30 s</option>\n              <option value={60}>60 s</option>\n            </select>\n          </label>\n        </div>\n        <div className=\"preset-row\">{Object.keys(presets).map((name) => <button type=\"button\" key={name} className={selectedPreset === name ? 'selected-preset' : ''} onClick={() => applyPreset(name)}>{name}</button>)}</div>\n      </div>\n      {view !== 'physiology' && <div className=\"patient-respiratory-controls\">\n      <div className=\"patient-rr-control\">\n"""
if old not in text: raise SystemExit('patient shared controls target missing')
text = text.replace(old, new, 1)

old = """      {view !== 'patient' && <div className=\"patient-physiology-column\">\n        <div className=\"control-section-title patient-physiology-title\">\n          <h2>Physiology settings</h2>\n          <button className=\"reset-settings-button patient-reset-button\" type=\"button\" onClick={onResetPhysiology}>Reset physiological</button>\n        </div>\n"""
new = """      {view !== 'patient' && <div className=\"patient-physiology-column\">\n        {view === 'both' && <div className=\"control-section-title patient-physiology-title\">\n          <h2>Physiology settings</h2>\n          <button className=\"reset-settings-button patient-reset-button\" type=\"button\" onClick={onResetPhysiology}>Reset physiological</button>\n        </div>}\n"""
if old not in text: raise SystemExit('physiology heading target missing')
text = text.replace(old, new, 1)

text = text.replace('min={130} max={210} step={1}', 'min={90} max={210} step={1}', 1)
text = text.replace('min={800} max={5000} step={50}', 'min={500} max={5000} step={10}', 1)
text = text.replace('min={50} max={400} step={10}', 'min={20} max={400} step={5}', 1)
controls.write_text(text)

styles = Path('src/styles.css')
css = styles.read_text()
css = css.replace('.preset-row { grid-template-columns: repeat(4, 1fr); }', '.preset-row { grid-template-columns: repeat(5, 1fr); }', 1)
css = css.replace(
    ".patient-section .preset-row button:hover:not(:disabled) { border-color: #6ba87a; background: #1c3021; }",
    ".patient-section .preset-row button:hover:not(:disabled) { border-color: #6ba87a; background: #1c3021; }\n.patient-section .preset-row button.selected-preset { color: #f0fff3; border-color: #82cb91; background: #24442b; box-shadow: inset 0 0 0 1px rgba(130,203,145,.18); }",
    1,
)
old = ".patient-transition-control { margin: 8px 0 12px; padding: 9px 10px; border: 1px solid #294337; border-radius: 8px; background: rgba(50,104,73,.08); }"
new = ".patient-shared-profile-controls { margin: 6px 0 14px; }\n.patient-transition-control { margin: 4px 0 10px; padding: 0; border: 0; border-radius: 0; background: transparent; }"
if old not in css: raise SystemExit('transition css target missing')
css = css.replace(old, new, 1)
css = css.replace('.patient-transition-control small { display: block; margin-top: 5px; color: #708c79; font-size: 9px; }\n', '', 1)
css += """

/* v0.81.4 physiology palette and shared patient profile controls */
.patient-section.physiology-view {
  border-color: rgba(166, 109, 221, .38);
  background: linear-gradient(180deg, rgba(102, 61, 128, .16), rgba(55, 34, 72, .08));
}
.patient-section.physiology-view h2 { color: #d2a2f0; }
.patient-section.physiology-view .control-heading span,
.patient-section.physiology-view .patient-sex-selector > span { color: #c1a4d3; }
.patient-section.physiology-view input[type="range"] { accent-color: #a66ddd; }
.patient-section.physiology-view .patient-reset-button { border-color: #71508a; color: #caa4df; background: #20172a; }
.patient-section.physiology-view .patient-reset-button:hover:not(:disabled) { color: #efdfff; border-color: #a875c5; background: #2a1b38; }
.patient-section.physiology-view .patient-transition-control label { color: #c2a2d4; }
.patient-section.physiology-view .patient-transition-control select { border-color: #705087; color: #f1e7f7; background: #19121f; }
.patient-section.physiology-view .preset-row button { border-color: #604476; color: #dbc4e8; background: #1d1525; }
.patient-section.physiology-view .preset-row button:hover:not(:disabled) { border-color: #986ab5; background: #291d34; }
.patient-section.physiology-view .preset-row button.selected-preset { color: #fff4ff; border-color: #bd86e0; background: #482b5d; box-shadow: inset 0 0 0 1px rgba(189,134,224,.2); }
.patient-section.physiology-view .patient-sex-selector button.selected { color: #f5eaff; border-color: #ad79ce; background: #422953; }
"""
styles.write_text(css)

app = Path('src/App.tsx')
app_text = app.read_text()
if 'oxygenConsumption: 250, frc: 2500, shuntFraction: 0.03' not in app_text:
    raise SystemExit('App initial FRC target missing')
app.write_text(app_text.replace('oxygenConsumption: 250, frc: 2500, shuntFraction: 0.03', 'oxygenConsumption: 250, frc: 1980, shuntFraction: 0.03', 1))

print('Applied v0.81.4 patient/physiology preset changes')
