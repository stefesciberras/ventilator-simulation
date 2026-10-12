from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Pattern not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


replace(
    "src/simulation/engine.ts",
    """  const triggerThreshold = Math.max(0.1, ventilator.triggerSensitivity)\n\n  if ((state.breathActive || state.inspiratoryHoldActive) && pmus >= triggerThreshold && state.breathsDuringEffort === 0) {\n    state.breathsDuringEffort = 1\n  }\n\n  const thresholdCrossing = pmus >= triggerThreshold && state.previousPmus < triggerThreshold\n  const persistentEffortRetrigger =\n    pmus >= triggerThreshold &&\n    state.breathsDuringEffort > 0 &&\n    state.breathsDuringEffort < 2 &&\n    t - state.lastBreathEnd >= triggerRefractoryPeriod\n\n  const mandatoryMode = mode !== 'PSV'\n  const patientTriggerAllowed = !mandatoryMode || state.expiratoryTriggerReady\n  const ongoingEffortAfterGate = mandatoryMode && state.expiratoryTriggerReady && pmus >= triggerThreshold\n  const patientTrigger =\n    !state.breathActive &&\n    !state.inspiratoryHoldActive &&\n    !state.expiratoryHoldActive &&\n    patientTriggerAllowed &&\n    (thresholdCrossing || persistentEffortRetrigger || ongoingEffortAfterGate)\n""",
    """  const triggerThreshold = Math.max(0.1, ventilator.triggerSensitivity)\n\n  // During expiration, trapped volume leaves alveolar pressure above set PEEP.\n  // The patient must first overcome this intrinsic-PEEP load before the usual\n  // pressure-trigger sensitivity can be reached. This allows weak efforts to\n  // deform the expiratory waveform without necessarily triggering assistance.\n  const intrinsicPeepBarrier =\n    !state.breathActive &&\n    !state.inspiratoryHoldActive &&\n    !state.expiratoryHoldActive\n      ? Math.max(0, state.volume / complianceL)\n      : 0\n  const effectiveTriggerThreshold = triggerThreshold + intrinsicPeepBarrier\n\n  if ((state.breathActive || state.inspiratoryHoldActive) && pmus >= triggerThreshold && state.breathsDuringEffort === 0) {\n    state.breathsDuringEffort = 1\n  }\n\n  const thresholdCrossing =\n    pmus >= effectiveTriggerThreshold &&\n    state.previousPmus < effectiveTriggerThreshold\n  const persistentEffortRetrigger =\n    pmus >= effectiveTriggerThreshold &&\n    state.breathsDuringEffort > 0 &&\n    state.breathsDuringEffort < 2 &&\n    t - state.lastBreathEnd >= triggerRefractoryPeriod\n\n  const mandatoryMode = mode !== 'PSV'\n  const patientTriggerAllowed = !mandatoryMode || state.expiratoryTriggerReady\n  const ongoingEffortAfterGate =\n    mandatoryMode &&\n    state.expiratoryTriggerReady &&\n    pmus >= effectiveTriggerThreshold\n  const patientTrigger =\n    !state.breathActive &&\n    !state.inspiratoryHoldActive &&\n    !state.expiratoryHoldActive &&\n    patientTriggerAllowed &&\n    (thresholdCrossing || persistentEffortRetrigger || ongoingEffortAfterGate)\n""",
)

replace(
    "src/simulation/engine.ts",
    """    if (exposePatientEffort) {\n      const effortFlow = pmus / Math.max(patient.resistance, 0.5)\n      flowLs = passiveExpiratoryFlow + effortFlow\n      pressure = ventilator.peep - Math.min(pmus, triggerThreshold)\n    } else {\n      flowLs = passiveExpiratoryFlow\n      pressure = ventilator.peep\n    }\n""",
    """    if (exposePatientEffort) {\n      const elasticPressure = state.volume / complianceL\n      const netPatientDrivingPressure = pmus - elasticPressure\n      const effortResistance = netPatientDrivingPressure >= 0\n        ? Math.max(patient.resistance, 0.5)\n        : Math.max(patient.expiratoryResistance, 0.5)\n\n      // Before intrinsic PEEP is overcome, inspiratory effort merely slows\n      // expiration. Once pmus exceeds the trapped elastic pressure, flow can\n      // reverse and Paw can dip. If the remaining deflection is still smaller\n      // than trigger sensitivity, the effort is ineffective and no assisted\n      // breath is delivered.\n      flowLs = netPatientDrivingPressure / effortResistance\n      const triggerDeflection = Math.max(0, pmus - elasticPressure)\n      pressure = ventilator.peep - Math.min(triggerDeflection, triggerThreshold)\n    } else {\n      flowLs = passiveExpiratoryFlow\n      pressure = ventilator.peep\n    }\n""",
)

replace(
    "src/App.tsx",
    '<span className="version">v0.25</span>',
    '<span className="version">v0.26</span>',
)
