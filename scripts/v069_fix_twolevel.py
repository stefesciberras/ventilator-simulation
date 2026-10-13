from pathlib import Path

p = Path('src/simulation/engine.ts')
text = p.read_text()
old = """  const sample: Sample = {\n    time: Number(t.toFixed(4)),\n    pressure: clamp(targetPressure - spontaneousPressureDeflection, -5, 80),\n    flow: flowLs * 60,\n    volume: state.volume * 1000,\n    musclePressure: pmus,\n    co2: capnogramValue(!high, t - state.expirationStartTime, patient, complianceL, state.alveolarCo2),\n"""
new = """  const flowLmin = flowLs * 60\n  const airwayCo2 = updateAirwayCo2(\n    state,\n    !high,\n    flowLmin,\n    t - state.expirationStartTime,\n    patient,\n    complianceL,\n    t,\n    dt,\n  )\n\n  const sample: Sample = {\n    time: Number(t.toFixed(4)),\n    pressure: clamp(targetPressure - spontaneousPressureDeflection, -5, 80),\n    flow: flowLmin,\n    volume: state.volume * 1000,\n    musclePressure: pmus,\n    co2: airwayCo2,\n"""
if old not in text:
    raise SystemExit('two-level CO2 sample anchor not found')
p.write_text(text.replace(old, new, 1))
print('two-level CO2 path patched')
