from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Anchor not found: {label}')
    return text.replace(old, new, 1)


# --- App.tsx ---
app_path = Path('src/App.tsx')
app = app_path.read_text()

app = replace_once(
    app,
    "  const [oxygenBoost, setOxygenBoost] = useState(false)\n  const [nebuliser, setNebuliser] = useState(false)\n",
    "  const [oxygenBoost, setOxygenBoost] = useState(false)\n  const [oxygenBoostSecondsRemaining, setOxygenBoostSecondsRemaining] = useState(0)\n  const [nebuliser, setNebuliser] = useState(false)\n",
    'oxygen boost state',
)

app = replace_once(
    app,
    "  const alarmSilenceTimeoutRef = useRef<number | null>(null)\n  const audioContextRef = useRef<AudioContext | null>(null)\n",
    "  const alarmSilenceTimeoutRef = useRef<number | null>(null)\n  const oxygenBoostDeadlineRef = useRef<number | null>(null)\n  const audioContextRef = useRef<AudioContext | null>(null)\n",
    'oxygen deadline ref',
)

anchor = """  useEffect(() => {\n    window.localStorage.setItem(SHOW_PATIENT_EFFORT_STORAGE_KEY, String(showPatientEffort))\n  }, [showPatientEffort])\n\n  const effectiveVentilator = useMemo(() => ({ ...ventilator, fio2: oxygenBoost ? 1 : ventilator.fio2 }), [ventilator, oxygenBoost])\n"""
replacement = """  useEffect(() => {\n    window.localStorage.setItem(SHOW_PATIENT_EFFORT_STORAGE_KEY, String(showPatientEffort))\n  }, [showPatientEffort])\n\n  useEffect(() => {\n    if (!oxygenBoost) return\n\n    const updateCountdown = () => {\n      const deadline = oxygenBoostDeadlineRef.current\n      if (deadline == null) return\n      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))\n      setOxygenBoostSecondsRemaining(remaining)\n      if (remaining <= 0) {\n        oxygenBoostDeadlineRef.current = null\n        setOxygenBoost(false)\n      }\n    }\n\n    updateCountdown()\n    const interval = window.setInterval(updateCountdown, 250)\n    return () => window.clearInterval(interval)\n  }, [oxygenBoost])\n\n  const effectiveVentilator = useMemo(() => ({ ...ventilator, fio2: oxygenBoost ? 1 : ventilator.fio2 }), [ventilator, oxygenBoost])\n"""
app = replace_once(app, anchor, replacement, 'oxygen countdown effect')

anchor = """  const resetVentilator = () => setVentilator({ ...initialVentilator })\n  const resetPatient = () => setPatient({ ...initialPatient })\n  const isHoldKey = (key: string) => key === ' ' || key === 'Enter'\n"""
replacement = """  const toggleOxygenBoost = () => {\n    if (oxygenBoost) {\n      oxygenBoostDeadlineRef.current = null\n      setOxygenBoost(false)\n      setOxygenBoostSecondsRemaining(0)\n      return\n    }\n\n    oxygenBoostDeadlineRef.current = Date.now() + 60_000\n    setOxygenBoostSecondsRemaining(60)\n    setOxygenBoost(true)\n  }\n\n  const oxygenBoostTimer = `0:${String(oxygenBoostSecondsRemaining).padStart(2, '0')}`\n  const resetVentilator = () => setVentilator({ ...initialVentilator })\n  const resetPatient = () => setPatient({ ...initialPatient })\n  const isHoldKey = (key: string) => key === ' ' || key === 'Enter'\n"""
app = replace_once(app, anchor, replacement, 'oxygen toggle handler')

old_button = """            <button className={`hardware-button oxygen-button ${oxygenBoost ? 'active amber' : ''}`} onClick={() => setOxygenBoost((v) => !v)} title=\"O₂ enrichment\" aria-label=\"O₂ enrichment\">O₂</button>\n"""
new_button = """            <div className={`oxygen-enrichment-control ${oxygenBoost ? 'active' : ''}`}>\n              <button\n                className={`hardware-button oxygen-button ${oxygenBoost ? 'active amber' : ''}`}\n                onClick={toggleOxygenBoost}\n                title={oxygenBoost ? 'O₂ enrichment active at 100% — press to cancel' : 'O₂ enrichment: 100% oxygen for 1 minute'}\n                aria-label={oxygenBoost ? `O₂ enrichment active, ${oxygenBoostSecondsRemaining} seconds remaining. Press to cancel.` : 'Start O₂ enrichment at 100 percent for 1 minute'}\n              >O₂</button>\n              {oxygenBoost && <span className=\"oxygen-enrichment-timer\" aria-live=\"polite\">{oxygenBoostTimer}</span>}\n            </div>\n"""
app = replace_once(app, old_button, new_button, 'oxygen button UI')

app = replace_once(app, "appVersion: '0.77'", "appVersion: '0.77.1'", 'diagnostic version')
app = replace_once(app, '<span className="version">v0.77</span>', '<span className="version">v0.77.1</span>', 'header version')
app_path.write_text(app)


# --- Simulation engine: allow inspiratory hold on SIMV pressure-supported breaths ---
engine_path = Path('src/simulation/engine.ts')
engine = engine_path.read_text()
old_ps = """    if (cycleOff || timeLimit) {\n      finishBreath(state, t, postCycleReleaseGuard)\n      inspiration = false\n    }\n"""
new_ps = """    if (cycleOff || timeLimit) {\n      // In SIMV, a patient-triggered breath may be pressure supported rather\n      // than mandatory. An inspiratory-hold request should still occlude that\n      // assisted breath at cycle-off, just as it does for VC/PC mandatory and\n      // assist-control breaths. Pure PSV remains excluded by the UI.\n      if (inspiratoryHoldRequested && isSimv(mode)) {\n        state.inspiratoryHoldActive = true\n        inspiration = true\n        flowLs = 0\n        pressure = ventilator.peep + state.volume / complianceL - pmus\n      } else {\n        finishBreath(state, t, postCycleReleaseGuard)\n        inspiration = false\n      }\n    }\n"""
engine = replace_once(engine, old_ps, new_ps, 'SIMV pressure-supported inspiratory hold')
engine_path.write_text(engine)


# --- Version text used by session panel ---
session_path = Path('src/components/SessionPanel.tsx')
session = session_path.read_text()
session = replace_once(session, "version.textContent = 'v0.77'", "version.textContent = 'v0.77.1'", 'session panel version')
session_path.write_text(session)


# --- Timer styling below O2 control without increasing the action-row height ---
css_path = Path('src/interactive-vent-controls.css')
css = css_path.read_text()
css_anchor = """.console-top-actions .oxygen-button {\n  min-width: 52px;\n  font-size: 18px;\n}\n"""
css_replacement = css_anchor + """\n.oxygen-enrichment-control {\n  position: relative;\n  display: inline-flex;\n  align-items: flex-start;\n}\n\n.oxygen-enrichment-timer {\n  position: absolute;\n  top: calc(100% + 2px);\n  left: 50%;\n  transform: translateX(-50%);\n  min-width: 34px;\n  color: #ffbd6b;\n  font-size: 8px;\n  font-weight: 800;\n  line-height: 1;\n  letter-spacing: .04em;\n  text-align: center;\n  font-variant-numeric: tabular-nums;\n  pointer-events: none;\n}\n"""
css = replace_once(css, css_anchor, css_replacement, 'oxygen timer CSS')
css_path.write_text(css)
