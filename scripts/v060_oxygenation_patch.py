from pathlib import Path
import re


def require_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'{label} anchor not found')
    return text.replace(old, new, 1)

# --- Sample type ----------------------------------------------------------
types = Path('src/simulation/types.ts')
text = types.read_text()
if '  spo2: number\n' not in text:
    text = require_once(
        text,
        '  co2: number\n  oesophagealPressure: number\n',
        '  co2: number\n  spo2: number\n  oesophagealPressure: number\n',
        'Sample SpO2 field',
    )
types.write_text(text)

# --- Simulation engine ----------------------------------------------------
engine = Path('src/simulation/engine.ts')
text = engine.read_text()
if 'alveolarOxygenFraction' not in text:
    text = require_once(
        text,
        '  estimatedRespiratoryRate: number\n  alveolarCo2: number\n',
        '  estimatedRespiratoryRate: number\n  alveolarCo2: number\n  alveolarOxygenFraction: number\n  spo2: number\n',
        'oxygen state fields',
    )
    text = require_once(
        text,
        '    estimatedRespiratoryRate: 12,\n    alveolarCo2: 40,\n',
        '    estimatedRespiratoryRate: 12,\n    alveolarCo2: 40,\n    alveolarOxygenFraction: 0.16,\n    spo2: 98,\n',
        'oxygen state defaults',
    )

oxygen_code = r'''
function directSpO2FromAlveolarFraction(alveolarFraction: number, ventilator: VentilatorSettings, patient: PatientSettings): number {
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

function updateOxygenation(
  state: SimulationState,
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  t: number,
  dt: number,
  complianceL: number,
) {
  const fallbackVt = Math.max(ventilator.tidalVolume / 1000, 0.3)
  const tidalVolumeL = state.lastExpiredTidalVolume > 0.02 ? state.lastExpiredTidalVolume : fallbackVt
  const deadSpaceL = Math.max(patient.deadSpaceVolume ?? 150, 0) / 1000
  const alveolarVolumeL = Math.max(0, tidalVolumeL - deadSpaceL)
  const respiratoryRate = effectiveRespiratoryRate(state, ventilator, patient, t)
  const tau = Math.max(patient.expiratoryResistance * complianceL, 0.05)
  const expiratoryTime = Math.max(state.lastExpiratoryDuration, 0.05)
  const emptyingFraction = clamp(1 - Math.exp(-expiratoryTime / tau), 0.03, 1)
  const alveolarVentilationLmin = alveolarVolumeL * respiratoryRate * emptyingFraction

  const frcL = clamp(Math.max(patient.frc ?? 2500, 500) / 1000, 0.5, 8)
  const inspiredOxygenFraction = clamp(ventilator.fio2, 0.21, 1)
  const oxygenConsumptionLs = Math.max(patient.oxygenConsumption ?? 250, 0) / 1000 / 60
  const turnoverPerSecond = alveolarVentilationLmin / 60 / frcL
  const metabolicDepletionPerSecond = oxygenConsumptionLs / frcL

  // Well-mixed FRC reservoir: ventilation washes FAO2 toward FiO2 while VO2
  // continuously removes oxygen. During apnoea the wash-in term approaches zero,
  // so FRC and VO2 naturally determine the speed of desaturation.
  const derivative = turnoverPerSecond * (inspiredOxygenFraction - state.alveolarOxygenFraction) - metabolicDepletionPerSecond
  state.alveolarOxygenFraction = clamp(state.alveolarOxygenFraction + derivative * dt, 0.01, 0.95)

  const targetSpO2 = directSpO2FromAlveolarFraction(state.alveolarOxygenFraction, ventilator, patient)
  const pulseOximeterResponseSeconds = targetSpO2 < state.spo2 ? 2.5 : 4
  const responseFraction = 1 - Math.exp(-dt / pulseOximeterResponseSeconds)
  state.spo2 = clamp(state.spo2 + (targetSpO2 - state.spo2) * responseFraction, 50, 100)
}

'''
if 'function updateOxygenation(' not in text:
    anchor = 'function capnogramValue(\n'
    if anchor not in text:
        raise SystemExit('oxygen function insertion anchor not found')
    text = text.replace(anchor, oxygen_code + anchor, 1)

if 'updateOxygenation(state, ventilator, patient, t, dt, complianceL)' not in text:
    text = require_once(
        text,
        '  updateAlveolarCo2(state, ventilator, patient, t, dt, complianceL)\n',
        '  updateAlveolarCo2(state, ventilator, patient, t, dt, complianceL)\n  updateOxygenation(state, ventilator, patient, t, dt, complianceL)\n',
        'oxygen update call',
    )

# Both conventional and two-level sample constructors use this exact Pes line.
if text.count('    spo2: state.spo2,\n') < 2:
    pes_line = '    oesophagealPressure: oesophagealPressureValue(t, pmus, patient),\n'
    occurrences = text.count(pes_line)
    if occurrences != 2:
        raise SystemExit(f'expected two Sample Pes anchors, found {occurrences}')
    text = text.replace(pes_line, '    spo2: state.spo2,\n' + pes_line)
engine.write_text(text)

# --- Physiological monitor data ------------------------------------------
phys = Path('src/physiologyMeasurements.ts')
text = phys.read_text()
if '  oxygenSaturation: number | null\n' not in text:
    text = require_once(
        text,
        '  oxygenPercent: number\n',
        '  oxygenPercent: number\n  oxygenSaturation: number | null\n',
        'physiology SpO2 interface',
    )
