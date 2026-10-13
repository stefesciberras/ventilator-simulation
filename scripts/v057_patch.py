from pathlib import Path

# types
p=Path('src/simulation/types.ts')
s=p.read_text()
s=s.replace("export interface PatientSettings {\n  compliance: number", "export interface PatientSettings {\n  sex: 'male' | 'female'\n  heightCm: number\n  oxygenConsumption: number\n  frc: number\n  compliance: number")
p.write_text(s)

# reusable PBW helper
Path('src/patientMetrics.ts').write_text("""import type { PatientSettings } from './simulation/types'\n\nexport function calculatePredictedBodyWeight(sex: PatientSettings['sex'], heightCm: number): number {\n  const base = sex === 'female' ? 45.5 : 50\n  return Math.max(20, base + 0.91 * (heightCm - 152.4))\n}\n""")

# controls
p=Path('src/components/Controls.tsx')
s=p.read_text()
s=s.replace("import type { PatientSettings, VentilatorMode, VentilatorSettings } from '../simulation/types'", "import type { PatientSettings, VentilatorMode, VentilatorSettings } from '../simulation/types'\nimport { calculatePredictedBodyWeight } from '../patientMetrics'")
s=s.replace("  const previousSpontaneousRate = useRef(settings.spontaneousRate > 0 ? settings.spontaneousRate : 12)", "  const previousSpontaneousRate = useRef(settings.spontaneousRate > 0 ? settings.spontaneousRate : 12)\n  const predictedBodyWeight = calculatePredictedBodyWeight(settings.sex ?? 'male', settings.heightCm ?? 170)")
old="""      <Slider label=\"End-expiratory Pes\" value={settings.endExpiratoryOesophagealPressure ?? -5} unit=\" cmH₂O\" min={-15} max={15} step={0.5} onChange={(v) => patch({ endExpiratoryOesophagealPressure: v })} />\n      <Slider label=\"VCO₂ production\" value={settings.co2Production ?? 250} unit=\" mL/min\" min={100} max={500} step={10} onChange={(v) => patch({ co2Production: v })} />\n      <Slider label=\"Dead space volume\" value={settings.deadSpaceVolume ?? 150} unit=\" mL\" min={50} max={400} step={10} onChange={(v) => patch({ deadSpaceVolume: v })} />\n"""
new="""      <Slider label=\"End-expiratory Pes\" value={settings.endExpiratoryOesophagealPressure ?? -5} unit=\" cmH₂O\" min={-15} max={15} step={0.5} onChange={(v) => patch({ endExpiratoryOesophagealPressure: v })} />\n      <div className=\"patient-subsection-title\">Physiological</div>\n      <div className=\"patient-sex-selector\" role=\"group\" aria-label=\"Patient sex used for predicted body weight\">\n        <span>Sex</span>\n        <div>\n          <button type=\"button\" className={(settings.sex ?? 'male') === 'male' ? 'selected' : ''} onClick={() => patch({ sex: 'male' })}>Male</button>\n          <button type=\"button\" className={(settings.sex ?? 'male') === 'female' ? 'selected' : ''} onClick={() => patch({ sex: 'female' })}>Female</button>\n        </div>\n      </div>\n      <Slider label=\"Height\" value={settings.heightCm ?? 170} unit=\" cm\" min={130} max={210} step={1} displayValue={`${settings.heightCm ?? 170} cm · PBW ${predictedBodyWeight.toFixed(1)} kg`} onChange={(v) => patch({ heightCm: v })} />\n      <Slider label=\"Oxygen consumption (VO₂)\" value={settings.oxygenConsumption ?? 250} unit=\" mL/min\" min={100} max={600} step={10} onChange={(v) => patch({ oxygenConsumption: v })} />\n      <Slider label=\"FRC\" value={settings.frc ?? 2500} unit=\" mL\" min={800} max={5000} step={50} onChange={(v) => patch({ frc: v })} />\n      <Slider label=\"VCO₂ production\" value={settings.co2Production ?? 250} unit=\" mL/min\" min={100} max={500} step={10} onChange={(v) => patch({ co2Production: v })} />\n      <Slider label=\"Dead space volume\" value={settings.deadSpaceVolume ?? 150} unit=\" mL\" min={50} max={400} step={10} onChange={(v) => patch({ deadSpaceVolume: v })} />\n"""
if old not in s: raise SystemExit('controls anchor missing')
s=s.replace(old,new)
p.write_text(s)

# app defaults + interpolation + version
p=Path('src/App.tsx')
s=p.read_text()
s=s.replace("const initialPatient: PatientSettings = {\n  compliance:", "const initialPatient: PatientSettings = {\n  sex: 'male', heightCm: 170, oxygenConsumption: 250, frc: 2500,\n  compliance:")
s=s.replace("  return {\n    compliance: lerp(from.compliance, to.compliance),", "  return {\n    sex: f < 0.5 ? (from.sex ?? 'male') : (to.sex ?? 'male'),\n    heightCm: lerp(from.heightCm ?? 170, to.heightCm ?? 170),\n    oxygenConsumption: lerp(from.oxygenConsumption ?? 250, to.oxygenConsumption ?? 250),\n    frc: lerp(from.frc ?? 2500, to.frc ?? 2500),\n    compliance: lerp(from.compliance, to.compliance),")
s=s.replace("v0.56", "v0.57")
s=s.replace("'0.56'", "'0.57'")
p.write_text(s)

# styles
p=Path('src/physiology.css')
s=p.read_text()
s += """\n.patient-subsection-title {\n  margin: 16px 0 8px;\n  padding-top: 12px;\n  border-top: 1px solid rgba(98,182,197,.22);\n  color: #8fb9c5;\n  font-size: 10px;\n  font-weight: 700;\n  letter-spacing: .1em;\n  text-transform: uppercase;\n}\n.patient-sex-selector { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:0 0 10px; color:#b9d7de; font-size:11px; }\n.patient-sex-selector > div { display:flex; gap:6px; }\n.patient-sex-selector button { min-width:64px; padding:6px 10px; }\n.patient-sex-selector button.selected { border-color:#69d8f1; color:#e8fbff; background:rgba(65,154,174,.2); }\n"""
p.write_text(s)
