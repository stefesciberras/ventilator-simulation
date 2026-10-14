from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:140]!r}')
    if text.count(old) != 1:
        raise SystemExit(f'Pattern not unique in {path}: found {text.count(old)}')
    p.write_text(text.replace(old, new, 1))

# One-line instructor ventilator rail label.
replace_once(
    'src/App.tsx',
    '''          >\n            <span>VENTILATOR</span>\n            <small>{instructorSimulatorExpanded ? 'HIDE' : 'SHOW'}</small>\n          </button>''',
    '''          >\n            <span>{instructorSimulatorExpanded ? 'HIDE VENTILATOR' : 'SHOW VENTILATOR'}</span>\n          </button>''',
)

# Give the two settings fieldsets explicit hooks for instructor-only layout.
replace_once(
    'src/App.tsx',
    '''          <fieldset className={`session-lock-fieldset ${teachingSession.candidateVentilatorLocked ? 'locked' : ''}`} disabled={teachingSession.candidateVentilatorLocked}>''',
    '''          <fieldset className={`session-lock-fieldset ventilator-settings-fieldset ${teachingSession.candidateVentilatorLocked ? 'locked' : ''}`} disabled={teachingSession.candidateVentilatorLocked}>''',
)
replace_once(
    'src/App.tsx',
    '''          <fieldset className={`session-lock-fieldset ${teachingSession.candidatePatientLocked ? 'locked' : ''}`} disabled={teachingSession.candidatePatientLocked}>''',
    '''          <fieldset className={`session-lock-fieldset patient-settings-fieldset ${teachingSession.candidatePatientLocked ? 'locked' : ''}`} disabled={teachingSession.candidatePatientLocked}>''',
)

# Split patient respiratory and physiology controls into independently placeable visual columns.
replace_once(
    'src/components/Controls.tsx',
    '''      </div>\n      <div className="patient-transition-control">''',
    '''      </div>\n      <div className="patient-respiratory-controls">\n      <div className="patient-transition-control">''',
)
replace_once(
    'src/components/Controls.tsx',
    '''      <Slider label="End-expiratory Pes" value={settings.endExpiratoryOesophagealPressure ?? -5} unit=" cmH₂O" min={-15} max={15} step={0.5} onChange={(v) => patch({ endExpiratoryOesophagealPressure: v })} />\n      <div className="patient-subsection-heading">\n        <div className="patient-subsection-title">Physiological</div>\n        <button className="reset-settings-button patient-reset-button" type="button" onClick={onResetPhysiology}>Reset physiological</button>\n      </div>''',
    '''      <Slider label="End-expiratory Pes" value={settings.endExpiratoryOesophagealPressure ?? -5} unit=" cmH₂O" min={-15} max={15} step={0.5} onChange={(v) => patch({ endExpiratoryOesophagealPressure: v })} />\n      </div>\n      <div className="patient-physiology-column">\n        <div className="control-section-title patient-physiology-title">\n          <h2>Physiology settings</h2>\n          <button className="reset-settings-button patient-reset-button" type="button" onClick={onResetPhysiology}>Reset physiological</button>\n        </div>''',
)
replace_once(
    'src/components/Controls.tsx',
    '''      <Slider label="Dead space volume" value={settings.deadSpaceVolume ?? 150} unit=" mL" min={50} max={400} step={10} onChange={(v) => patch({ deadSpaceVolume: v })} />\n    </section>''',
    '''      <Slider label="Dead space volume" value={settings.deadSpaceVolume ?? 150} unit=" mL" min={50} max={400} step={10} onChange={(v) => patch({ deadSpaceVolume: v })} />\n      </div>\n    </section>''',
)

