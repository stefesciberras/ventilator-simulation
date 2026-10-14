from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:140]!r}')
    if text.count(old) != 1:
        raise SystemExit(f'Pattern not unique in {path}: {text.count(old)}')
    p.write_text(text.replace(old, new, 1))

replace_once(
    'src/session/localRuntimeTransport.ts',
    "export function saveLocalRuntimeUrl(url: string | null) {",
    """export type LocalRuntimeProfile = 'local-server' | 'appliance'\n\nexport function getLocalRuntimeProfile(): LocalRuntimeProfile {\n  if (typeof window === 'undefined') return 'local-server'\n  const query = new URLSearchParams(window.location.search).get('runtimeProfile')?.trim().toLowerCase()\n  const stored = window.localStorage.getItem('eduvent.runtime-profile')?.trim().toLowerCase()\n  const selected = query || stored\n  if (selected === 'appliance') return 'appliance'\n  if (window.location.hostname === 'eduvent.local' || window.location.hostname.startsWith('eduvent-box')) return 'appliance'\n  return 'local-server'\n}\n\nexport function saveLocalRuntimeUrl(url: string | null) {""",
)

replace_once(
    'src/session/useTeachingSession.ts',
    "  LocalRuntimeTransport,\n  getDefaultLocalRuntimeUrl,",
    "  LocalRuntimeTransport,\n  getDefaultLocalRuntimeUrl,\n  getLocalRuntimeProfile,",
)
replace_once(
    'src/session/useTeachingSession.ts',
    "} from './localRuntimeTransport'",
    "} from './localRuntimeTransport'\nimport { WebRtcRuntimeTransport } from './webRtcRuntimeTransport'",
)
replace_once(
    'src/session/useTeachingSession.ts',
    "export type SessionConnection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'",
    "export type SessionConnection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'\nexport type RuntimeTransportKind = 'cloud' | 'webrtc' | 'local-server' | 'appliance'",
)
replace_once(
    'src/session/useTeachingSession.ts',
    "  const [localRuntimeUrl, setLocalRuntimeUrl] = useState<string | null>(() => getDefaultLocalRuntimeUrl())",
    "  const [localRuntimeUrl, setLocalRuntimeUrl] = useState<string | null>(() => getDefaultLocalRuntimeUrl())\n  const [runtimeTransportKind, setRuntimeTransportKind] = useState<RuntimeTransportKind>(() => getDefaultLocalRuntimeUrl() ? getLocalRuntimeProfile() : 'webrtc')",
)
replace_once(
    'src/session/useTeachingSession.ts',
    "  const localTransportRef = useRef<LocalRuntimeTransport | null>(null)",
    "  const localTransportRef = useRef<LocalRuntimeTransport | WebRtcRuntimeTransport | null>(null)",
)
old_attach = """  const attachLocalRuntime = (nextRole: 'instructor' | 'candidate', row: TeachingSessionRow) => {\n    localTransportRef.current?.disconnect()\n    localTransportRef.current = null\n    const url = getDefaultLocalRuntimeUrl()\n    setLocalRuntimeUrl(url)\n    if (!url) {\n      localRuntimeConnectionRef.current = 'disabled'\n      setLocalRuntimeConnection('disabled')\n      return\n    }\n\n    const clientId = nextRole === 'instructor'\n      ? (instructorClientIdRef.current ?? crypto.randomUUID())\n      : crypto.randomUUID()\n    const transport = new LocalRuntimeTransport({\n      url,\n      role: nextRole,\n      sessionKey: row.session_key,\n      sessionId: row.id,\n      clientId,\n      onConnection: (state) => {\n        localRuntimeConnectionRef.current = state\n        setLocalRuntimeConnection(state)\n        if (state === 'connected') {\n          if (roleRef.current !== 'standalone') setConnection('connected')\n          if (nextRole === 'instructor') window.setTimeout(() => publishLocalRuntimeSnapshot(), 0)\n        }\n      },\n      onEnvelope: handleLocalRuntimeEnvelope,\n    })\n    localTransportRef.current = transport\n    transport.connect()\n  }"""
new_attach = """  const attachLocalRuntime = (nextRole: 'instructor' | 'candidate', row: TeachingSessionRow) => {\n    localTransportRef.current?.disconnect()\n    localTransportRef.current = null\n    const url = getDefaultLocalRuntimeUrl()\n    setLocalRuntimeUrl(url)\n\n    const clientId = nextRole === 'instructor'\n      ? (instructorClientIdRef.current ?? crypto.randomUUID())\n      : crypto.randomUUID()\n    const callbacks = {\n      role: nextRole,\n      sessionKey: row.session_key,\n      sessionId: row.id,\n      clientId,\n      onConnection: (state: LocalRuntimeConnection) => {\n        localRuntimeConnectionRef.current = state\n        setLocalRuntimeConnection(state)\n        if (state === 'connected') {\n          if (roleRef.current !== 'standalone') setConnection('connected')\n          if (nextRole === 'instructor') window.setTimeout(() => publishLocalRuntimeSnapshot(), 0)\n        }\n      },\n      onEnvelope: handleLocalRuntimeEnvelope,\n    }\n\n    const transport = url\n      ? new LocalRuntimeTransport({ ...callbacks, url })\n      : new WebRtcRuntimeTransport(callbacks)\n    setRuntimeTransportKind(url ? getLocalRuntimeProfile() : 'webrtc')\n    localTransportRef.current = transport\n    transport.connect()\n  }"""
replace_once('src/session/useTeachingSession.ts', old_attach, new_attach)
replace_once(
    'src/session/useTeachingSession.ts',
    "    localRuntimeConnectionRef.current = 'disabled'\n    setLocalRuntimeConnection('disabled')",
    "    localRuntimeConnectionRef.current = 'disabled'\n    setLocalRuntimeConnection('disabled')\n    setRuntimeTransportKind('cloud')",
)
replace_once(
    'src/session/useTeachingSession.ts',
    "  // The LAN relay is the runtime fast path. It publishes immediately from React state,\n  // while Supabase remains the durable cloud copy and fallback transport.",
    "  // The selected runtime transport (WebRTC, PC relay, or appliance relay) is the fast path.\n  // Supabase remains the durable cloud copy and fallback transport.",
)
replace_once(
    'src/session/useTeachingSession.ts',
    "    localRuntimeConnection,\n    localRuntimeUrl,",
    "    localRuntimeConnection,\n    localRuntimeUrl,\n    runtimeTransportKind,",
)

