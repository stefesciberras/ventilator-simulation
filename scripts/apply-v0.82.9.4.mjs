import fs from 'node:fs'

function edit(path, changes) {
  let text = fs.readFileSync(path, 'utf8')
  for (const { from, to, label } of changes) {
    if (!text.includes(from)) throw new Error(`${path}: missing ${label}`)
    text = text.replace(from, to)
  }
  fs.writeFileSync(path, text)
}

edit('src/teaching/TeachingMediaPresentation.tsx', [
  {
    label: 'media constants',
    from: "export interface TeachingMediaPresentationRow {\n",
    to: "const PRESENTATION_EVENT = 'teaching-media-presentation-state'\n\nexport interface TeachingMediaPresentationRow {\n",
  },
  {
    label: 'media channel ref',
    from: "  const [error, setError] = useState<string | null>(null)\n\n  const refresh = useCallback",
    to: "  const [error, setError] = useState<string | null>(null)\n  const channelRef = useRef<RealtimeChannel | null>(null)\n\n  const refresh = useCallback",
  },
  {
    label: 'media realtime effect',
    from: "    const channel: RealtimeChannel = supabase\n      .channel(`teaching-media-presentations-${sessionId}-${crypto.randomUUID()}`)\n      .on('postgres_changes', {\n        event: '*', schema: 'public', table: 'teaching_media_presentations', filter: `session_id=eq.${sessionId}`,\n      }, () => { void refresh() })\n      .subscribe()\n    return () => { void supabase.removeChannel(channel) }",
    to: "    const channel: RealtimeChannel = supabase\n      .channel(`teaching-media-presentations-${sessionId}-${crypto.randomUUID()}`, { config: { broadcast: { self: false, ack: false } } })\n      .on('postgres_changes', {\n        event: '*', schema: 'public', table: 'teaching_media_presentations', filter: `session_id=eq.${sessionId}`,\n      }, () => { void refresh() })\n      .on('broadcast', { event: PRESENTATION_EVENT }, ({ payload }) => {\n        if (role !== 'candidate' || !payload || typeof payload !== 'object') return\n        const state = payload as { active?: unknown }\n        if (state.active === false) setActivePresentation(null)\n        else if (state.active === true) void refresh()\n      })\n      .subscribe()\n    channelRef.current = channel\n    return () => {\n      if (channelRef.current === channel) channelRef.current = null\n      void supabase.removeChannel(channel)\n    }",
  },
  {
    label: 'media present broadcast',
    from: "      if (insertError) throw insertError\n      await refresh()",
    to: "      if (insertError) throw insertError\n      await refresh()\n      void channelRef.current?.send({ type: 'broadcast', event: PRESENTATION_EVENT, payload: { active: true, sentAt: Date.now() } })",
  },
  {
    label: 'media close broadcast',
    from: "      if (updateError) throw updateError\n      await refresh()",
    to: "      if (updateError) throw updateError\n      setActivePresentation(null)\n      void channelRef.current?.send({ type: 'broadcast', event: PRESENTATION_EVENT, payload: { active: false, sentAt: Date.now() } })\n      await refresh()",
  },
  {
    label: 'media drag prevent',
    from: "    const drag = dragRef.current\n    if (!drag || drag.pointerId !== event.pointerId || window.innerWidth < 900) return\n    const margin = 12",
    to: "    const drag = dragRef.current\n    if (!drag || drag.pointerId !== event.pointerId || window.innerWidth < 900) return\n    event.preventDefault()\n    const margin = 12",
  },
])

edit('src/teaching/TeachingWorkspace.tsx', [
  {
    label: 'question drag prevent',
    from: "    const drag = dragRef.current\n    if (!drag || drag.pointerId !== event.pointerId || window.innerWidth < 900) return\n    const proposedX",
    to: "    const drag = dragRef.current\n    if (!drag || drag.pointerId !== event.pointerId || window.innerWidth < 900) return\n    event.preventDefault()\n    const proposedX",
  },
])

