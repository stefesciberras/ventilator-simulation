from pathlib import Path
import re

p = Path('src/components/Controls.tsx')
s = p.read_text()
old_modes = "const modes: VentilatorMode[] = ['VC-AC', 'PC-AC', 'PSV', 'SIMV-VC', 'SIMV-PC', 'VG-PC', 'APRV', 'BIPAP']"
new_modes = "const modes: VentilatorMode[] = ['VC-AC', 'SIMV-VC', 'PC-AC', 'SIMV-PC', 'BIPAP', 'VG-PC', 'APRV', 'PSV']"
if old_modes not in s:
    raise SystemExit('mode array anchor not found')
s = s.replace(old_modes, new_modes, 1)
p.write_text(s)

p = Path('src/simulation/engine.ts')
s = p.read_text()
start = s.index('function effectiveRespiratoryRate(')
end = s.index('\n\nfunction directSpO2FromAlveolarFraction', start)
new_block = r'''function effectiveRespiratoryRate(state: SimulationState, ventilator: VentilatorSettings, patient: PatientSettings, t: number): number {
  const mandatoryRate = ventilator.mode === 'PSV' ? 0 : Math.max(ventilator.rate, 0)
  const fallback = Math.max(patient.spontaneousRate > 0 ? patient.spontaneousRate : 0, mandatoryRate)
  if (state.lastInspirationStart < -50) return fallback

  const elapsedSinceInspiration = Math.max(0.01, t - state.lastInspirationStart)
  const referenceRate = Math.max(state.estimatedRespiratoryRate, fallback, 0.1)
  const expectedCycle = 60 / referenceRate

  // Once two expected cycles have passed with no inspiration, there is no
  // current alveolar ventilation. An old respiratory rate must not masquerade
  // as ventilation during prolonged apnoea.
  if (elapsedSinceInspiration > Math.max(3, expectedCycle * 2)) return 0

  const rateLimitedByMissedBreath = 60 / elapsedSinceInspiration
  return clamp(Math.min(Math.max(state.estimatedRespiratoryRate, fallback), rateLimitedByMissedBreath), 0, 80)
}

function calculateEffectiveAlveolarVentilation(
  state: SimulationState,
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  t: number,
  complianceL: number,
): number {
  const fallbackVt = Math.max(ventilator.tidalVolume / 1000, 0.3)
  const tidalVolumeL = state.lastExpiredTidalVolume > 0.02 ? state.lastExpiredTidalVolume : fallbackVt
  const deadSpaceL = Math.max(patient.deadSpaceVolume ?? 150, 0) / 1000
  const alveolarVolumeL = Math.max(0, tidalVolumeL - deadSpaceL)
  const respiratoryRate = effectiveRespiratoryRate(state, ventilator, patient, t)
  const tau = Math.max(patient.expiratoryResistance * complianceL, 0.05)
  const expiratoryTime = Math.max(state.lastExpiratoryDuration, 0.05)
  const emptyingFraction = clamp(1 - Math.exp(-expiratoryTime / tau), 0.03, 1)
  return alveolarVolumeL * respiratoryRate * emptyingFraction
}

function co2TargetFromVentilation(alveolarVentilationLmin: number, patient: PatientSettings): number {
  const vco2 = Math.max(patient.co2Production ?? 250, 0)
  if (alveolarVentilationLmin <= 0.05) return 150
  return clamp(0.863 * vco2 / alveolarVentilationLmin, 10, 150)
}

function updateAlveolarCo2(
  state: SimulationState,
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  t: number,
  dt: number,
  complianceL: number,
) {
  const alveolarVentilation = calculateEffectiveAlveolarVentilation(state, ventilator, patient, t, complianceL)
  const vco2 = Math.max(patient.co2Production ?? 250, 0)

  if (alveolarVentilation <= 0.05) {
    // With no ventilation, metabolic CO2 continues to accumulate. The effective
    // CO2 distribution volume is scaled to PBW so a typical adult at VCO2 250
    // mL/min rises about 5-6 mmHg/min; changing VCO2 changes that slope directly.
    const heightCm = patient.heightCm ?? 170
    const pbw = Math.max(20, (patient.sex === 'female' ? 45.5 : 50) + 0.91 * (heightCm - 152.4))
    const co2DistributionVolumeL = Math.max(15, pbw * 0.6)
    const riseMmHgPerMinute = 0.863 * vco2 / co2DistributionVolumeL
    state.alveolarCo2 = clamp(state.alveolarCo2 + (riseMmHgPerMinute / 60) * dt, 0, 150)
    return
  }

  const target = co2TargetFromVentilation(alveolarVentilation, patient)
  const responseTime = 8
  const fraction = 1 - Math.exp(-dt / responseTime)
  state.alveolarCo2 = clamp(state.alveolarCo2 + (target - state.alveolarCo2) * fraction, 0, 150)
}'''
s = s[:start] + new_block + s[end:]
s = s.replace('return clamp(etco2 * phaseIIEndFraction * riseShape, 0, 100)', 'return clamp(etco2 * phaseIIEndFraction * riseShape, 0, 150)')
s = s.replace('return clamp(etco2 * Math.min(1, phaseIIEndFraction + plateauRise), 0, 100)', 'return clamp(etco2 * Math.min(1, phaseIIEndFraction + plateauRise), 0, 150)')
p.write_text(s)

for path in Path('src').rglob('*'):
    if path.suffix not in {'.ts', '.tsx'}:
        continue
    text = path.read_text()
    if 'v0.67' in text:
        path.write_text(text.replace('v0.67', 'v0.68'))

p = Path('src/diagnostics.ts')
s = p.read_text()
s, n = re.subn(r"export const APP_VERSION = '[^']+'", "export const APP_VERSION = '0.68'", s, count=1)
if n != 1:
    raise SystemExit('APP_VERSION anchor not found')
p.write_text(s)
