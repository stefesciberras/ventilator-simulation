from pathlib import Path
import re

# This script is intentionally cleanup-only and idempotent. The v0.82.9.0
# feature code is already present on the branch; this normalizes duplicate
# insertions created by overlapping verification runs.

# App.tsx
path = Path('src/App.tsx')
text = path.read_text()
text = re.sub(r"(?:import \{ useScreenWakeLock \} from './useScreenWakeLock'\n)+", "import { useScreenWakeLock } from './useScreenWakeLock'\n", text)
text = re.sub(r"(?:  const screenWakeLock = useScreenWakeLock\(\)\n)+", "  const screenWakeLock = useScreenWakeLock()\n", text)

candidate_block = """  const candidateControlsVisible = teachingSession.role !== 'candidate' || teachingSession.session?.candidate_controls_visible !== false\n\n  useEffect(() => {\n    if (!candidateControlsVisible && mobileWorkspacePage === 'settings') setMobileWorkspacePage('ventilator')\n  }, [candidateControlsVisible, mobileWorkspacePage])\n\n"""
text = re.sub(r"(?:" + re.escape(candidate_block) + r")+", candidate_block, text)

wake_block = """            <label className=\"about-wake-row\">\n              <span><strong>Keep screen awake</strong><small>{screenWakeLock.supported ? (screenWakeLock.active ? 'Active' : 'Enabled when the browser permits it') : 'Not supported by this browser'}</small></span>\n              <input type=\"checkbox\" checked={screenWakeLock.enabled} disabled={!screenWakeLock.supported} onChange={(event) => screenWakeLock.setEnabled(event.target.checked)} />\n            </label>\n"""
text = re.sub(r"(?:" + re.escape(wake_block) + r")+", wake_block, text)

text = text.replace("window.matchMedia('(min-width: 1101px)')", "window.matchMedia('(min-width: 1181px)')")
text = text.replace("<span className=\"hold-label-desktop\">Insp Hold</span><span className=\"hold-label-mobile\">Insp <PauseIcon paused={false} /></span>", "<span className=\"hold-label-two-line\"><span>Insp</span><span>Hold</span></span>")
text = text.replace("<span className=\"hold-label-desktop\">Exp Hold</span><span className=\"hold-label-mobile\">Exp <PauseIcon paused={false} /></span>", "<span className=\"hold-label-two-line\"><span>Exp</span><span>Hold</span></span>")
path.write_text(text)

# SessionPanel.tsx
path = Path('src/components/SessionPanel.tsx')
text = path.read_text()
controls_toggle = """                <label className=\"session-switch-row session-switch-row-emphasis\">\n                  <span>Show Controls view to candidate</span>\n                  <input type=\"checkbox\" checked={session?.candidate_controls_visible !== false} onChange={(event) => void onUpdatePolicy({ candidateControlsVisible: event.target.checked })} />\n                </label>\n"""
text = re.sub(r"(?:" + re.escape(controls_toggle) + r")+", controls_toggle, text)
text = text.replace("const name = kind === 'webrtc' ? 'Peer-to-peer' : kind === 'appliance' ? 'EDUVENT box' : 'LAN server'", "const name = kind === 'webrtc' ? 'P2P' : kind === 'appliance' ? 'EDUVENT box' : 'LAN server'")
path.write_text(text)

# TeachingLaserPointer.tsx
path = Path('src/teaching/TeachingLaserPointer.tsx')
text = path.read_text()
text = re.sub(r"(?:type TeachingLaserRegion = 'display' \| 'waveforms' \| 'metrics'\n\n)+", "type TeachingLaserRegion = 'display' | 'waveforms' | 'metrics'\n\n", text)
text = re.sub(r"(?:  region\?: TeachingLaserRegion\n)+", "  region?: TeachingLaserRegion\n", text)
validation = "    && (candidate.region == null || candidate.region === 'display' || candidate.region === 'waveforms' || candidate.region === 'metrics')\n"
text = re.sub(r"(?:" + re.escape(validation) + r")+", validation, text)
surface_pair = "  const surfaceRef = useRef<HTMLDivElement | null>(null)\n  const [, setLayoutRevision] = useState(0)\n"
text = re.sub(r"(?:" + re.escape(surface_pair) + r")+", surface_pair, text)
resize_effect = """  useEffect(() => {\n    const onResize = () => setLayoutRevision((value) => value + 1)\n    window.addEventListener('resize', onResize)\n    window.addEventListener('orientationchange', onResize)\n    return () => {\n      window.removeEventListener('resize', onResize)\n      window.removeEventListener('orientationchange', onResize)\n    }\n  }, [])\n\n"""
text = re.sub(r"(?:" + re.escape(resize_effect) + r")+", resize_effect, text)
path.write_text(text)

# Ensure the tablet breakpoint and two-line hold styling are present.
path = Path('src/styles.css')
text = path.read_text().replace('@media (orientation: landscape) and (min-width: 681px) and (max-width: 1100px) {', '@media (min-width: 681px) and (max-width: 1180px) {')
if '.hold-label-two-line' not in text:
    text += '\n.hold-label-two-line { display:grid; justify-items:center; line-height:1.02; gap:1px; }\n'
path.write_text(text)

path = Path('src/instructor.css')
text = path.read_text().replace('@media (min-width: 1101px) {', '@media (min-width: 1181px) {').replace('@media (min-width: 681px) and (max-width: 1100px) {', '@media (min-width: 681px) and (max-width: 1180px) {')
path.write_text(text)
