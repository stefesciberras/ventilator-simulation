from pathlib import Path

p = Path('src/simulation/engine.ts')
text = p.read_text()
old = """  const airwayCo2 = updateAirwayCo2(
    state,
    !sampleInspiration,
    flowLmin,
    t - state.expirationStartTime,
    patient,
    complianceL,
    t,
    dt,
  )
"""
new = """  const airwayCo2 = updateAirwayCo2(
    state,
    !sampleInspiration,
    flowLmin,
    t - state.expirationStartTime,
    patient,
    complianceL,
    t,
    dt,
    totalDeadSpaceVolumeMl,
  )
"""
if old not in text:
    raise SystemExit('updateAirwayCo2 call target not found')
p.write_text(text.replace(old, new, 1))
print('Added total dead-space argument to airway CO2 model')
