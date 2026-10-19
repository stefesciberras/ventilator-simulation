import fs from 'node:fs'

const path = 'src/teaching/TeachingLaserPointer.tsx'
let text = fs.readFileSync(path, 'utf8')

function replace(from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing ${label}`)
  text = text.replace(from, to)
}

replace("import type { RealtimeChannel } from '@supabase/supabase-js'\nimport { supabase } from '../session/supabase'\n", "import { sendTeachingBroadcast, subscribeTeachingBroadcast } from './teachingRealtimeBus'\n", 'realtime imports')
replace("  const channelRef = useRef<RealtimeChannel | null>(null)\n", '', 'channel ref')
replace(`  const sendPointer = (next: TeachingLaserPointerState, force = false) => {\n    const channel = channelRef.current\n    if (!channel || role !== 'instructor' || !sessionId) return\n    const now = Date.now()\n    if (!force && now - lastSentAtRef.current < MIN_SEND_INTERVAL_MS) return\n    lastSentAtRef.current = now\n    void channel.send({ type: 'broadcast', event: POINTER_EVENT, payload: next })\n  }\n\n  const sendSnapshot = (snapshot: TeachingWaveformSnapshot | null) => {\n    const channel = channelRef.current\n    if (!channel || role !== 'instructor' || !sessionId) return\n    const payload: TeachingWaveformSnapshotMessage = snapshot\n      ? { active: true, snapshot }\n      : { active: false }\n    void channel.send({ type: 'broadcast', event: SNAPSHOT_EVENT, payload })\n  }\n\n  const requestSnapshot = (channel = channelRef.current) => {\n    if (!channel || role !== 'candidate' || !sessionId) return\n    void channel.send({ type: 'broadcast', event: SNAPSHOT_REQUEST_EVENT, payload: { requestedAt: Date.now() } })\n  }`, `  const sendPointer = (next: TeachingLaserPointerState, force = false) => {\n    if (role !== 'instructor' || !sessionId) return\n    const now = Date.now()\n    if (!force && now - lastSentAtRef.current < MIN_SEND_INTERVAL_MS) return\n    lastSentAtRef.current = now\n    void sendTeachingBroadcast(sessionId, POINTER_EVENT, next)\n  }\n\n  const sendSnapshot = (snapshot: TeachingWaveformSnapshot | null) => {\n    if (role !== 'instructor' || !sessionId) return\n    const payload: TeachingWaveformSnapshotMessage = snapshot\n      ? { active: true, snapshot }\n      : { active: false }\n    void sendTeachingBroadcast(sessionId, SNAPSHOT_EVENT, payload)\n  }\n\n  const requestSnapshot = () => {\n    if (role !== 'candidate' || !sessionId) return\n    void sendTeachingBroadcast(sessionId, SNAPSHOT_REQUEST_EVENT, { requestedAt: Date.now() })\n  }`, 'send functions')

const effectStart = text.indexOf("  useEffect(() => {\n    const previous = channelRef.current")
if (effectStart < 0) throw new Error('Missing channel effect start')
const effectEndMarker = "\n  }, [role, sessionId])"
const effectEnd = text.indexOf(effectEndMarker, effectStart)
if (effectEnd < 0) throw new Error('Missing channel effect end')
const replacement = `  useEffect(() => {\n    setRemotePointer(null)\n    setLocalPointer(null)\n    setRemoteSnapshot(null)\n    setRemoteClock(null)\n\n    if (!sessionId || role === 'standalone') return\n\n    const unsubPointer = subscribeTeachingBroadcast(sessionId, POINTER_EVENT, (payload) => {\n      if (role !== 'candidate' || !isPointerState(payload)) return\n      lastReceivedAtRef.current = Date.now()\n      setRemotePointer({ ...payload, x: clamp01(payload.x), y: clamp01(payload.y) })\n    })\n    const unsubSnapshot = subscribeTeachingBroadcast(sessionId, SNAPSHOT_EVENT, (payload) => {\n      if (role !== 'candidate' || !isWaveformSnapshotMessage(payload)) return\n      setRemoteSnapshot(payload.active && payload.snapshot ? payload.snapshot : null)\n    })\n    const unsubRequest = subscribeTeachingBroadcast(sessionId, SNAPSHOT_REQUEST_EVENT, () => {\n      if (role !== 'instructor') return\n      const snapshot = localSnapshotRef.current\n      if (snapshot) void sendTeachingBroadcast(sessionId, SNAPSHOT_EVENT, { active: true, snapshot } satisfies TeachingWaveformSnapshotMessage)\n    })\n    const unsubClock = subscribeTeachingBroadcast(sessionId, CLOCK_EVENT, (payload) => {\n      if (role !== 'candidate' || !isClockState(payload)) return\n      lastClockReceivedAtRef.current = Date.now()\n      setRemoteClock(payload)\n    })\n\n    if (role === 'candidate') requestSnapshot()\n\n    return () => {\n      unsubPointer()\n      unsubSnapshot()\n      unsubRequest()\n      unsubClock()\n      if (role === 'instructor') {\n        void sendTeachingBroadcast(sessionId, POINTER_EVENT, { x: 0.5, y: 0.5, active: false, sentAt: Date.now(), region: 'display' } satisfies TeachingLaserPointerState)\n        void sendTeachingBroadcast(sessionId, SNAPSHOT_EVENT, { active: false } satisfies TeachingWaveformSnapshotMessage)\n      }\n    }`
text = text.slice(0, effectStart) + replacement + text.slice(effectEnd)

replace(`    const broadcastClock = () => {\n      const channel = channelRef.current\n      const text = readVisibleClockText()\n      if (!channel || !text) return\n      void channel.send({ type: 'broadcast', event: CLOCK_EVENT, payload: { text, sentAt: Date.now() } satisfies TeachingClockState })\n    }`, `    const broadcastClock = () => {\n      const text = readVisibleClockText()\n      if (!text) return\n      void sendTeachingBroadcast(sessionId, CLOCK_EVENT, { text, sentAt: Date.now() } satisfies TeachingClockState)\n    }`, 'clock broadcast')

fs.writeFileSync(path, text)

const versionPath = 'src/appVersion.ts'
let version = fs.readFileSync(versionPath, 'utf8')
if (!version.includes("0.82.9.6")) throw new Error('Version anchor missing')
fs.writeFileSync(versionPath, version.replace('0.82.9.6', '0.82.9.7'))

console.log('Applied v0.82.9.7 teaching realtime bus migration')
