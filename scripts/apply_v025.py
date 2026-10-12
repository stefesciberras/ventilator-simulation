from pathlib import Path


def rep(path: str, old: str, new: str, count: int = -1) -> None:
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'Pattern missing in {path}: {old[:100]}')
    p.write_text(s.replace(old, new, count))


rep(
    'src/components/Controls.tsx',
    """      {(settings.mode === 'APRV' || settings.mode === 'BIPAP') ? (
        <>
          <Slider label="Phigh" value={settings.pHigh} unit=" cmH₂O" min={10} max={40} onChange={(v) => patch({ pHigh: Math.max(v, settings.pLow + 1) })} />
          <Slider label="Plow" value={settings.pLow} unit=" cmH₂O" min={0} max={15} onChange={(v) => patch({ pLow: Math.min(v, settings.pHigh - 1) })} />
          <Slider label="Thigh" value={settings.tHigh} unit=" s" min={0.5} max={10} step={0.1} onChange={(v) => patch({ tHigh: v })} />
          <Slider label="Tlow" value={settings.tLow} unit=" s" min={0.2} max={2} step={0.05} onChange={(v) => patch({ tLow: v })} />
        </>
      ) : (""",
    """      {settings.mode === 'APRV' ? (
        <>
          <Slider label="Phigh" value={settings.pHigh} unit=" cmH₂O" min={10} max={40} onChange={(v) => patch({ pHigh: Math.max(v, settings.pLow + 1) })} />
          <Slider label="Plow" value={settings.pLow} unit=" cmH₂O" min={0} max={15} onChange={(v) => patch({ pLow: Math.min(v, settings.pHigh - 1) })} />
          <Slider label="Thigh" value={settings.tHigh} unit=" s" min={0.5} max={10} step={0.1} onChange={(v) => patch({ tHigh: v })} />
          <Slider label="Tlow" value={settings.tLow} unit=" s" min={0.2} max={2} step={0.05} onChange={(v) => patch({ tLow: v })} />
        </>
      ) : settings.mode === 'BIPAP' ? (
        <>
          <Slider label="Pinsp" value={settings.pressureControl} unit=" cmH₂O" min={5} max={30} onChange={(v) => patch({ pressureControl: v })} />
          <Slider label="PEEP" value={settings.peep} unit=" cmH₂O" min={0} max={20} onChange={(v) => patch({ peep: v })} />
          <Slider label="Rate" value={settings.rate} unit="/min" min={5} max={35} onChange={setRate} />
          <Slider label="I:E ratio" value={Number(currentIeRatio.toFixed(1))} unit="" min={MIN_IE} max={MAX_IE} step={0.1} displayValue={`1:${currentIeRatio.toFixed(1)}`} onChange={setIeRatio} />
          <Slider label="Trigger" value={settings.triggerSensitivity} unit=" cmH₂O" min={1} max={8} step={0.5} onChange={(v) => patch({ triggerSensitivity: v })} />
        </>
      ) : (""",
)

rep(
    'src/simulation/engine.ts',
    """  vgPressureControl: number
  vgSettingPressure: number
}""",
    """  vgPressureControl: number
  vgSettingPressure: number
  bipapHigh: boolean
  bipapPhaseStart: number
}""",
)

rep(
    'src/simulation/engine.ts',
    """    vgPressureControl: 15,
    vgSettingPressure: 15,
  }""",
    """    vgPressureControl: 15,
    vgSettingPressure: 15,
    bipapHigh: true,
    bipapPhaseStart: 0,
  }""",
)

rep(
    'src/simulation/engine.ts',
    """function twoLevelPhaseHigh(state: SimulationState, ventilator: VentilatorSettings, t: number): boolean {
  const tHigh = Math.max(ventilator.tHigh, 0.1)
  const tLow = Math.max(ventilator.tLow, 0.05)
  const cycle = tHigh + tLow
  const elapsed = t - state.modeStartTime
  const phase = ((elapsed % cycle) + cycle) % cycle
  return phase < tHigh
}""",
    """function twoLevelPhaseHigh(state: SimulationState, ventilator: VentilatorSettings, t: number): boolean {
  if (state.lastMode === 'BIPAP') return state.bipapHigh
  const tHigh = Math.max(ventilator.tHigh, 0.1)
  const tLow = Math.max(ventilator.tLow, 0.05)
  const cycle = tHigh + tLow
  const elapsed = t - state.modeStartTime
  const phase = ((elapsed % cycle) + cycle) % cycle
  return phase < tHigh
}""",
)

rep(
    'src/simulation/engine.ts',
    """  state.expiratoryTriggerReady = true
  state.peakExpiratoryFlowMagnitude = 0""",
    """  state.expiratoryTriggerReady = true
  state.peakExpiratoryFlowMagnitude = 0
  if (mode === 'BIPAP') {
    state.bipapHigh = true
    state.bipapPhaseStart = t
    state.breathStart = t
  }""",
)