if 'oxygenSaturation:' not in text:
    text = require_once(
        text,
        '    oxygenPercent: ventilator.fio2 * 100,\n',
        '    oxygenPercent: ventilator.fio2 * 100,\n    oxygenSaturation: window.length ? window[window.length - 1].spo2 : null,\n',
        'physiology SpO2 return',
    )
phys.write_text(text)

# --- Monitoring dialog: add SpO2 tab -------------------------------------
dialog = Path('src/components/PhysiologyMeasurementsDialog.tsx')
text = dialog.read_text()
text = text.replace("type MonitorTab = 'general' | 'co2' | 'oesophageal'", "type MonitorTab = 'general' | 'spo2' | 'co2' | 'oesophageal'")
if ">SpO₂</button>" not in text:
    text = require_once(
        text,
        '          <button className={tab === \'general\' ? \'active\' : \'\'} type="button" onClick={() => setTab(\'general\')}>General</button>\n          <button className={tab === \'co2\' ? \'active\' : \'\'} type="button" onClick={() => setTab(\'co2\')}>CO₂</button>\n',
        '          <button className={tab === \'general\' ? \'active\' : \'\'} type="button" onClick={() => setTab(\'general\')}>General</button>\n          <button className={tab === \'spo2\' ? \'active\' : \'\'} type="button" onClick={() => setTab(\'spo2\')}>SpO₂</button>\n          <button className={tab === \'co2\' ? \'active\' : \'\'} type="button" onClick={() => setTab(\'co2\')}>CO₂</button>\n',
        'SpO2 tab button',
    )
if "tab === 'spo2'" not in text.split("tab === 'general'", 1)[-1]:
    co2_anchor = """          {tab === 'co2' && (\n            <div className=\"monitor-grid monitor-grid-sparse\">\n"""
    spo2_panel = """          {tab === 'spo2' && (\n            <div className=\"monitor-grid monitor-grid-sparse spo2-monitor-grid\">\n              <div className=\"monitor-column\">\n                <MonitorMetric value={measurements.oxygenSaturation} label=\"SpO₂\" unit=\"%\" digits={0} />\n              </div>\n            </div>\n          )}\n\n"""
    if co2_anchor not in text:
        raise SystemExit('SpO2 monitor panel anchor not found')
    text = text.replace(co2_anchor, spo2_panel + co2_anchor, 1)
dialog.write_text(text)

# --- Main ventilator monitor + diagnostics/version ------------------------
app = Path('src/App.tsx')
text = app.read_text()
if 'label="SpO₂"' not in text:
    text = require_once(
        text,
        '              <div className="metrics-spacer" aria-hidden="true" />\n              <Metric label="EtCO₂" value={endTidalCO2 == null ? \'—\' : endTidalCO2.toFixed(0)} unit="mmHg" />\n',
        '              <div className="metrics-spacer" aria-hidden="true" />\n              <Metric label="SpO₂" value={latestSample?.spo2 == null ? \'—\' : latestSample.spo2.toFixed(0)} unit="%" />\n              <Metric label="EtCO₂" value={endTidalCO2 == null ? \'—\' : endTidalCO2.toFixed(0)} unit="mmHg" />\n',
        'main SpO2 metric',
    )
if 'spo2Percent:' not in text:
    text = require_once(
        text,
        '        endTidalCo2MmHg: endTidalCO2,\n',
        '        endTidalCo2MmHg: endTidalCO2,\n        spo2Percent: latestSample?.spo2 ?? null,\n',
        'diagnostic SpO2 measurement',
    )
text = text.replace("appVersion: '0.58'", "appVersion: '0.60'")
text = text.replace("appVersion: '0.59'", "appVersion: '0.60'")
text = text.replace('>v0.59</span>', '>v0.60</span>')
app.write_text(text)

# --- Diagnostic waveform schema -----------------------------------------
diag = Path('src/diagnostics.ts')
text = diag.read_text()
text = re.sub(r"export const APP_VERSION = '[^']+'", "export const APP_VERSION = '0.60'", text, count=1)
if "spo2: '%'" not in text:
    text = require_once(
        text,
        "        co2: 'mmHg',\n        oesophagealPressure: 'cmH2O',\n",
        "        co2: 'mmHg',\n        spo2: '%',\n        oesophagealPressure: 'cmH2O',\n",
        'diagnostic SpO2 units',
    )
if "        'spo2',\n" not in text:
    text = require_once(
        text,
        "        'co2',\n        'oesophagealPressure',\n",
        "        'co2',\n        'spo2',\n        'oesophagealPressure',\n",
        'diagnostic SpO2 column',
    )
if '        sample.spo2,\n' not in text:
    text = require_once(
        text,
        '        sample.co2,\n        sample.oesophagealPressure,\n',
        '        sample.co2,\n        sample.spo2,\n        sample.oesophagealPressure,\n',
        'diagnostic SpO2 sample',
    )
diag.write_text(text)

# --- Teaching component visible version ---------------------------------
panel = Path('src/components/SessionPanel.tsx')
text = panel.read_text().replace("version.textContent = 'v0.59'", "version.textContent = 'v0.60'")
panel.write_text(text)

print('v0.60 oxygenation patch applied')
