from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one match, found {count}\nANCHOR:\n{old[:240]}")
    p.write_text(text.replace(old, new, 1))


# Sample event model: distinguish neural effort, ventilator trigger detection,
# and actual breath onset.
replace_once(
    "src/simulation/types.ts",
    "  breathTrigger?: 'mandatory' | 'patient'\n  expiratoryHold?: boolean\n",
    "  breathTrigger?: 'mandatory' | 'patient'\n  ventilatorTriggerDetected?: boolean\n  ventilatorTriggerBaseline?: number\n  patientEffortStart?: boolean\n  expiratoryHold?: boolean\n",
)

# Two-level modes still expose patient-effort onset markers. BIPAP synchronized
# triggering also exposes a trigger-detection marker at the low/PEEP baseline.
replace_once(
    "src/simulation/engine.ts",
    "  let breathTrigger: Sample['breathTrigger']\n\n  if (mode === 'BIPAP') {\n",
    "  let breathTrigger: Sample['breathTrigger']\n  let ventilatorTriggerDetected = false\n  const patientEffortStart = pmus > 0.1 && state.previousPmus <= 0.1\n\n  if (mode === 'BIPAP') {\n",
)
replace_once(
    "src/simulation/engine.ts",
    "      if (synchronizedCycleOn || mandatoryCycleOn) {\n        state.bipapHigh = true\n        state.bipapPhaseStart = t\n        state.breathStart = t\n        breathTrigger = synchronizedCycleOn ? 'patient' : 'mandatory'\n      }\n",
    "      if (synchronizedCycleOn || mandatoryCycleOn) {\n        ventilatorTriggerDetected = synchronizedCycleOn\n        state.bipapHigh = true\n        state.bipapPhaseStart = t\n        state.breathStart = t\n        breathTrigger = synchronizedCycleOn ? 'patient' : 'mandatory'\n      }\n",
)
replace_once(
    "src/simulation/engine.ts",
    "    mode,\n    breathTrigger,\n    expiratoryHold: false,\n",
    "    mode,\n    breathTrigger,\n    ventilatorTriggerDetected,\n    ventilatorTriggerBaseline: ventilatorTriggerDetected ? pLow : undefined,\n    patientEffortStart,\n    expiratoryHold: false,\n",
)

# For conventional/PS modes, start the 150 ms ventilator response delay only
# after the trigger detector is actually eligible. This preserves the existing
# early-expiration gate in mandatory modes and records the exact accepted
# threshold-crossing sample separately from breath onset.
replace_once(
    "src/simulation/engine.ts",
    "  if (mode === 'APRV' || mode === 'BIPAP') {\n    const sample = twoLevelSample(state, ventilator, patient, t, dt, pmus, complianceL, mode)\n    updateVentilationTracking(state, sample, t, dt)\n    return sample\n  }\n\n  const spontaneousCycle = patient.spontaneousRate > 0 ? 60 / patient.spontaneousRate : Number.POSITIVE_INFINITY\n",
    "  if (mode === 'APRV' || mode === 'BIPAP') {\n    const sample = twoLevelSample(state, ventilator, patient, t, dt, pmus, complianceL, mode)\n    updateVentilationTracking(state, sample, t, dt)\n    return sample\n  }\n\n  const patientEffortStart = pmus > 0.1 && state.previousPmus <= 0.1\n  const spontaneousCycle = patient.spontaneousRate > 0 ? 60 / patient.spontaneousRate : Number.POSITIVE_INFINITY\n",
)

