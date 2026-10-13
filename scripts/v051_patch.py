from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)

# simulation/types.ts
p = Path('src/simulation/types.ts')
s = p.read_text()
s = replace_once(s, '  pressureControl: number\n  pressureSupport: number', '  pressureControl: number\n  volumeGuaranteePressureLimit: number\n  pressureSupport: number', 'types pressure limit')
p.write_text(s)

# App.tsx
p = Path('src/App.tsx')
s = p.read_text()
s = replace_once(s, '  inspiratoryFlow: 30, plateauPercent: 0, pressureControl: 15, pressureSupport: 10, triggerType:', '  inspiratoryFlow: 30, plateauPercent: 0, pressureControl: 15, volumeGuaranteePressureLimit: 40, pressureSupport: 10, triggerType:', 'App default Pmax')
s = s.replace("appVersion: '0.50'", "appVersion: '0.51'")
s = s.replace('v0.50', 'v0.51')
s = replace_once(s, "                  {activeMode === 'VG-PC' && <span>VT target <b>{ventilator.tidalVolume} mL</b></span>}", "                  {activeMode === 'VG-PC' && (<>\n                    <span>VT target <b>{ventilator.tidalVolume} mL</b></span>\n                    <span>Pinsp <b>{(ventilator.peep + simulationStateRef.current.vgPressureControl).toFixed(0)} cmH₂O</b></span>\n                    <span>Pmax <b>{ventilator.volumeGuaranteePressureLimit ?? 40} cmH₂O</b></span>\n                  </>)}", 'App VG header')
p.write_text(s)

# SessionPanel version
p = Path('src/components/SessionPanel.tsx')
s = p.read_text().replace("version.textContent = 'v0.50'", "version.textContent = 'v0.51'")
p.write_text(s)

