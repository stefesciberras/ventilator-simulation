from pathlib import Path


def require_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'{label} anchor not found')
    return text.replace(old, new, 1)

# --- Patient settings schema ----------------------------------------------
types = Path('src/simulation/types.ts')
text = types.read_text()
if '  shuntFraction: number\n' not in text:
    text = require_once(
        text,
        '  frc: number\n  compliance: number\n',
        '  frc: number\n  shuntFraction: number\n  compliance: number\n',
        'PatientSettings shuntFraction',
    )
types.write_text(text)

# --- App defaults, transitions and version --------------------------------
app = Path('src/App.tsx')
text = app.read_text()
if 'shuntFraction: 0.03' not in text:
    text = require_once(
        text,
        "  sex: 'male', heightCm: 170, oxygenConsumption: 250, frc: 2500,\n",
        "  sex: 'male', heightCm: 170, oxygenConsumption: 250, frc: 2500, shuntFraction: 0.03,\n",
        'initial patient shunt',
    )
if 'shuntFraction: lerp(' not in text:
    text = require_once(
        text,
        '    frc: lerp(from.frc ?? 2500, to.frc ?? 2500),\n',
        '    frc: lerp(from.frc ?? 2500, to.frc ?? 2500),\n    shuntFraction: lerp(from.shuntFraction ?? 0.03, to.shuntFraction ?? 0.03),\n',
        'patient transition shunt',
    )
text = text.replace("appVersion: '0.60'", "appVersion: '0.61'")
text = text.replace('>v0.60</span>', '>v0.61</span>')
app.write_text(text)

# --- Patient UI and presets ------------------------------------------------
controls = Path('src/components/Controls.tsx')
text = controls.read_text()
text = text.replace(
    "Normal: { compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1, effortRisePercent: 50, effortRelaxationPercent: 50 },",
    "Normal: { shuntFraction: 0.03, compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1, effortRisePercent: 50, effortRelaxationPercent: 50 },",
)
text = text.replace(
    "ARDS: { compliance: 25, resistance: 8, expiratoryResistance: 10, spontaneousRate: 25, effort: 10, neuralInspiratoryTime: 0.8, effortRisePercent: 20, effortRelaxationPercent: 25 },",
    "ARDS: { shuntFraction: 0.25, compliance: 25, resistance: 8, expiratoryResistance: 10, spontaneousRate: 25, effort: 10, neuralInspiratoryTime: 0.8, effortRisePercent: 20, effortRelaxationPercent: 25 },",
)
text = text.replace(
    "COPD: { compliance: 80, resistance: 16, expiratoryResistance: 28, spontaneousRate: 18, effort: 8, neuralInspiratoryTime: 0.9, effortRisePercent: 30, effortRelaxationPercent: 40 },",
    "COPD: { shuntFraction: 0.05, compliance: 80, resistance: 16, expiratoryResistance: 28, spontaneousRate: 18, effort: 8, neuralInspiratoryTime: 0.9, effortRisePercent: 30, effortRelaxationPercent: 40 },",
)
text = text.replace(
    "Asthma: { compliance: 70, resistance: 25, expiratoryResistance: 40, spontaneousRate: 24, effort: 11, neuralInspiratoryTime: 0.8, effortRisePercent: 20, effortRelaxationPercent: 30 },",
    "Asthma: { shuntFraction: 0.04, compliance: 70, resistance: 25, expiratoryResistance: 40, spontaneousRate: 24, effort: 11, neuralInspiratoryTime: 0.8, effortRisePercent: 20, effortRelaxationPercent: 30 },",
)
if 'label="Shunt"' not in text:
    text = require_once(
        text,
        '      <Slider label="FRC" value={settings.frc ?? 2500} unit=" mL" min={800} max={5000} step={50} onChange={(v) => patch({ frc: v })} />\n',
        '      <Slider label="FRC" value={settings.frc ?? 2500} unit=" mL" min={800} max={5000} step={50} onChange={(v) => patch({ frc: v })} />\n      <Slider label="Shunt" value={Math.round((settings.shuntFraction ?? 0.03) * 100)} unit="%" min={0} max={50} step={1} onChange={(v) => patch({ shuntFraction: v / 100 })} />\n',
        'Shunt slider',
    )
