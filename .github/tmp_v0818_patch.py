from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise RuntimeError(f'pattern not found in {path}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1))

# Version
replace_once('src/appVersion.ts', "export const APP_VERSION = '0.81.7'", "export const APP_VERSION = '0.81.8'")

# Patient settings + sample metadata
replace_once(
    'src/simulation/types.ts',
    '  expiratoryResistance: number\n  spontaneousRate: number',
    '  expiratoryResistance: number\n  /** 0 = linear RC emptying; 1 = severe expiratory flow limitation. */\n  expiratoryFlowLimitation: number\n  spontaneousRate: number',
)
replace_once(
    'src/simulation/types.ts',
    '  pressureLimitHit?: boolean\n}',
    '  pressureLimitHit?: boolean\n  expiratoryFlowLimited?: boolean\n}',
)

# Default patient
replace_once(
    'src/App.tsx',
    'compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12',
    'compliance: 60, resistance: 6, expiratoryResistance: 8, expiratoryFlowLimitation: 0, spontaneousRate: 12',
)
replace_once(
    'src/App.tsx',
    '    expiratoryResistance: initialPatient.expiratoryResistance,\n    spontaneousRate:',
    '    expiratoryResistance: initialPatient.expiratoryResistance,\n    expiratoryFlowLimitation: initialPatient.expiratoryFlowLimitation,\n    spontaneousRate:',
)

# Profiles: normal/ARDS/paed stay linear; COPD/asthma are flow-limited.
p = Path('src/patientProfiles.ts')
text = p.read_text()
text = text.replace('expiratoryResistance: 8, spontaneousRate: 12', 'expiratoryResistance: 8, expiratoryFlowLimitation: 0, spontaneousRate: 12')
text = text.replace('expiratoryResistance: 10, spontaneousRate: 0', 'expiratoryResistance: 10, expiratoryFlowLimitation: 0, spontaneousRate: 0')
text = text.replace('expiratoryResistance: 28, spontaneousRate: 18', 'expiratoryResistance: 28, expiratoryFlowLimitation: 0.8, spontaneousRate: 18')
text = text.replace('expiratoryResistance: 40, spontaneousRate: 24', 'expiratoryResistance: 40, expiratoryFlowLimitation: 0.95, spontaneousRate: 24')
text = text.replace('expiratoryResistance: 10, spontaneousRate: 22', 'expiratoryResistance: 10, expiratoryFlowLimitation: 0, spontaneousRate: 22')
p.write_text(text)

# Teaching control
replace_once(
    'src/components/Controls.tsx',
    '      <Slider label="Expiratory resistance" value={settings.expiratoryResistance} unit=" cmH₂O/L/s" min={3} max={50} onChange={(v) => patch({ expiratoryResistance: v })} />\n      <Slider label="Inspiratory effort"',
    '      <Slider label="Expiratory resistance" value={settings.expiratoryResistance} unit=" cmH₂O/L/s" min={3} max={50} onChange={(v) => patch({ expiratoryResistance: v })} />\n      <Slider label="Expiratory flow limitation" value={Math.round((settings.expiratoryFlowLimitation ?? 0) * 100)} unit="%" min={0} max={100} step={5} onChange={(v) => patch({ expiratoryFlowLimitation: v / 100 })} />\n      <Slider label="Inspiratory effort"',
)

# Dedicated flow-limitation model.
Path('src/expiratoryFlowLimitation.ts').write_text('''import type { PatientSettings } from './simulation/types'\nimport { calculatePredictedBodyWeight } from './patientMetrics'\n\nconst clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))\n\nexport interface ExpiratoryFlowLimitResult {\n  flowLs: number\n  limited: boolean\n  ceilingLs: number | null\n}\n\n/**\n * Approximate effort-independent expiratory flow limitation.\n *\n * The ordinary single-compartment model gives flow = -V/(Rexp*C), so greater\n * trapped volume always creates proportionally greater expiratory flow. In\n * obstructive disease that becomes unrealistic once dynamic airway compression\n * creates a choke point. We therefore cap negative flow with a simple\n * volume-dependent maximum-expiratory-flow envelope. The envelope rises with\n * lung volume, allowing a new hyperinflated equilibrium rather than unlimited\n * volume accumulation, while becoming progressively flatter as severity rises.\n *\n * Severity 0 leaves the linear RC model unchanged.\n */\nexport function applyExpiratoryFlowLimitation(\n  requestedFlowLs: number,\n  volumeAboveSetPeepL: number,\n  patient: PatientSettings,\n): ExpiratoryFlowLimitResult {\n  if (requestedFlowLs >= 0) return { flowLs: requestedFlowLs, limited: false, ceilingLs: null }\n\n  const severity = clamp(patient.expiratoryFlowLimitation ?? 0, 0, 1)\n  if (severity <= 0.001) return { flowLs: requestedFlowLs, limited: false, ceilingLs: null }\n\n  const pbw = calculatePredictedBodyWeight(patient.sex ?? 'male', patient.heightCm ?? 170)\n  const sizeScale = clamp(Math.sqrt(pbw / 66), 0.55, 1.35)\n\n  // A simplified maximum-expiratory-flow/volume envelope. At severe settings\n  // the pressure-independent portion dominates; at higher lung volumes the\n  // ceiling still rises enough for a stable EELV to exist.\n  const lowVolumeCeilingLs = Math.max(0.03, (0.14 - 0.10 * severity) * sizeScale)\n  const volumeSlopePerSecond = Math.max(0.12, (0.38 - 0.13 * severity) * sizeScale)\n  const ceilingLs = lowVolumeCeilingLs + volumeSlopePerSecond * Math.max(volumeAboveSetPeepL, 0)\n\n  const requestedMagnitude = -requestedFlowLs\n  const limitedMagnitude = Math.min(requestedMagnitude, ceilingLs)\n  return {\n    flowLs: -limitedMagnitude,\n    limited: requestedMagnitude > ceilingLs + 1e-6,\n    ceilingLs,\n  }\n}\n''')

# Mechanics: cap expiratory flow and expose whether a sample is flow-limited.
replace_once(
    'src/simulation/engine.ts',
    "import { calculateEffectiveDeadSpace } from '../patientMetrics'",
    "import { calculateEffectiveDeadSpace } from '../patientMetrics'\nimport { applyExpiratoryFlowLimitation } from '../expiratoryFlowLimitation'",
)
replace_once(
    'src/simulation/engine.ts',
    '  if (!inspiration && !state.expiratoryHoldActive) {\n    const tau = Math.max(patient.expiratoryResistance * complianceL, 0.05)\n    const passiveExpiratoryFlow = state.volume > 0 ? -state.volume / tau : 0\n    const passiveExpiratoryMagnitude = Math.max(0, -passiveExpiratoryFlow)',
    '  let expiratoryFlowLimited = false\n  if (!inspiration && !state.expiratoryHoldActive) {\n    const tau = Math.max(patient.expiratoryResistance * complianceL, 0.05)\n    const requestedPassiveExpiratoryFlow = state.volume > 0 ? -state.volume / tau : 0\n    const passiveLimit = applyExpiratoryFlowLimitation(requestedPassiveExpiratoryFlow, state.volume, patient)\n    const passiveExpiratoryFlow = passiveLimit.flowLs\n    expiratoryFlowLimited = passiveLimit.limited\n    const passiveExpiratoryMagnitude = Math.max(0, -passiveExpiratoryFlow)',
)
replace_once(
    'src/simulation/engine.ts',
    '      flowLs = netPatientDrivingPressure / effortResistance\n      pressure = ventilator.peep - Math.max(0, netPatientDrivingPressure)',
    '      const requestedFlow = netPatientDrivingPressure / effortResistance\n      const effortLimitedFlow = applyExpiratoryFlowLimitation(requestedFlow, state.volume, patient)\n      flowLs = effortLimitedFlow.flowLs\n      expiratoryFlowLimited = expiratoryFlowLimited || effortLimitedFlow.limited\n      pressure = ventilator.peep - Math.max(0, netPatientDrivingPressure)',
)
replace_once(
    'src/simulation/engine.ts',
    '    pressureLimitHit,\n  }',
    '    pressureLimitHit,\n    expiratoryFlowLimited,\n  }',
)

# Do not double-count incomplete expiration in gas exchange. The observed expired
# VT already falls when the next breath interrupts expiration; flow limitation now
# changes that volume directly.
old = '''  const respiratoryRate = effectiveRespiratoryRate(state, ventilator, patient, t)\n  const tau = Math.max(patient.expiratoryResistance * complianceL, 0.05)\n  const expiratoryTime = Math.max(state.lastExpiratoryDuration, 0.05)\n  const emptyingFraction = clamp(1 - Math.exp(-expiratoryTime / tau), 0.03, 1)\n  return alveolarVolumeL * respiratoryRate * emptyingFraction'''
new = '''  const respiratoryRate = effectiveRespiratoryRate(state, ventilator, patient, t)\n  return alveolarVolumeL * respiratoryRate'''
text = Path('src/simulation/engine.ts').read_text()
if text.count(old) != 1:
    raise RuntimeError(f'expected one CO2 alveolar ventilation block, found {text.count(old)}')
Path('src/simulation/engine.ts').write_text(text.replace(old, new, 1))

old2 = '''  const respiratoryRate = effectiveRespiratoryRate(state, ventilator, patient, t)\n  const tau = Math.max(patient.expiratoryResistance * complianceL, 0.05)\n  const expiratoryTime = Math.max(state.lastExpiratoryDuration, 0.05)\n  const emptyingFraction = clamp(1 - Math.exp(-expiratoryTime / tau), 0.03, 1)\n  const alveolarVentilationLmin = alveolarVolumeL * respiratoryRate * emptyingFraction'''
new2 = '''  const respiratoryRate = effectiveRespiratoryRate(state, ventilator, patient, t)\n  const alveolarVentilationLmin = alveolarVolumeL * respiratoryRate'''
text = Path('src/simulation/engine.ts').read_text()
if text.count(old2) != 1:
    raise RuntimeError(f'expected one oxygen alveolar ventilation block, found {text.count(old2)}')
Path('src/simulation/engine.ts').write_text(text.replace(old2, new2, 1))

# Measurements: show active flow limitation and use actual expired VT rather than
# applying the old exponential emptying penalty a second time.
replace_once(
    'src/physiologyMeasurements.ts',
    '  expiratoryFlow: number | null\n  inspiredTidalVolume:',
    '  expiratoryFlow: number | null\n  expiratoryFlowLimited: boolean\n  inspiredTidalVolume:',
)
replace_once(
    'src/physiologyMeasurements.ts',
    '    expiratoryFlow: negativeFlows.length ? Math.max(...negativeFlows) : null,\n    inspiredTidalVolume:',
    "    expiratoryFlow: negativeFlows.length ? Math.max(...negativeFlows) : null,\n    expiratoryFlowLimited: recent.slice(-500).some((sample) => sample.expiratoryFlowLimited),\n    inspiredTidalVolume:",
)
replace_once(
    'src/physiologyMeasurements.ts',
    '''  // Match the simulation engine's gas-exchange model: only the fraction of the\n  // alveolar tidal volume that can empty during Te contributes to effective\n  // alveolar ventilation. This makes dynamic hyperinflation visible in EXTRA.\n  const modelExpiratoryTimeConstant = Math.max(patient.expiratoryResistance * patient.compliance / 1000, 0.05)\n  const measuredExpiratoryTime = timing.expiratoryTime\n  const expiratoryEmptyingFraction = measuredExpiratoryTime == null\n    ? 1\n    : clamp(1 - Math.exp(-measuredExpiratoryTime / modelExpiratoryTimeConstant), 0.03, 1)\n  const alveolarMinuteVentilation = alveolarTidalVolume == null\n    ? 0\n    : Math.max(0, (alveolarTidalVolume / 1000) * rates.totalRate * expiratoryEmptyingFraction)''',
    '''  // Expired VT already contains the mechanical consequence of interrupted\n  // expiration/flow limitation. Applying an additional RC emptying fraction\n  // here would count the same loss twice.\n  const alveolarMinuteVentilation = alveolarTidalVolume == null\n    ? 0\n    : Math.max(0, (alveolarTidalVolume / 1000) * rates.totalRate)''',
)
replace_once(
    'src/physiologyMeasurements.ts',
    '    expiratoryFlow: monitor.expiratoryFlow,\n    inspiredTidalVolume:',
    '    expiratoryFlow: monitor.expiratoryFlow,\n    expiratoryFlowLimited: monitor.expiratoryFlowLimited,\n    inspiredTidalVolume:',
)

# Extra monitor indicator.
replace_once(
    'src/components/PhysiologyMeasurementsDialog.tsx',
    '                <MonitorMetric value={measurements.totalDeadSpaceVolume} label="Total dead space" unit="mL" digits={0} />',
    '''                <MonitorMetric value={measurements.totalDeadSpaceVolume} label="Total dead space" unit="mL" digits={0} />\n                <div className="monitor-metric">\n                  <strong>{measurements.expiratoryFlowLimited ? 'ACTIVE' : 'No'}</strong>\n                  <div><span>Exp flow limitation</span><small></small></div>\n                </div>''',
)

print('v0.81.8 patch applied')