old_trigger_block = """  const supportTriggeringDisabled =
    (mode === 'PSV' || isSimv(mode)) && ventilator.pressureSupport <= 0.001
  const rawTriggerSignalMet = !supportTriggeringDisabled && (ventilator.triggerType === 'flow'
    ? predictedPatientFlowLmin >= flowTriggerSensitivity
    : predictedAirwayPressure <= pressureTriggerLevel)
  const triggerDetectionEligible = !state.breathActive && !state.inspiratoryHoldActive && !state.expiratoryHoldActive
  let triggerSignalMet = rawTriggerSignalMet

  if (!triggerDetectionEligible || supportTriggeringDisabled) {
    state.triggerDetectedAt = null
    triggerSignalMet = false
  } else {
    if (rawTriggerSignalMet && state.triggerDetectedAt == null) state.triggerDetectedAt = t
    triggerSignalMet = state.triggerDetectedAt != null && t - state.triggerDetectedAt >= triggerResponseDelay
  }

  if ((state.breathActive || state.inspiratoryHoldActive) && pmus > 0.1 && state.breathsDuringEffort === 0) {
    state.breathsDuringEffort = 1
  }

  const firstEffortTrigger = triggerSignalMet && state.breathsDuringEffort === 0
  const persistentEffortRetrigger =
    triggerSignalMet &&
    state.breathsDuringEffort > 0 &&
    state.breathsDuringEffort < 2 &&
    t - state.lastBreathEnd >= triggerRefractoryPeriod

  const mandatoryMode = mode !== 'PSV'
  const patientTriggerAllowed =
    !mandatoryMode ||
    state.expiratoryTriggerReady ||
    t - state.lastBreathEnd >= triggerRefractoryPeriod
"""
new_trigger_block = """  const supportTriggeringDisabled =
    (mode === 'PSV' || isSimv(mode)) && ventilator.pressureSupport <= 0.001
  const mandatoryMode = mode !== 'PSV'
  const patientTriggerAllowed =
    !mandatoryMode ||
    state.expiratoryTriggerReady ||
    t - state.lastBreathEnd >= triggerRefractoryPeriod
  const rawTriggerSignalMet = !supportTriggeringDisabled && (ventilator.triggerType === 'flow'
    ? predictedPatientFlowLmin >= flowTriggerSensitivity
    : predictedAirwayPressure <= pressureTriggerLevel)
  const triggerDetectionEligible =
    !state.breathActive &&
    !state.inspiratoryHoldActive &&
    !state.expiratoryHoldActive &&
    patientTriggerAllowed
  let triggerSignalMet = false
  let ventilatorTriggerDetected = false

  if (!triggerDetectionEligible || supportTriggeringDisabled) {
    state.triggerDetectedAt = null
  } else {
    if (rawTriggerSignalMet && state.triggerDetectedAt == null) {
      state.triggerDetectedAt = t
      ventilatorTriggerDetected = true
    }
    triggerSignalMet = state.triggerDetectedAt != null && t - state.triggerDetectedAt >= triggerResponseDelay
  }

  if ((state.breathActive || state.inspiratoryHoldActive) && pmus > 0.1 && state.breathsDuringEffort === 0) {
    state.breathsDuringEffort = 1
  }

  const firstEffortTrigger = triggerSignalMet && state.breathsDuringEffort === 0
  const persistentEffortRetrigger =
    triggerSignalMet &&
    state.breathsDuringEffort > 0 &&
    state.breathsDuringEffort < 2 &&
    t - state.lastBreathEnd >= triggerRefractoryPeriod
"""
replace_once("src/simulation/engine.ts", old_trigger_block, new_trigger_block)

replace_once(
    "src/simulation/engine.ts",
    "    mode,\n    breathTrigger,\n    expiratoryHold: state.expiratoryHoldActive,\n",
    "    mode,\n    breathTrigger,\n    ventilatorTriggerDetected,\n    ventilatorTriggerBaseline: ventilatorTriggerDetected ? ventilator.peep : undefined,\n    patientEffortStart,\n    expiratoryHold: state.expiratoryHoldActive,\n",
)