# Controls.tsx
p = Path('src/components/Controls.tsx')
s = p.read_text()
s = replace_once(s, "const flowFor = (tidalVolumeMl: number, inspiratoryTime: number, plateauPercent: number) => {\n  const flowTime = Math.max(inspiratoryTime * (1 - clamp(plateauPercent, 0, 20) / 100), 0.05)\n  return (tidalVolumeMl / 1000) / flowTime * 60\n}\n", "const flowFor = (tidalVolumeMl: number, inspiratoryTime: number, plateauPercent: number) => {\n  const flowTime = Math.max(inspiratoryTime * (1 - clamp(plateauPercent, 0, 20) / 100), 0.05)\n  return (tidalVolumeMl / 1000) / flowTime * 60\n}\n\nconst reconcileVolumeControlFromFlow = (settings: VentilatorSettings, requestedFlow: number) => {\n  const fraction = plateauFraction(settings)\n  const cycle = cycleTime(settings.rate)\n  const minimumTi = cycle / (1 + MAX_IE)\n  const maximumTi = cycle / (1 + MIN_IE)\n  const requestedFlowTime = (settings.tidalVolume / 1000) / Math.max(requestedFlow / 60, 0.01)\n  const requestedTi = requestedFlowTime / Math.max(1 - fraction, 0.8)\n  const inspiratoryTime = clamp(requestedTi, minimumTi, maximumTi)\n  const inspiratoryFlow = flowFor(settings.tidalVolume, inspiratoryTime, settings.plateauPercent ?? 0)\n  return { inspiratoryTime, inspiratoryFlow }\n}\n", 'Controls VC reconcile helper')
s = replace_once(s, "    const next = { ...settings, mode }\n    if (isVolumeMandatoryMode(mode)) next.inspiratoryFlow = flowFor(next.tidalVolume, next.inspiratoryTime, next.plateauPercent ?? 0)\n    onChange(next)", "    const next = { ...settings, mode }\n    if (isVolumeMandatoryMode(mode)) Object.assign(next, reconcileVolumeControlFromFlow(next, next.inspiratoryFlow))\n    onChange(next)", 'Controls setMode')
s = replace_once(s, "  const setRate = (rate: number) => {\n    const inspiratoryTime = cycleTime(rate) / (1 + currentIeRatio)\n    const next: VentilatorSettings = { ...settings, rate, inspiratoryTime }\n    if (isVolumeMandatoryMode(settings.mode)) next.inspiratoryFlow = flowFor(next.tidalVolume, inspiratoryTime, next.plateauPercent ?? 0)\n    onChange(next)\n  }", "  const setRate = (rate: number) => {\n    if (isVolumeMandatoryMode(settings.mode)) {\n      const next: VentilatorSettings = { ...settings, rate }\n      Object.assign(next, reconcileVolumeControlFromFlow(next, settings.inspiratoryFlow))\n      onChange(next)\n      return\n    }\n    const inspiratoryTime = cycleTime(rate) / (1 + currentIeRatio)\n    onChange({ ...settings, rate, inspiratoryTime })\n  }", 'Controls setRate')
s = replace_once(s, "  const setTidalVolume = (tidalVolume: number) => {\n    const next: VentilatorSettings = { ...settings, tidalVolume }\n    if (isVolumeMandatoryMode(settings.mode)) next.inspiratoryFlow = flowFor(tidalVolume, settings.inspiratoryTime, settings.plateauPercent ?? 0)\n    onChange(next)\n  }", "  const setTidalVolume = (tidalVolume: number) => {\n    const next: VentilatorSettings = { ...settings, tidalVolume }\n    if (isVolumeMandatoryMode(settings.mode)) Object.assign(next, reconcileVolumeControlFromFlow(next, settings.inspiratoryFlow))\n    onChange(next)\n  }", 'Controls setTidalVolume')
s = replace_once(s, "  const setInspiratoryFlow = (requestedFlow: number) => {\n    const fraction = plateauFraction(settings)\n    const requestedFlowTime = (settings.tidalVolume / 1000) / Math.max(requestedFlow / 60, 0.01)\n    const requestedTi = requestedFlowTime / Math.max(1 - fraction, 0.8)\n    const requestedRatio = cycleTime(settings.rate) / requestedTi - 1\n    const boundedRatio = clamp(requestedRatio, MIN_IE, MAX_IE)\n    const inspiratoryTime = cycleTime(settings.rate) / (1 + boundedRatio)\n    const inspiratoryFlow = flowFor(settings.tidalVolume, inspiratoryTime, settings.plateauPercent ?? 0)\n    onChange({ ...settings, inspiratoryTime, inspiratoryFlow })\n  }", "  const setInspiratoryFlow = (requestedFlow: number) => {\n    onChange({ ...settings, ...reconcileVolumeControlFromFlow(settings, requestedFlow) })\n  }", 'Controls setInspiratoryFlow')
s = replace_once(s, "  const setPlateauPercent = (plateauPercent: number) => {\n    const bounded = clamp(plateauPercent, 0, 20)\n    onChange({\n      ...settings,\n      plateauPercent: bounded,\n      inspiratoryFlow: flowFor(settings.tidalVolume, settings.inspiratoryTime, bounded),\n    })\n  }", "  const setPlateauPercent = (plateauPercent: number) => {\n    const bounded = clamp(plateauPercent, 0, 20)\n    const next: VentilatorSettings = { ...settings, plateauPercent: bounded }\n    Object.assign(next, reconcileVolumeControlFromFlow(next, settings.inspiratoryFlow))\n    onChange(next)\n  }", 'Controls setPlateauPercent')
s = replace_once(s, "          {settings.mode === 'VG-PC' && <Slider label=\"Starting pressure\" value={settings.pressureControl} unit=\" cmH₂O\" min={5} max={30} onChange={(v) => patch({ pressureControl: v })} />}", "          {settings.mode === 'VG-PC' && <Slider label=\"AutoFlow Pmax\" value={settings.volumeGuaranteePressureLimit ?? 40} unit=\" cmH₂O\" min={20} max={60} onChange={(v) => patch({ volumeGuaranteePressureLimit: v })} />}", 'Controls VG Pmax')
p.write_text(s)