# Instructor hidden-display layout: narrow rail + three equal settings columns.
replace_once(
    'src/instructor.css',
    '''body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .workspace {\n  grid-template-columns: 86px minmax(0, 1fr);\n}''',
    '''body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .workspace {\n  grid-template-columns: 48px minmax(0, 1fr);\n}''',
)
replace_once(
    'src/instructor.css',
    '''  gap: 18px;\n  padding: 12px 8px;''',
    '''  gap: 0;\n  padding: 10px 4px;''',
)
replace_once(
    'src/instructor.css',
    '''body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .instructor-ventilator-toggle span,\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .instructor-ventilator-toggle small {\n  writing-mode: vertical-rl;\n  transform: rotate(180deg);\n}\nbody.eduvent-instructor-mode .instructor-ventilator-toggle span {\n  font-size: 10px;\n  font-weight: 900;\n  letter-spacing: .18em;\n}\nbody.eduvent-instructor-mode .instructor-ventilator-toggle small {\n  color: #63b9da;\n  font-size: 8px;\n  font-weight: 900;\n  letter-spacing: .12em;\n}''',
    '''body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .instructor-ventilator-toggle span {\n  writing-mode: vertical-rl;\n  transform: rotate(180deg);\n  white-space: nowrap;\n}\nbody.eduvent-instructor-mode .instructor-ventilator-toggle span {\n  font-size: 9px;\n  font-weight: 900;\n  letter-spacing: .12em;\n}''',
)
replace_once(
    'src/instructor.css',
    '''  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 14px;''',
    '''  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 14px;''',
)
replace_once(
    'src/instructor.css',
    '''body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel > .session-lock-fieldset {\n  min-width: 0;\n}\n''',
    '''body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel > .session-lock-fieldset {\n  min-width: 0;\n}\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel > .ventilator-settings-fieldset {\n  grid-column: 1;\n}\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel > .patient-settings-fieldset {\n  grid-column: 2 / 4;\n}\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .patient-section:not(.panel-collapsed) {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  column-gap: 14px;\n  align-items: start;\n}\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .patient-section:not(.panel-collapsed) > .control-section-title {\n  grid-column: 1;\n  grid-row: 1;\n}\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .patient-section:not(.panel-collapsed) > .patient-respiratory-controls {\n  grid-column: 1;\n  grid-row: 2;\n  min-width: 0;\n}\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .patient-section:not(.panel-collapsed) > .patient-physiology-column {\n  grid-column: 2;\n  grid-row: 1 / 3;\n  min-width: 0;\n}\nbody.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .patient-physiology-title {\n  margin-bottom: 12px;\n}\n''',
)
replace_once(
    'src/instructor.css',
    '''body.eduvent-instructor-mode.eduvent-instructor-simulator-open .instructor-ventilator-toggle span,\nbody.eduvent-instructor-mode.eduvent-instructor-simulator-open .instructor-ventilator-toggle small {\n  writing-mode: vertical-rl;\n  transform: rotate(180deg);\n}''',
    '''body.eduvent-instructor-mode.eduvent-instructor-simulator-open .instructor-ventilator-toggle span {\n  writing-mode: vertical-rl;\n  transform: rotate(180deg);\n  white-space: nowrap;\n}''',
)
replace_once(
    'src/instructor.css',
    '''  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .instructor-ventilator-toggle span,\n  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .instructor-ventilator-toggle small,\n  body.eduvent-instructor-mode.eduvent-instructor-simulator-open .instructor-ventilator-toggle span,\n  body.eduvent-instructor-mode.eduvent-instructor-simulator-open .instructor-ventilator-toggle small {\n    writing-mode: horizontal-tb;\n    transform: none;\n  }''',
    '''  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .instructor-ventilator-toggle span,\n  body.eduvent-instructor-mode.eduvent-instructor-simulator-open .instructor-ventilator-toggle span {\n    writing-mode: horizontal-tb;\n    transform: none;\n  }''',
)
replace_once(
    'src/instructor.css',
    '''  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel {\n    grid-column: 1;\n    grid-row: 2;\n    grid-template-columns: 1fr;\n  }''',
    '''  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel {\n    grid-column: 1;\n    grid-row: 2;\n    grid-template-columns: 1fr;\n  }\n  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel > .ventilator-settings-fieldset,\n  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .control-panel > .patient-settings-fieldset {\n    grid-column: 1;\n  }\n  body.eduvent-instructor-mode:not(.eduvent-instructor-simulator-open) .patient-section:not(.panel-collapsed) {\n    display: block;\n  }''',
)

# Version bump.
replace_once('src/appVersion.ts', "export const APP_VERSION = '0.78.4'", "export const APP_VERSION = '0.78.5'")
