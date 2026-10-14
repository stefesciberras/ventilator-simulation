from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old[:140]!r}")
    p.write_text(text.replace(old, new, 1))

# Bump centralized app version.
replace_once('src/appVersion.ts', "export const APP_VERSION = '0.77.4'\n", "export const APP_VERSION = '0.77.5'\n")

# Teaching-session pause synchronization should use explicit React state, not DOM inspection/clicks.
replace_once(
    'src/session/useTeachingSession.ts',
    "  setPatientTransitionSeconds: (seconds: number) => void\n  candidateAlarmLevel: CandidateAlarmLevel\n}\n",
    "  setPatientTransitionSeconds: (seconds: number) => void\n  candidateAlarmLevel: CandidateAlarmLevel\n  simulationPaused: boolean\n  setSimulationPaused: (paused: boolean) => void\n}\n",
)

replace_once(
    'src/session/useTeachingSession.ts',
    "\nfunction getPauseButton(): HTMLButtonElement | null {\n  return document.querySelector<HTMLButtonElement>('.top-simulation-pause')\n}\n\nfunction isSimulationPausedInDom(): boolean {\n  return Boolean(getPauseButton()?.classList.contains('paused'))\n}\n\nfunction setSimulationPausedInDom(paused: boolean) {\n  const button = getPauseButton()\n  if (!button) return\n  const current = button.classList.contains('paused')\n  if (current !== paused) button.click()\n}\n",
    "",
)

replace_once(
    'src/session/useTeachingSession.ts',
    "  setAlarmLimits,\n  setPatientTransitionSeconds,\n  candidateAlarmLevel,\n}: UseTeachingSessionArgs) {\n",
    "  setAlarmLimits,\n  setPatientTransitionSeconds,\n  candidateAlarmLevel,\n  simulationPaused,\n  setSimulationPaused,\n}: UseTeachingSessionArgs) {\n",
)

replace_once(
    'src/session/useTeachingSession.ts',
    "    if (pauseChanged) setSimulationPausedInDom(Boolean(next.simulation_paused))\n",
    "    if (pauseChanged) setSimulationPaused(Boolean(next.simulation_paused))\n",
)

replace_once(
    'src/session/useTeachingSession.ts',
    "      const localPaused = isSimulationPausedInDom()\n",
    "      const localPaused = simulationPaused\n",
)

replace_once(
    'src/session/useTeachingSession.ts',
    "      pauseRevisionRef.current = Number(row.pause_revision ?? 0)\n      sessionStorage.setItem('eduvent.instructor-session-id', found.sessionId)\n",
    "      pauseRevisionRef.current = Number(row.pause_revision ?? 0)\n      setSimulationPaused(Boolean(row.simulation_paused))\n      sessionStorage.setItem('eduvent.instructor-session-id', found.sessionId)\n",
)

old_pause_effect = """  useEffect(() => {\n    if (role !== 'instructor' || !session?.id) return\n    const button = getPauseButton()\n    if (!button) return\n\n    const publishPauseState = () => {\n      if (pauseBroadcastTimerRef.current != null) window.clearTimeout(pauseBroadcastTimerRef.current)\n      pauseBroadcastTimerRef.current = window.setTimeout(async () => {\n        const latest = sessionRef.current\n        if (!latest || roleRef.current !== 'instructor') return\n        const paused = isSimulationPausedInDom()\n        if (paused === Boolean(latest.simulation_paused)) return\n        pauseRevisionRef.current = Math.max(pauseRevisionRef.current, Number(latest.pause_revision ?? 0)) + 1\n        try {\n          const next = await updateTeachingSession(latest.id, {\n            simulation_paused: paused,\n            pause_revision: pauseRevisionRef.current,\n          })\n          storeSession(next)\n          setError(null)\n        } catch (cause) {\n          setError(cause instanceof Error ? cause.message : 'Unable to broadcast simulation pause state.')\n        }\n      }, 40)\n    }\n\n    const observer = new MutationObserver(publishPauseState)\n    observer.observe(button, { attributes: true, attributeFilter: ['class'] })\n    return () => {\n      observer.disconnect()\n      if (pauseBroadcastTimerRef.current != null) window.clearTimeout(pauseBroadcastTimerRef.current)\n    }\n  }, [role, session?.id])\n\n  useEffect(() => {\n    if (role !== 'candidate') return\n    const button = getPauseButton()\n    if (!button) return\n    const protectInstructorPause = (event: MouseEvent) => {\n      if (sessionRef.current?.simulation_paused && button.classList.contains('paused')) {\n        event.preventDefault()\n        event.stopImmediatePropagation()\n      }\n    }\n    button.addEventListener('click', protectInstructorPause, true)\n    return () => button.removeEventListener('click', protectInstructorPause, true)\n  }, [role])\n"""
new_pause_effect = """  useEffect(() => {\n    if (role !== 'instructor' || !session?.id) return\n    if (pauseBroadcastTimerRef.current != null) window.clearTimeout(pauseBroadcastTimerRef.current)\n    pauseBroadcastTimerRef.current = window.setTimeout(async () => {\n      const latest = sessionRef.current\n      if (!latest || roleRef.current !== 'instructor') return\n      if (simulationPaused === Boolean(latest.simulation_paused)) return\n      pauseRevisionRef.current = Math.max(pauseRevisionRef.current, Number(latest.pause_revision ?? 0)) + 1\n      try {\n        const next = await updateTeachingSession(latest.id, {\n          simulation_paused: simulationPaused,\n          pause_revision: pauseRevisionRef.current,\n        })\n        storeSession(next)\n        setError(null)\n      } catch (cause) {\n        setError(cause instanceof Error ? cause.message : 'Unable to broadcast simulation pause state.')\n      }\n    }, 40)\n    return () => {\n      if (pauseBroadcastTimerRef.current != null) window.clearTimeout(pauseBroadcastTimerRef.current)\n    }\n  }, [simulationPaused, role, session?.id])\n"""
replace_once('src/session/useTeachingSession.ts', old_pause_effect, new_pause_effect)