controls.write_text(text)

# --- Oxygenation model -----------------------------------------------------
engine = Path('src/simulation/engine.ts')
text = engine.read_text()
old = '''function directSpO2FromAlveolarFraction(alveolarFraction: number, ventilator: VentilatorSettings, patient: PatientSettings): number {
  // v0.60 intentionally does not model PaO2. Instead, a smooth saturation curve
  // maps the dynamic alveolar oxygen reservoir directly to pulse-oximeter SpO2.
  // Low compliance and severe expiratory obstruction impose a simplified V/Q /
  // shunt penalty. PEEP can recruit part of the low-compliance penalty.
  const compliancePenalty = clamp((60 - patient.compliance) / 45, 0, 1) * 0.055
  const obstructionPenalty = clamp((patient.expiratoryResistance - 8) / 32, 0, 1) * 0.018
  const recruitment = compliancePenalty * 0.55 * clamp((ventilator.peep - 5) / 10, 0, 1)
  const effectiveFraction = clamp(alveolarFraction - compliancePenalty - obstructionPenalty + recruitment, 0.01, 0.95)
  const halfSaturationFraction = 0.063
  const hillExponent = 5
  const ratio = Math.pow(halfSaturationFraction / effectiveFraction, hillExponent)
  return clamp(100 / (1 + ratio), 50, 100)
}
'''
new = '''function directSpO2FromAlveolarFraction(alveolarFraction: number, ventilator: VentilatorSettings, patient: PatientSettings): number {
  // v0.61 keeps oxygenation independent from airway mechanics: shunt is an
  // explicit patient property rather than being inferred from low compliance.
  // Obstruction retains a small V/Q-mismatch penalty, while PEEP can recruit a
  // fraction of shunt only when the lung is relatively non-compliant.
  const obstructionPenalty = clamp((patient.expiratoryResistance - 8) / 32, 0, 1) * 0.018
  const effectiveFraction = clamp(alveolarFraction - obstructionPenalty, 0.01, 0.95)
  const halfSaturationFraction = 0.063
  const hillExponent = 5
  const ratio = Math.pow(halfSaturationFraction / effectiveFraction, hillExponent)
  const ventilatedSaturation = clamp(100 / (1 + ratio), 50, 100)

  const baselineShunt = clamp(patient.shuntFraction ?? 0.03, 0, 0.5)
  const recruitability = clamp((60 - patient.compliance) / 45, 0, 1)
  const peepRecruitment = 0.55 * recruitability * clamp((ventilator.peep - 5) / 10, 0, 1)
  const effectiveShunt = baselineShunt * (1 - peepRecruitment)

  // Mix ventilated blood with a fixed venous-like saturation to represent true
  // right-to-left shunt. This preserves the limited response of true shunt to
  // increasing FiO2 without introducing a PaO2 model.
  const venousLikeSaturation = 75
  return clamp(ventilatedSaturation * (1 - effectiveShunt) + venousLikeSaturation * effectiveShunt, 50, 100)
}
'''
if old not in text:
    raise SystemExit('v0.60 oxygenation function anchor not found')
text = text.replace(old, new, 1)
engine.write_text(text)

# --- Version consistency ---------------------------------------------------
diag = Path('src/diagnostics.ts')
text = diag.read_text().replace("export const APP_VERSION = '0.60'", "export const APP_VERSION = '0.61'")
diag.write_text(text)

panel = Path('src/components/SessionPanel.tsx')
text = panel.read_text().replace("version.textContent = 'v0.60'", "version.textContent = 'v0.61'")
panel.write_text(text)

print('v0.61 explicit shunt patch applied')