# engine.ts
p = Path('src/simulation/engine.ts')
s = p.read_text()
s = replace_once(s, '  vgPressureControl: number\n  vgSettingPressure: number\n  bipapHigh: boolean', '  vgPressureControl: number\n  vgSettingPressure: number\n  vgBreathNumber: number\n  vgTestPlateauPressure: number\n  bipapHigh: boolean', 'engine state fields')
s = replace_once(s, '    vgPressureControl: 15,\n    vgSettingPressure: 15,\n    bipapHigh: true,', '    vgPressureControl: 5,\n    vgSettingPressure: 40,\n    vgBreathNumber: 0,\n    vgTestPlateauPressure: 5,\n    bipapHigh: true,', 'engine state defaults')
s = replace_once(s, "  if (mode === 'VG-PC') {\n    state.vgPressureControl = clamp(ventilator.pressureControl, 5, 40)\n    state.vgSettingPressure = ventilator.pressureControl\n  }", "  if (mode === 'VG-PC') {\n    state.vgPressureControl = 5\n    state.vgSettingPressure = ventilator.volumeGuaranteePressureLimit ?? 40\n    state.vgBreathNumber = 0\n    state.vgTestPlateauPressure = 5\n  }", 'engine adopt VG')
s = replace_once(s, "  if (mode === 'VG-PC' && Math.abs(state.vgSettingPressure - ventilator.pressureControl) > 0.001) {\n    state.vgPressureControl = clamp(ventilator.pressureControl, 5, 40)\n    state.vgSettingPressure = ventilator.pressureControl\n  }", "  if (mode === 'VG-PC') {\n    const pressureLimit = ventilator.volumeGuaranteePressureLimit ?? 40\n    if (Math.abs(state.vgSettingPressure - pressureLimit) > 0.001) {\n      const maximumDrivingPressure = Math.max(0.1, pressureLimit - 5 - ventilator.peep)\n      state.vgPressureControl = clamp(state.vgPressureControl, Math.min(5, maximumDrivingPressure), maximumDrivingPressure)\n      state.vgSettingPressure = pressureLimit\n    }\n  }", 'engine live VG limit')
old_vc = '''  } else if (state.breathActive && state.activeBreathType === 'vc') {
    const plateauFraction = clamp(ventilator.plateauPercent ?? 0, 0, 20) / 100
    const flowTime = Math.max(ventilator.inspiratoryTime * (1 - plateauFraction), 0.05)
    const targetFlow = Math.max(ventilator.inspiratoryFlow, 1) / 60
    const targetVolume = ventilator.tidalVolume / 1000
    const flowPhaseComplete = elapsed >= flowTime || state.inspiredThisBreath >= targetVolume
    const totalInspirationComplete = elapsed >= ventilator.inspiratoryTime

    if (totalInspirationComplete) {
      if (inspiratoryHoldRequested) {
        state.inspiratoryHoldActive = true
        inspiration = true
        flowLs = 0
        pressure = ventilator.peep + state.volume / complianceL - pmus
      } else {
        finishBreath(state, t, postCycleReleaseGuard)
        inspiration = false
      }
    } else if (flowPhaseComplete) {
      flowLs = 0
      pressure = ventilator.peep + state.volume / complianceL - pmus
    } else {
      flowLs = targetFlow
      const elasticPressure = state.volume / complianceL
      const resistivePressure = patient.resistance * flowLs
      const estimatedPatientFlowDemand = pmus / Math.max(patient.resistance, 0.5)
      const excessDemand = Math.max(0, estimatedPatientFlowDemand - targetFlow)
      const starvationFraction = estimatedPatientFlowDemand > 0
        ? clamp(excessDemand / estimatedPatientFlowDemand, 0, 1)
        : 0
      const flowStarvationPressure = pmus * starvationFraction
      pressure = ventilator.peep + elasticPressure + resistivePressure - flowStarvationPressure
    }
'''
new_vc = '''  } else if (state.breathActive && state.activeBreathType === 'vc') {
    const plateauFraction = clamp(ventilator.plateauPercent ?? 0, 0, 20) / 100
    const targetFlow = Math.max(ventilator.inspiratoryFlow, 1) / 60
    const targetVolume = Math.max(ventilator.tidalVolume / 1000, 0.01)
    // Conventional VC: VT and constant inspiratory flow define flow time.
    // The plateau is added after volume delivery, so Ti cannot independently
    // truncate a volume-controlled breath.
    const flowTime = targetVolume / targetFlow
    const totalInspiratoryTime = flowTime / Math.max(1 - plateauFraction, 0.8)
    const flowPhaseComplete = elapsed >= flowTime || state.inspiredThisBreath >= targetVolume - 1e-6
    const totalInspirationComplete = elapsed >= totalInspiratoryTime

    if (totalInspirationComplete) {
      if (inspiratoryHoldRequested) {
        state.inspiratoryHoldActive = true
        inspiration = true
        flowLs = 0
        pressure = ventilator.peep + state.volume / complianceL - pmus
      } else {
        finishBreath(state, t, postCycleReleaseGuard)
        inspiration = false
      }
    } else if (flowPhaseComplete) {
      flowLs = 0
      pressure = ventilator.peep + state.volume / complianceL - pmus
    } else {
      const remainingVolume = Math.max(0, targetVolume - state.inspiredThisBreath)
      flowLs = Math.min(targetFlow, remainingVolume / Math.max(dt, 0.001))
      const elasticPressure = state.volume / complianceL
      const resistivePressure = patient.resistance * flowLs
      const estimatedPatientFlowDemand = pmus / Math.max(patient.resistance, 0.5)
      const excessDemand = Math.max(0, estimatedPatientFlowDemand - flowLs)
      const starvationFraction = estimatedPatientFlowDemand > 0
        ? clamp(excessDemand / estimatedPatientFlowDemand, 0, 1)
        : 0
      const flowStarvationPressure = pmus * starvationFraction
      pressure = ventilator.peep + elasticPressure + resistivePressure - flowStarvationPressure
    }
'''
s = replace_once(s, old_vc, new_vc, 'engine VC branch')
old_vg = '''  } else if (state.breathActive && state.activeBreathType === 'vg-pc') {
    if (elapsed >= ventilator.inspiratoryTime) {
      if (inspiratoryHoldRequested) {
        state.inspiratoryHoldActive = true
        inspiration = true
        flowLs = 0
        pressure = ventilator.peep + state.volume / complianceL - pmus
      } else {
        const targetVolume = Math.max(ventilator.tidalVolume / 1000, 0.05)
        const volumeErrorFraction = (targetVolume - state.inspiredThisBreath) / targetVolume
        const deadband = 0.03
        let pressureAdjustment = 0
        if (Math.abs(volumeErrorFraction) > deadband) {
          const adjustmentMagnitude = clamp(Math.abs(volumeErrorFraction) * 10, 1, 3)
          pressureAdjustment = Math.sign(volumeErrorFraction) * adjustmentMagnitude
        }
        state.vgPressureControl = clamp(state.vgPressureControl + pressureAdjustment, 5, 40)
        finishBreath(state, t, postCycleReleaseGuard)
        inspiration = false
      }
    } else {
      pressure = ventilator.peep + state.vgPressureControl
      const elasticPressure = state.volume / complianceL
      const availableDrivingPressure = state.vgPressureControl - elasticPressure + pmus
      flowLs = Math.max(0, availableDrivingPressure / Math.max(patient.resistance, 0.5))
    }
'''
new_vg = '''  } else if (state.breathActive && state.activeBreathType === 'vg-pc') {
    const targetVolume = Math.max(ventilator.tidalVolume / 1000, 0.05)
    const pressureLimit = ventilator.volumeGuaranteePressureLimit ?? 40
    const maximumDrivingPressure = Math.max(0.1, pressureLimit - 5 - ventilator.peep)
    const minimumDrivingPressure = Math.min(5, maximumDrivingPressure)

    if (state.vgBreathNumber === 0) {
      // Dräger AutoFlow test breath 1: conventional VC with a small plateau.
      // The measured plateau seeds the pressure-controlled test breath.
      const testPlateauFraction = 0.1
      const testFlowTime = Math.max(ventilator.inspiratoryTime * (1 - testPlateauFraction), 0.05)
      const testFlow = targetVolume / testFlowTime
      const flowComplete = elapsed >= testFlowTime || state.inspiredThisBreath >= targetVolume - 1e-6

      if (elapsed >= ventilator.inspiratoryTime) {
        const measuredPlateauDrivingPressure = Math.max(0.1, state.volume / complianceL - pmus)
        state.vgTestPlateauPressure = measuredPlateauDrivingPressure
        state.vgPressureControl = clamp(measuredPlateauDrivingPressure * 0.8, minimumDrivingPressure, maximumDrivingPressure)
        state.vgBreathNumber = 1
        finishBreath(state, t, postCycleReleaseGuard)
        inspiration = false
      } else if (flowComplete) {
        flowLs = 0
        pressure = ventilator.peep + state.volume / complianceL - pmus
      } else {
        const remainingVolume = Math.max(0, targetVolume - state.inspiredThisBreath)
        flowLs = Math.min(testFlow, remainingVolume / Math.max(dt, 0.001))
        const elasticPressure = state.volume / complianceL
        const resistivePressure = patient.resistance * flowLs
        pressure = ventilator.peep + elasticPressure + resistivePressure - pmus
      }
    } else {
      // Subsequent breaths are pressure controlled, therefore inspiratory flow
      // decelerates naturally as elastic recoil approaches the pressure target.
      pressure = ventilator.peep + state.vgPressureControl
      const elasticPressure = state.volume / complianceL
      const availableDrivingPressure = state.vgPressureControl - elasticPressure + pmus
      flowLs = Math.max(0, availableDrivingPressure / Math.max(patient.resistance, 0.5))

      const excessiveVolume = state.inspiredThisBreath >= targetVolume * 1.3
      if (excessiveVolume) {
        // AutoFlow volume safeguard: terminate above 130% VT and reduce the
        // next pressure to 75% of the current pressure.
        state.vgPressureControl = clamp(state.vgPressureControl * 0.75, minimumDrivingPressure, maximumDrivingPressure)
        state.vgBreathNumber += 1
        finishBreath(state, t, postCycleReleaseGuard)
        inspiration = false
        flowLs = 0
      } else if (elapsed >= ventilator.inspiratoryTime) {
        if (inspiratoryHoldRequested) {
          state.inspiratoryHoldActive = true
          inspiration = true
          flowLs = 0
          pressure = ventilator.peep + state.volume / complianceL - pmus
        } else {
          // Compare delivered inspiratory VT with the set VT. Estimate the
          // pressure needed for the next breath and limit change to +/-3.
          const deliveredVolume = Math.max(state.inspiredThisBreath, 0.001)
          const estimatedTargetPressure = state.vgPressureControl * targetVolume / deliveredVolume
          const pressureAdjustment = clamp(estimatedTargetPressure - state.vgPressureControl, -3, 3)
          state.vgPressureControl = clamp(state.vgPressureControl + pressureAdjustment, minimumDrivingPressure, maximumDrivingPressure)
          state.vgBreathNumber += 1
          finishBreath(state, t, postCycleReleaseGuard)
          inspiration = false
        }
      }
    }
'''
s = replace_once(s, old_vg, new_vg, 'engine VG branch')
p.write_text(s)

print('v0.51 patch applied')
