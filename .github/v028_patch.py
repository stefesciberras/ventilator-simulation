from pathlib import Path


def replace(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new))

replace(
    'src/simulation/types.ts',
    '  neuralInspiratoryTime: number\n}',
    '  neuralInspiratoryTime: number\n  endExpiratoryOesophagealPressure: number\n}',
)

replace(
    'src/App.tsx',
    '  compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1, endExpiratoryOesophagealPressure: -5,\n}',
    '  compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1, endExpiratoryOesophagealPressure: -5,\n}',
) if False else None

replace(
    'src/App.tsx',
    '  compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1,\n}',
    '  compliance: 60, resistance: 6, expiratoryResistance: 8, spontaneousRate: 12, effort: 5, neuralInspiratoryTime: 1, endExpiratoryOesophagealPressure: -5,\n}',
)
replace('src/App.tsx', '<span className="version">v0.27</span>', '<span className="version">v0.28</span>')

replace(
    'src/components/Controls.tsx',
    '      <Slider label="Neural inspiratory time" value={settings.neuralInspiratoryTime} unit=" s" min={0.3} max={3} step={0.1} onChange={(v) => patch({ neuralInspiratoryTime: v })} />\n',
    '      <Slider label="Neural inspiratory time" value={settings.neuralInspiratoryTime} unit=" s" min={0.3} max={3} step={0.1} onChange={(v) => patch({ neuralInspiratoryTime: v })} />\n      <Slider label="End-expiratory Pes" value={settings.endExpiratoryOesophagealPressure ?? -5} unit=" cmH₂O" min={-15} max={15} step={0.5} onChange={(v) => patch({ endExpiratoryOesophagealPressure: v })} />\n',
)

replace(
    'src/simulation/engine.ts',
    'function isRequestHeld(t: number, requestTime?: number | null, releaseTime?: number | null): boolean {',
    '''function oesophagealPressureValue(t: number, pmus: number, patient: PatientSettings): number {\n  const heartRate = 80\n  const cardiacPhase = 2 * Math.PI * (heartRate / 60) * t\n  const cardiacOscillation = 0.45 * Math.sin(cardiacPhase) + 0.18 * Math.sin(2 * cardiacPhase + 0.7)\n  const baseline = patient.endExpiratoryOesophagealPressure ?? -5\n  return baseline - pmus + cardiacOscillation\n}\n\nfunction isRequestHeld(t: number, requestTime?: number | null, releaseTime?: number | null): boolean {''',
)
replace(
    'src/simulation/engine.ts',
    'oesophagealPressure: -5 - pmus,',
    'oesophagealPressure: oesophagealPressureValue(t, pmus, patient),',
)

replace(
    'src/components/Waveform.tsx',
    '          <div><strong>{selectedSample[signal].toFixed(valuePrecision)}</strong><span>{unit}</span></div>\n',
    '''          {signal === 'oesophagealPressure' ? (\n            <div className="pes-ptp-readout">\n              <div><span>Pes</span><strong>{selectedSample.oesophagealPressure.toFixed(1)}</strong><small>cmH₂O</small></div>\n              <div><span>Ptp</span><strong>{(selectedSample.pressure - selectedSample.oesophagealPressure).toFixed(1)}</strong><small>cmH₂O</small></div>\n            </div>\n          ) : (\n            <div><strong>{selectedSample[signal].toFixed(valuePrecision)}</strong><span>{unit}</span></div>\n          )}\n''',
)

with open('src/styles.css', 'a') as f:
    f.write('''\n.pes-ptp-readout { display: grid !important; gap: 3px; min-width: 118px; }\n.pes-ptp-readout > div { display: grid !important; grid-template-columns: 28px 1fr auto; align-items: baseline; gap: 5px; }\n.pes-ptp-readout > div > span { font-size: 9px; color: #a9b8be; text-align: left; }\n.pes-ptp-readout > div > strong { font-size: 16px; color: #f4f8fa; text-align: right; }\n.pes-ptp-readout > div > small { font-size: 8px; color: #7f9098; }\n''')