replace_once(
    'src/components/SessionPanel.tsx',
    "import type { SessionConnection, SessionRole } from '../session/useTeachingSession'",
    "import type { RuntimeTransportKind, SessionConnection, SessionRole } from '../session/useTeachingSession'",
)
replace_once(
    'src/components/SessionPanel.tsx',
    "  localRuntimeUrl: string | null\n  session: TeachingSessionRow | null",
    "  localRuntimeUrl: string | null\n  runtimeTransportKind: RuntimeTransportKind\n  session: TeachingSessionRow | null",
)
old_badge = """function LocalRuntimeBadge({ connection, url }: { connection: LocalRuntimeConnection; url: string | null }) {\n  if (connection === 'disabled') return null\n  const label = connection === 'connected'\n    ? 'LAN live'\n    : connection === 'connecting'\n      ? 'LAN connecting…'\n      : connection === 'reconnecting'\n        ? 'LAN reconnecting…'\n        : 'LAN unavailable'\n  return <span className={`local-runtime-badge ${connection}`} title={url ?? 'Local runtime relay'}><i />{label}</span>\n}"""
new_badge = """function RuntimeTransportBadge({ connection, url, kind }: { connection: LocalRuntimeConnection; url: string | null; kind: RuntimeTransportKind }) {\n  if (connection === 'disabled' || kind === 'cloud') return null\n  const name = kind === 'webrtc' ? 'Peer-to-peer' : kind === 'appliance' ? 'EDUVENT box' : 'LAN server'\n  const label = connection === 'connected'\n    ? `${name} live`\n    : connection === 'connecting'\n      ? `${name} connecting…`\n      : connection === 'reconnecting'\n        ? `${name} reconnecting…`\n        : `${name} unavailable`\n  const title = kind === 'webrtc' ? 'Direct WebRTC DataChannel; Supabase signalling/fallback' : (url ?? 'Local runtime relay')\n  return <span className={`local-runtime-badge ${connection}`} title={title}><i />{label}</span>\n}"""
replace_once('src/components/SessionPanel.tsx', old_badge, new_badge)
replace_once(
    'src/components/SessionPanel.tsx',
    "  localRuntimeConnection,\n  localRuntimeUrl,\n  session,",
    "  localRuntimeConnection,\n  localRuntimeUrl,\n  runtimeTransportKind,\n  session,",
)
p = Path('src/components/SessionPanel.tsx')
text = p.read_text()
if text.count('<LocalRuntimeBadge connection={localRuntimeConnection} url={localRuntimeUrl} />') != 2:
    raise SystemExit('Expected two LocalRuntimeBadge usages')
text = text.replace('<LocalRuntimeBadge connection={localRuntimeConnection} url={localRuntimeUrl} />', '<RuntimeTransportBadge connection={localRuntimeConnection} url={localRuntimeUrl} kind={runtimeTransportKind} />')
p.write_text(text)

replace_once(
    'src/App.tsx',
    "            localRuntimeUrl={teachingSession.localRuntimeUrl}\n            session={teachingSession.session}",
    "            localRuntimeUrl={teachingSession.localRuntimeUrl}\n            runtimeTransportKind={teachingSession.runtimeTransportKind}\n            session={teachingSession.session}",
)
replace_once('src/appVersion.ts', "export const APP_VERSION = '0.78.6'", "export const APP_VERSION = '0.80.0'")