p = Path('src/simulation/engine.ts')
s = p.read_text()
start = s.index('function twoLevelSample(\n')
end = s.index('\nexport function stepSimulation(\n', start)
new_fn = """function twoLevelSample(
  state: SimulationState,
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  t: number,
  dt: number,
  pmus: number,
  complianceL: number,
  mode: 'APRV' | 'BIPAP',
): Sample {
  let high: boolean
  let previousHigh: boolean
  let pHigh: number
  let pLow: number
  let breathTrigger: Sample['breathTrigger']

  if (mode === 'BIPAP') {
    previousHigh = state.bipapHigh
    const nominalCycle = 60 / Math.max(ventilator.rate, 1)
    const nominalTi = clamp(
      ventilator.inspiratoryTime,
      0.2,
      Math.max(0.25, nominalCycle - 0.2),
    )
    const nominalTe = Math.max(0.2, nominalCycle - nominalTi)
    const phaseElapsed = Math.max(0, t - state.bipapPhaseStart)
    const triggerThreshold = Math.max(0.1, ventilator.triggerSensitivity)
    const effortStarting = pmus >= triggerThreshold && state.previousPmus < triggerThreshold
    const effortEnding = pmus < triggerThreshold && state.previousPmus >= triggerThreshold

    if (state.bipapHigh) {
      const syncWindow = clamp(nominalTi * 0.25, 0.12, 0.6)
      const syncStart = Math.max(0.2, nominalTi - syncWindow)
      const maximumTi = nominalTi + syncWindow
      const synchronizedCycleOff = phaseElapsed >= syncStart && effortEnding
      const nominalCycleOff = phaseElapsed >= nominalTi && pmus < triggerThreshold
      const forcedCycleOff = phaseElapsed >= maximumTi

      if (synchronizedCycleOff || nominalCycleOff || forcedCycleOff) {
        state.bipapHigh = false
        state.bipapPhaseStart = t
      }
    } else {
      const syncWindow = clamp(nominalTe * 0.25, 0.12, 0.8)
      const syncStart = Math.max(0.2, nominalTe - syncWindow)
      const synchronizedCycleOn = phaseElapsed >= syncStart && effortStarting
      const mandatoryCycleOn = phaseElapsed >= nominalTe

      if (synchronizedCycleOn || mandatoryCycleOn) {
        state.bipapHigh = true
        state.bipapPhaseStart = t
        state.breathStart = t
        breathTrigger = synchronizedCycleOn ? 'patient' : 'mandatory'
      }
    }

    high = state.bipapHigh
    pLow = ventilator.peep
    pHigh = ventilator.peep + Math.max(ventilator.pressureControl, 1)
  } else {
    const tHigh = Math.max(ventilator.tHigh, 0.1)
    const tLow = Math.max(ventilator.tLow, 0.05)
    const cycle = tHigh + tLow
    const elapsed = t - state.modeStartTime
    const phase = ((elapsed % cycle) + cycle) % cycle
    const previousPhase = ((((elapsed - dt) % cycle) + cycle) % cycle)
    high = phase < tHigh
    previousHigh = previousPhase < tHigh
    pHigh = Math.max(ventilator.pHigh, ventilator.pLow + 1)
    pLow = Math.min(ventilator.pLow, pHigh - 1)

    if (high && !previousHigh) {
      state.breathStart = t
      breathTrigger = 'mandatory'
    }
  }

  const targetPressure = high ? pHigh : pLow
  const spontaneousPressureDeflection = mode === 'BIPAP'
    ? clamp(pmus * 0.35, 0, 6)
    : high
      ? clamp(pmus * 0.35, 0, 6)
      : 0

  const distendingPressure = high ? pHigh - pLow : 0
  const elasticPressure = state.volume / complianceL
  const drivingPressure = distendingPressure - elasticPressure + pmus
  const resistance = drivingPressure >= 0
    ? Math.max(patient.resistance, 0.5)
    : Math.max(patient.expiratoryResistance, 0.5)
  const flowLs = drivingPressure / resistance

  state.volume = clamp(state.volume + flowLs * dt, 0, 2.5)

  const sample: Sample = {
    time: Number(t.toFixed(4)),
    pressure: clamp(targetPressure - spontaneousPressureDeflection, -5, 80),
    flow: flowLs * 60,
    volume: state.volume * 1000,
    musclePressure: pmus,
    phase: high ? 'inspiration' : 'expiration',
    mode,
    breathTrigger,
    expiratoryHold: false,
    simvSyncWindow: false,
  }

  state.previousPmus = pmus
  return sample
}
"""
p.write_text(s[:start] + new_fn + s[end:])

rep('src/App.tsx', '<span className="version">v0.24</span>', '<span className="version">v0.25</span>')

rep(
    'src/App.tsx',
    """              {(activeMode === 'APRV' || activeMode === 'BIPAP') ? (
                <>
                  <span>Phigh <b>{ventilator.pHigh}</b></span>
                  <span>Plow <b>{ventilator.pLow}</b></span>
                  <span>Thigh <b>{ventilator.tHigh.toFixed(1)} s</b></span>
                  <span>Tlow <b>{ventilator.tLow.toFixed(2)} s</b></span>
                </>
              ) : (""",
    """              {activeMode === 'APRV' ? (
                <>
                  <span>Phigh <b>{ventilator.pHigh}</b></span>
                  <span>Plow <b>{ventilator.pLow}</b></span>
                  <span>Thigh <b>{ventilator.tHigh.toFixed(1)} s</b></span>
                  <span>Tlow <b>{ventilator.tLow.toFixed(2)} s</b></span>
                </>
              ) : activeMode === 'BIPAP' ? (
                <>
                  <span>Pinsp <b>{ventilator.pressureControl}</b></span>
                  <span>PEEP <b>{ventilator.peep}</b></span>
                  <span>RR <b>{ventilator.rate}</b></span>
                  <span>I:E <b>1:{ieRatio.toFixed(1)}</b></span>
                </>
              ) : (""",
)

rep('src/App.tsx', '>Inspiratory hold</button>', '>Insp Hold</button>')
rep('src/App.tsx', '>Expiratory hold</button>', '>Exp Hold</button>')

rep(
    'src/simulation/engine.ts',
    "const displayedPeep = (latestMode === 'APRV' || latestMode === 'BIPAP') ? ventilator.pLow : ventilator.peep",
    "const displayedPeep = latestMode === 'APRV' ? ventilator.pLow : ventilator.peep",
)