edit('src/components/SessionPanel.tsx', [
  {
    label: 'session useRef import',
    from: "import { useEffect, useMemo, useState } from 'react'",
    to: "import { useEffect, useMemo, useRef, useState } from 'react'",
  },
  {
    label: 'name ref',
    from: "  const [displayName, setDisplayName] = useState('')\n",
    to: "  const [displayName, setDisplayName] = useState('')\n  const candidateNameInputRef = useRef<HTMLInputElement | null>(null)\n",
  },
  {
    label: 'deep link focus',
    from: "    setSessionKey(deepLinkKey)\n    setJoinMode(true)\n  }, [role])",
    to: "    setSessionKey(deepLinkKey)\n    setJoinMode(true)\n    window.setTimeout(() => {\n      candidateNameInputRef.current?.focus()\n      candidateNameInputRef.current?.select()\n    }, 80)\n  }, [role])",
  },
  {
    label: 'name input ref',
    from: "              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} placeholder=\"Candidate\" />",
    to: "              <input ref={candidateNameInputRef} className=\"candidate-name-input\" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} placeholder=\"Candidate\" />",
  },
])

edit('src/App.tsx', [
  {
    label: 'shared freeze import',
    from: "import { useScreenWakeLock } from './useScreenWakeLock'\n",
    to: "import { useScreenWakeLock } from './useScreenWakeLock'\nimport { useTeachingSharedWaveformFreeze } from './teaching/useTeachingSharedWaveformFreeze'\n",
  },
  {
    label: 'shared freeze hook',
    from: "  const candidateControlsVisible = teachingSession.role !== 'candidate' || teachingSession.session?.candidate_controls_visible !== false\n",
    to: "  const sharedWaveformFreeze = useTeachingSharedWaveformFreeze(\n    teachingSession.role,\n    teachingSession.session?.id ?? null,\n    (active) => {\n      if (teachingSession.role !== 'candidate') return\n      setWaveformFrozen(active)\n      if (!active) setFrozenSamples(null)\n    },\n  )\n\n  const candidateControlsVisible = teachingSession.role !== 'candidate' || teachingSession.session?.candidate_controls_visible !== false\n",
  },
  {
    label: 'deep link controls effect',
    from: "  useEffect(() => {\n    if (!candidateControlsVisible && mobileWorkspacePage === 'settings') setMobileWorkspacePage('ventilator')\n  }, [candidateControlsVisible, mobileWorkspacePage])\n",
    to: "  useEffect(() => {\n    if (!candidateControlsVisible && mobileWorkspacePage === 'settings') setMobileWorkspacePage('ventilator')\n  }, [candidateControlsVisible, mobileWorkspacePage])\n\n  useEffect(() => {\n    if (teachingSession.role !== 'standalone') return\n    const rawKey = new URLSearchParams(window.location.search).get('session') ?? ''\n    const deepLinkKey = rawKey.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)\n    if (deepLinkKey.length !== 6) return\n    setControlTab('teaching')\n    setMobileWorkspacePage('settings')\n  }, [teachingSession.role])\n",
  },
  {
    label: 'freeze refs',
    from: "  const alarmSilenceLongPressTriggeredRef = useRef(false)\n",
    to: "  const alarmSilenceLongPressTriggeredRef = useRef(false)\n  const freezeLongPressTimeoutRef = useRef<number | null>(null)\n  const freezeLongPressTriggeredRef = useRef(false)\n",
  },
  {
    label: 'freeze cleanup',
    from: "    if (alarmSilenceLongPressTimeoutRef.current != null) window.clearTimeout(alarmSilenceLongPressTimeoutRef.current)\n    void audioContextRef.current?.close()",
    to: "    if (alarmSilenceLongPressTimeoutRef.current != null) window.clearTimeout(alarmSilenceLongPressTimeoutRef.current)\n    if (freezeLongPressTimeoutRef.current != null) window.clearTimeout(freezeLongPressTimeoutRef.current)\n    void audioContextRef.current?.close()",
  },
  {
    label: 'freeze gesture handlers',
    from: "  const beginInspiratoryHold = () => {",
    to: "  const startFreezeLongPress = () => {\n    if (teachingSession.role !== 'instructor' || !teachingSession.session?.id) return\n    freezeLongPressTriggeredRef.current = false\n    if (freezeLongPressTimeoutRef.current != null) window.clearTimeout(freezeLongPressTimeoutRef.current)\n    freezeLongPressTimeoutRef.current = window.setTimeout(() => {\n      freezeLongPressTimeoutRef.current = null\n      freezeLongPressTriggeredRef.current = true\n      const next = !sharedWaveformFreeze.active\n      if (next && !waveformFrozen) {\n        setFrozenSamples(movingSamples)\n        setTraceCursor(Math.min(Math.floor(movingSamples.length * 0.7), Math.max(0, movingSamples.length - 1)))\n      }\n      setWaveformFrozen(next)\n      if (!next) setFrozenSamples(null)\n      sharedWaveformFreeze.setActive(next)\n    }, 700)\n  }\n\n  const finishFreezePress = () => {\n    if (freezeLongPressTimeoutRef.current != null) {\n      window.clearTimeout(freezeLongPressTimeoutRef.current)\n      freezeLongPressTimeoutRef.current = null\n    }\n  }\n\n  const handleFreezeClick = () => {\n    if (freezeLongPressTriggeredRef.current) {\n      freezeLongPressTriggeredRef.current = false\n      return\n    }\n    toggleFreeze()\n  }\n\n  const beginInspiratoryHold = () => {",
  },
  {
    label: 'freeze button',
    from: "            <button className={`hardware-button icon-button freeze-button ${waveformFrozen ? 'active' : ''}`} onClick={toggleFreeze} title={waveformFrozen ? 'Resume waveforms' : 'Freeze waveforms'} aria-label={waveformFrozen ? 'Resume waveforms' : 'Freeze waveforms'}><FreezeWaveformIcon /></button>",
    to: "            <button\n              className={`hardware-button icon-button freeze-button ${waveformFrozen ? 'active' : ''} ${sharedWaveformFreeze.active ? 'shared-freeze' : ''}`}\n              onClick={handleFreezeClick}\n              onPointerDown={startFreezeLongPress}\n              onPointerUp={finishFreezePress}\n              onPointerCancel={finishFreezePress}\n              onPointerLeave={finishFreezePress}\n              onContextMenu={(event) => event.preventDefault()}\n              title={teachingSession.role === 'instructor' ? (sharedWaveformFreeze.active ? 'Waveforms frozen for instructor and candidates — hold to resume all' : 'Press to freeze locally; hold to freeze instructor and candidate waveforms') : (waveformFrozen ? 'Resume waveforms' : 'Freeze waveforms')}\n              aria-label={waveformFrozen ? 'Resume waveforms' : 'Freeze waveforms'}\n            ><FreezeWaveformIcon /></button>",
  },
])

edit('src/session.css', [
  {
    label: 'candidate name focus style',
    from: ".candidate-join-form",
    to: ".candidate-name-input:focus { border-color:#ef8a27 !important; box-shadow:0 0 0 3px rgba(239,138,39,.24); outline:none; }\n\n.candidate-join-form",
  },
])

edit('src/teaching/teaching.css', [
  {
    label: 'drag touch action',
    from: ".teaching-prompt-dock-header {",
    to: ".teaching-prompt-dock-header, .teaching-media-header { touch-action:none; overscroll-behavior:none; }\n\n.teaching-prompt-dock-header {",
  },
])

edit('src/appVersion.ts', [
  { label: 'version', from: "export const APP_VERSION = '0.82.9.3'", to: "export const APP_VERSION = '0.82.9.4'" },
])

console.log('Applied v0.82.9.4 source changes')