# Waveform: patient effort becomes a time-aligned lung marker at the top of the
# Paw trace. The trigger marker is now driven by threshold detection and points
# to the PEEP baseline, not to the delayed supported-breath sample.
replace_once(
    "src/components/Waveform.tsx",
    "  showTime?: boolean\n  showSimvSyncWindow?: boolean\n}\n",
    "  showTime?: boolean\n  showSimvSyncWindow?: boolean\n  showPatientEffortMarkers?: boolean\n}\n",
)
replace_once(
    "src/components/Waveform.tsx",
    "export function Waveform({ samples, signal, label, unit, min, max, accent, frozen = false, cursorIndex = 0, onCursorChange, showTime = false, showSimvSyncWindow = false }: WaveformProps) {",
    "export function Waveform({ samples, signal, label, unit, min, max, accent, frozen = false, cursorIndex = 0, onCursorChange, showTime = false, showSimvSyncWindow = false, showPatientEffortMarkers = false }: WaveformProps) {",
)

old_marker_block = """    if (signal === 'pressure') {
      samples.forEach((sample, index) => {
        if (sample.breathTrigger !== 'patient') return
        const x = (index / Math.max(1, samples.length - 1)) * width
        const pressureY = Math.max(1, Math.min(height - 1, toY(sample.pressure)))
        const tipY = Math.max(12, pressureY - 4)

        ctx.fillStyle = '#78e08f'
        ctx.beginPath()
        ctx.moveTo(x, tipY)
        ctx.lineTo(x - 5.5, tipY - 9)
        ctx.lineTo(x + 5.5, tipY - 9)
        ctx.closePath()
        ctx.fill()
      })
    }
"""
new_marker_block = """    if (signal === 'pressure') {
      if (showPatientEffortMarkers) {
        samples.forEach((sample, index) => {
          if (!sample.patientEffortStart) return
          const x = (index / Math.max(1, samples.length - 1)) * width

          // Small lung symbol aligned to the neural-effort onset. It lives at
          // the top edge of the Paw display so it remains independent of Paw.
          ctx.save()
          ctx.translate(x, 2)
          ctx.strokeStyle = '#84e4f0'
          ctx.lineWidth = 1.35
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.lineTo(0, 5)
          ctx.moveTo(0, 4)
          ctx.lineTo(-2.2, 6)
          ctx.moveTo(0, 4)
          ctx.lineTo(2.2, 6)
          ctx.stroke()
          ctx.beginPath()
          ctx.ellipse(-3.4, 8.5, 3, 4.2, -0.15, 0, Math.PI * 2)
          ctx.ellipse(3.4, 8.5, 3, 4.2, 0.15, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        })
      }

      samples.forEach((sample, index) => {
        if (!sample.ventilatorTriggerDetected) return
        const x = (index / Math.max(1, samples.length - 1)) * width
        const baseline = sample.ventilatorTriggerBaseline ?? sample.pressure
        const baselineY = Math.max(1, Math.min(height - 1, toY(baseline)))
        const tipY = Math.max(11, baselineY - 1)

        ctx.fillStyle = '#78e08f'
        ctx.beginPath()
        ctx.moveTo(x, tipY)
        ctx.lineTo(x - 5.5, tipY - 9)
        ctx.lineTo(x + 5.5, tipY - 9)
        ctx.closePath()
        ctx.fill()
      })
    }
"""
replace_once("src/components/Waveform.tsx", old_marker_block, new_marker_block)
replace_once(
    "src/components/Waveform.tsx",
    "  }, [samples, signal, scaleMin, scaleMax, accent, frozen, cursorIndex, showSimvSyncWindow])\n",
    "  }, [samples, signal, scaleMin, scaleMax, accent, frozen, cursorIndex, showSimvSyncWindow, showPatientEffortMarkers])\n",
)

