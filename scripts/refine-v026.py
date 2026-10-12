from pathlib import Path

p = Path('src/simulation/engine.ts')
s = p.read_text()

old = """  const mandatoryMode = mode !== 'PSV'\n  const patientTriggerAllowed = !mandatoryMode || state.expiratoryTriggerReady\n  const ongoingEffortAfterGate =\n    mandatoryMode &&\n    state.expiratoryTriggerReady &&\n    pmus >= effectiveTriggerThreshold\n"""
new = """  const mandatoryMode = mode !== 'PSV'\n  const patientTriggerAllowed =\n    !mandatoryMode ||\n    state.expiratoryTriggerReady ||\n    t - state.lastBreathEnd >= triggerRefractoryPeriod\n  const ongoingEffortAfterGate =\n    mandatoryMode &&\n    patientTriggerAllowed &&\n    pmus >= effectiveTriggerThreshold\n"""
if old not in s:
    raise SystemExit('trigger gate pattern missing')
s = s.replace(old, new, 1)

old = """    const exposePatientEffort =\n      pmus > 0 &&\n      t >= state.suppressEffortUntil &&\n      (!mandatoryMode || state.expiratoryTriggerReady)\n"""
new = """    const exposePatientEffort =\n      pmus > 0 &&\n      t >= state.suppressEffortUntil\n"""
if old not in s:
    raise SystemExit('effort exposure pattern missing')
s = s.replace(old, new, 1)

p.write_text(s)