replace_once(
    'src/session/useTeachingSession.ts',
    "  const candidateWaveformsLocked = role === 'candidate' && !Boolean(session?.candidate_can_edit_waveforms)\n",
    "  const candidateWaveformsLocked = role === 'candidate' && !Boolean(session?.candidate_can_edit_waveforms)\n  const candidatePauseLocked = role === 'candidate' && Boolean(session?.simulation_paused)\n",
)
replace_once(
    'src/session/useTeachingSession.ts',
    "    candidateWaveformsLocked,\n    candidateOesophagealPressureAllowed,\n",
    "    candidateWaveformsLocked,\n    candidatePauseLocked,\n    candidateOesophagealPressureAllowed,\n",
)

# Wire the simulation pause state into the teaching-session hook.
replace_once(
    'src/App.tsx',
    "    setPatientTransitionSeconds,\n    candidateAlarmLevel: candidateAlarmLevelForSession,\n  })\n",
    "    setPatientTransitionSeconds,\n    candidateAlarmLevel: candidateAlarmLevelForSession,\n    simulationPaused: frozen,\n    setSimulationPaused: setFrozen,\n  })\n",
)

# Ensure externally-driven resume clears the frozen waveform snapshot as well.
replace_once(
    'src/App.tsx',
    "  useEffect(() => {\n    if (!frozen || frozenSamples) return\n    setFrozenSamples(movingSamples)\n    setTraceCursor(Math.min(Math.floor(movingSamples.length * 0.7), Math.max(0, movingSamples.length - 1)))\n  }, [frozen, frozenSamples, movingSamples])\n",
    "  useEffect(() => {\n    if (!frozen) {\n      if (frozenSamples) setFrozenSamples(null)\n      return\n    }\n    if (frozenSamples) return\n    setFrozenSamples(movingSamples)\n    setTraceCursor(Math.min(Math.floor(movingSamples.length * 0.7), Math.max(0, movingSamples.length - 1)))\n  }, [frozen, frozenSamples, movingSamples])\n",
)

replace_once(
    'src/App.tsx',
    "            type=\"button\"\n            onClick={toggleFreeze}\n            aria-label={frozen ? 'Resume whole simulation' : 'Pause whole simulation'}\n            title={frozen ? 'Resume whole simulation' : 'Pause whole simulation'}\n",
    "            type=\"button\"\n            onClick={toggleFreeze}\n            disabled={teachingSession.candidatePauseLocked}\n            aria-label={teachingSession.candidatePauseLocked ? 'Simulation paused by instructor' : (frozen ? 'Resume whole simulation' : 'Pause whole simulation')}\n            title={teachingSession.candidatePauseLocked ? 'Simulation paused by instructor' : (frozen ? 'Resume whole simulation' : 'Pause whole simulation')}\n",
)

replace_once(
    'src/App.tsx',
    "            <button className={`hardware-button icon-button freeze-button ${frozen ? 'active' : ''}`} onClick={toggleFreeze} title={frozen ? 'Resume simulation' : 'Pause and freeze waveforms'} aria-label={frozen ? 'Resume simulation' : 'Pause simulation'}><PauseIcon paused={frozen} /></button>\n",
    "            <button className={`hardware-button icon-button freeze-button ${frozen ? 'active' : ''}`} onClick={toggleFreeze} disabled={teachingSession.candidatePauseLocked} title={teachingSession.candidatePauseLocked ? 'Simulation paused by instructor' : (frozen ? 'Resume simulation' : 'Pause and freeze waveforms')} aria-label={teachingSession.candidatePauseLocked ? 'Simulation paused by instructor' : (frozen ? 'Resume simulation' : 'Pause simulation')}><PauseIcon paused={frozen} /></button>\n",
)

print('v0.77.5 pause-state cleanup applied')
