from pathlib import Path
p=Path('src/App.tsx')
s=p.read_text()
s=s.replace("import { SharedTeachingTab, TeachingCandidateOverlay, TeachingLaserPointerSurface, eduventTeachingHost, useTeachingPrompts, useTeachingQuestionLibrary, type TeachingMetricSnapshot } from './teaching'", "import { SharedTeachingTab, TeachingCandidateOverlay, TeachingLaserPointerSurface, eduventTeachingHost, useTeachingAlarmSync, useTeachingPrompts, useTeachingQuestionLibrary, type TeachingMetricSnapshot } from './teaching'")
needle="""  const sharedWaveformFreeze = useTeachingSharedWaveformFreeze(\n    teachingSession.role,\n    teachingSession.session?.id ?? null,\n    (active) => {\n      if (teachingSession.role !== 'candidate') return\n      setWaveformFrozen(active)\n      if (!active) setFrozenSamples(null)\n    },\n  )\n"""
replacement=needle+"""\n  const teachingAlarmSync = useTeachingAlarmSync(\n    teachingSession.role,\n    teachingSession.session?.id ?? null,\n    (state) => {\n      if (teachingSession.role !== 'candidate') return\n      setAlarmSilenced(Boolean(state.instructorOverride || (state.silenceUntil ?? 0) > Date.now()))\n    },\n  )\n"""
s=s.replace(needle,replacement)
s=s.replace("  const silenceAlarm = (durationMs = 120000) => {\n    setAlarmLifecycle", "  const silenceAlarm = (durationMs = 120000) => {\n    if (teachingSession.candidateAlarmsLocked) return\n    if (teachingSession.role === 'instructor' && teachingSession.session?.id) teachingAlarmSync.silenceFor(durationMs)\n    setAlarmLifecycle")
p.write_text(s)
