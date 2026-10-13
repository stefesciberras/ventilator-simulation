from pathlib import Path

p = Path('src/simulation/engine.ts')
s = p.read_text()
old = """  if (mode === 'VG-PC') {
    const pressureLimit = ventilator.volumeGuaranteePressureLimit ?? 40
    if (Math.abs(state.vgSettingPressure - pressureLimit) > 0.001) {
      const maximumDrivingPressure = Math.max(0.1, pressureLimit - 5 - ventilator.peep)
      state.vgPressureControl = clamp(state.vgPressureControl, Math.min(5, maximumDrivingPressure), maximumDrivingPressure)
      state.vgSettingPressure = pressureLimit
    }
  }
"""
new = """  if (mode === 'VG-PC') {
    const pressureLimit = ventilator.volumeGuaranteePressureLimit ?? 40
    const maximumDrivingPressure = Math.max(0.1, pressureLimit - 5 - ventilator.peep)
    const minimumDrivingPressure = Math.min(5, maximumDrivingPressure)
    // Re-clamp continuously so a PEEP or Pmax change cannot transiently push
    // AutoFlow above its pressure ceiling during the current breath.
    state.vgPressureControl = clamp(state.vgPressureControl, minimumDrivingPressure, maximumDrivingPressure)
    state.vgSettingPressure = pressureLimit
  }
"""
if s.count(old) != 1:
    raise SystemExit('VG live pressure clamp anchor not found')
s = s.replace(old, new, 1)
old2 = "state.vgPressureControl = clamp(measuredPlateauDrivingPressure * 0.8, minimumDrivingPressure, maximumDrivingPressure)"
new2 = "state.vgPressureControl = clamp(measuredPlateauDrivingPressure * 0.8, minimumDrivingPressure, Math.min(maximumDrivingPressure, 15))"
if s.count(old2) != 1:
    raise SystemExit('second test pressure anchor not found')
s = s.replace(old2, new2, 1)
old3 = "state.vgPressureControl = clamp(state.vgPressureControl * 0.75, minimumDrivingPressure, maximumDrivingPressure)"
new3 = "state.vgPressureControl = clamp(state.vgPressureControl * 0.75, minimumDrivingPressure, Math.min(maximumDrivingPressure, 15))"
if s.count(old3) != 1:
    raise SystemExit('over-volume pressure anchor not found')
s = s.replace(old3, new3, 1)
p.write_text(s)
print('v0.51 final AutoFlow safety patch applied')