# Remove the old live strip/animation and feed the visibility permission directly
# into the Paw waveform marker renderer.
replace_once(
    "src/App.tsx",
    "function LungEffortIcon() {\n  return (\n    <svg viewBox=\"0 0 32 32\" aria-hidden=\"true\">\n      <path d=\"M15.2 5.5v8.8M16.8 5.5v8.8\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.7\" strokeLinecap=\"round\" />\n      <path d=\"M14.9 13.2c-2.1-3.7-4.9-6.3-6.8-5.2-2.4 1.4-3.6 7.1-3 12.1.4 3.4 2.4 5.7 5.1 5.8 2.3.1 3.8-1.3 4.7-3.5V13.2Zm2.2 0c2.1-3.7 4.9-6.3 6.8-5.2 2.4 1.4 3.6 7.1 3 12.1-.4 3.4-2.4 5.7-5.1 5.8-2.3.1-3.8-1.3-4.7-3.5V13.2Z\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.7\" strokeLinejoin=\"round\" />\n    </svg>\n  )\n}\n\n",
    "",
)
replace_once(
    "src/App.tsx",
    "  const patientEffortActive = Boolean(patientEffortVisible && latestSample && latestSample.musclePressure > 0.1)\n",
    "",
)
replace_once(
    "src/App.tsx",
    "              {patientEffortVisible && (\n                <div className={`patient-effort-strip ${patientEffortActive ? 'active' : ''}`} title={patientEffortActive ? 'Patient neural inspiratory effort is active' : 'No current patient inspiratory effort'}>\n                  <LungEffortIcon />\n                  <span>{patientEffortActive ? 'Patient effort' : 'Patient effort monitor'}</span>\n                </div>\n              )}\n              <Waveform samples={samples} signal=\"pressure\" label=\"Paw\" unit=\"cmH₂O\" min={0} max={45} accent=\"#f6df63\" frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} showTime showSimvSyncWindow={ventilator.showSimvSyncWindow} />\n",
    "              <Waveform samples={samples} signal=\"pressure\" label=\"Paw\" unit=\"cmH₂O\" min={0} max={45} accent=\"#f6df63\" frozen={frozen} cursorIndex={traceCursor} onCursorChange={setTraceCursor} showTime showSimvSyncWindow={ventilator.showSimvSyncWindow} showPatientEffortMarkers={patientEffortVisible} />\n",
)
replace_once("src/App.tsx", "      appVersion: '0.55',\n", "      appVersion: '0.56',\n")
replace_once("src/App.tsx", "          <span className=\"version\">v0.55</span>\n", "          <span className=\"version\">v0.56</span>\n")

# The old effort strip no longer exists; keep only the Patient-settings toggle CSS.
replace_once(
    "src/physiology.css",
    ".patient-effort-strip {\n  min-height: 34px;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 4px 8px 3px;\n  border-bottom: 1px solid #1b262c;\n  color: #546770;\n  font-size: 9px;\n  letter-spacing: .08em;\n  text-transform: uppercase;\n}\n.patient-effort-strip svg { width: 25px; height: 25px; }\n.patient-effort-strip.active { color: #84e4f0; }\n.patient-effort-strip.active svg { filter: drop-shadow(0 0 7px rgba(132,228,240,.65)); animation: effortPulse .65s ease-in-out infinite alternate; }\n@keyframes effortPulse { from { transform: scale(.96); opacity: .72; } to { transform: scale(1.08); opacity: 1; } }\n\n",
    "",
)

# Guard against accidentally retaining the delayed breath-onset marker renderer.
waveform = Path("src/components/Waveform.tsx").read_text()
if "sample.breathTrigger !== 'patient'" in waveform:
    raise RuntimeError("Waveform still renders the old delayed breathTrigger marker")
if "sample.ventilatorTriggerDetected" not in waveform or "sample.patientEffortStart" not in waveform:
    raise RuntimeError("New event markers are missing from waveform renderer")

engine = Path("src/simulation/engine.ts").read_text()
if "ventilatorTriggerDetected = true" not in engine:
    raise RuntimeError("Trigger-detection event is not emitted at threshold crossing")
if "patientTriggerAllowed\n  let triggerSignalMet" not in engine:
    raise RuntimeError("Trigger detector is not gated by patientTriggerAllowed")

print("v0.56 patch applied")
