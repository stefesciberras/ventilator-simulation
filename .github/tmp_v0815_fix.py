from pathlib import Path

p = Path('src/simulation/engine.ts')
text = p.read_text()
old = """  const flowLmin = flowLs * 60
  const airwayCo2 = updateAirwayCo2(
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
new = """  const flowLmin = flowLs * 60
  const deadSpaceReferenceVtMl = Math.max(state.lastExpiredTidalVolume * 1000, ventilator.tidalVolume, 1)
  const totalDeadSpaceVolumeMl = calculateEffectiveDeadSpace(patient, deadSpaceReferenceVtMl).deadSpaceMl
  const airwayCo2 = updateAirwayCo2(
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
    raise SystemExit('final airway CO2 block target not found')
p.write_text(text.replace(old, new, 1))
print('Scoped total dead-space calculation to final airway CO2 sampling block')
