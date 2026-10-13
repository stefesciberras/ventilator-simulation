from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Anchor not found: {label}')
    return text.replace(old, new, 1)


# --- Alarm type ---
alarm_types_path = Path('src/alarmTypes.ts')
alarm_types = alarm_types_path.read_text()
alarm_types = replace_once(
    alarm_types,
    "export interface AlarmLimits {\n  apneaTime: number\n  peakPressure: number\n",
    "export interface AlarmLimits {\n  pressureLimit: number\n  apneaTime: number\n  peakPressure: number\n",
    'AlarmLimits pressureLimit',
)
alarm_types_path.write_text(alarm_types)


# --- Simulation sample type ---
types_path = Path('src/simulation/types.ts')
types = types_path.read_text()
types = replace_once(
    types,
    "  simvSyncWindow?: boolean\n}\n",
    "  simvSyncWindow?: boolean\n  pressureLimitHit?: boolean\n}\n",
    'Sample pressureLimitHit',
)
types_path.write_text(types)


# --- Simulation engine ---
engine_path = Path('src/simulation/engine.ts')
engine = engine_path.read_text()
engine = replace_once(
    engine,
    "  expiratoryHoldRequestTime?: number | null\n  expiratoryHoldReleaseTime?: number | null\n}\n",
    "  expiratoryHoldRequestTime?: number | null\n  expiratoryHoldReleaseTime?: number | null\n  pressureLimit?: number | null\n}\n",
    'SimulationOptions pressureLimit',
)

old_oxygen = """function directSpO2FromAlveolarFraction(alveolarFraction: number, ventilator: VentilatorSettings, patient: PatientSettings): number {\n  // v0.61 keeps oxygenation independent from airway mechanics: shunt is an\n  // explicit patient property rather than being inferred from low compliance.\n  // Obstruction retains a small V/Q-mismatch penalty, while PEEP can recruit a\n  // fraction of shunt only when the lung is relatively non-compliant.\n  const obstructionPenalty = clamp((patient.expiratoryResistance - 8) / 32, 0, 1) * 0.018\n  const effectiveFraction = clamp(alveolarFraction - obstructionPenalty, 0.01, 0.95)\n  const halfSaturationFraction = 0.063\n  const hillExponent = 5\n  const ratio = Math.pow(halfSaturationFraction / effectiveFraction, hillExponent)\n  const ventilatedSaturation = clamp(100 / (1 + ratio), 50, 100)\n\n  const baselineShunt = clamp(patient.shuntFraction ?? 0.03, 0, 0.5)\n  const recruitability = clamp((60 - patient.compliance) / 45, 0, 1)\n  const peepRecruitment = 0.55 * recruitability * clamp((ventilator.peep - 5) / 10, 0, 1)\n  const effectiveShunt = baselineShunt * (1 - peepRecruitment)\n\n  // Mix ventilated blood with a fixed venous-like saturation to represent true\n  // right-to-left shunt. This preserves the limited response of true shunt to\n  // increasing FiO2 without introducing a PaO2 model.\n  const venousLikeSaturation = 75\n  return clamp(ventilatedSaturation * (1 - effectiveShunt) + venousLikeSaturation * effectiveShunt, 50, 100)\n}\n"""
new_oxygen = """function saturationFromOxygenTension(po2MmHg: number): number {\n  const p50 = 26.8\n  const hillExponent = 2.7\n  const po2 = Math.max(po2MmHg, 1)\n  return 100 / (1 + Math.pow(p50 / po2, hillExponent))\n}\n\nfunction oxygenContentForSaturation(saturationPercent: number): number {\n  const haemoglobin = 15\n  const oxygenCapacity = 1.34 * haemoglobin\n  const p50 = 26.8\n  const hillExponent = 2.7\n  const saturation = clamp(saturationPercent / 100, 0.5, 0.999)\n  const po2 = clamp(p50 * Math.pow(saturation / Math.max(1 - saturation, 0.001), 1 / hillExponent), 20, 650)\n  return oxygenCapacity * saturation + 0.003 * po2\n}\n\nfunction directSpO2FromAlveolarFraction(alveolarFraction: number, ventilator: VentilatorSettings, patient: PatientSettings): number {\n  // Keep oxygenation independent from airway mechanics: shunt is an explicit\n  // patient property. Obstruction retains a small V/Q-mismatch penalty, while\n  // PEEP can recruit a fraction of shunt only when the lung is relatively\n  // non-compliant.\n  const obstructionPenalty = clamp((patient.expiratoryResistance - 8) / 32, 0, 1) * 0.018\n  const effectiveFraction = clamp(alveolarFraction - obstructionPenalty, 0.01, 0.95)\n\n  // Convert the alveolar oxygen reservoir to an approximate end-capillary PO2\n  // and then to haemoglobin saturation. The previous model mixed saturations\n  // directly, which created an artificial hard SpO2 ceiling in large shunts: a\n  // rise from 35% to 100% FiO2 could become invisible once the ventilated blood\n  // was already near 100% saturation. Mixing oxygen content retains the limited\n  // response of true shunt while allowing hyperoxia in ventilated units to make\n  // an appropriate, modest contribution after blood streams mix.\n  const endCapillaryPo2 = clamp(effectiveFraction * 650, 20, 650)\n  const ventilatedSaturation = clamp(saturationFromOxygenTension(endCapillaryPo2), 50, 100)\n\n  const baselineShunt = clamp(patient.shuntFraction ?? 0.03, 0, 0.5)\n  const recruitability = clamp((60 - patient.compliance) / 45, 0, 1)\n  const peepRecruitment = 0.55 * recruitability * clamp((ventilator.peep - 5) / 10, 0, 1)\n  const effectiveShunt = baselineShunt * (1 - peepRecruitment)\n\n  const haemoglobin = 15\n  const oxygenCapacity = 1.34 * haemoglobin\n  const ventilatedContent = oxygenCapacity * (ventilatedSaturation / 100) + 0.003 * endCapillaryPo2\n  const venousLikeSaturation = 75\n  const venousLikePo2 = 40\n  const venousContent = oxygenCapacity * (venousLikeSaturation / 100) + 0.003 * venousLikePo2\n  const mixedContent = ventilatedContent * (1 - effectiveShunt) + venousContent * effectiveShunt\n\n  // Invert the content relationship numerically to obtain an equivalent mixed\n  // arterial saturation for the pulse-oximeter model.\n  let low = 50\n  let high = 100\n  for (let iteration = 0; iteration < 24; iteration += 1) {\n    const mid = (low + high) / 2\n    if (oxygenContentForSaturation(mid) < mixedContent) low = mid\n    else high = mid\n  }\n  return clamp((low + high) / 2, 50, 100)\n}\n"""
engine = replace_once(engine, old_oxygen, new_oxygen, 'oxygen content mixing model')

old_two_level = """  if (mode === 'APRV' || mode === 'BIPAP') {\n    const sample = twoLevelSample(state, ventilator, patient, t, dt, pmus, complianceL, mode)\n    updateVentilationTracking(state, sample, t, dt)\n    return sample\n  }\n"""
new_two_level = """  if (mode === 'APRV' || mode === 'BIPAP') {\n    const sample = twoLevelSample(state, ventilator, patient, t, dt, pmus, complianceL, mode)\n    const pressureLimit = options.pressureLimit == null ? null : clamp(options.pressureLimit, 5, 60)\n    if (pressureLimit != null && sample.phase === 'inspiration' && sample.pressure >= pressureLimit) {\n      sample.pressure = pressureLimit\n      sample.flow = 0\n      sample.pressureLimitHit = true\n      state.expirationStartTime = t\n      if (mode === 'BIPAP') {\n        state.bipapHigh = false\n        state.bipapPhaseStart = t\n      } else {\n        // Force APRV into its low-pressure phase on the next simulation step.\n        state.modeStartTime = t - Math.max(ventilator.tHigh, 0.1)\n      }\n    }\n    updateVentilationTracking(state, sample, t, dt)\n    return sample\n  }\n"""
engine = replace_once(engine, old_two_level, new_two_level, 'two-level pressure cutoff')

old_pre_dv = """  const dv = flowLs * dt\n  state.volume = clamp(state.volume + dv, 0, 2.5)\n"""
new_pre_dv = """  let pressureLimitHit = false\n  const pressureLimit = options.pressureLimit == null ? null : clamp(options.pressureLimit, 5, 60)\n  if (pressureLimit != null && inspiration && pressure >= pressureLimit) {\n    pressureLimitHit = true\n    pressure = pressureLimit\n    flowLs = 0\n    const activeOrHeldBreath = state.breathActive || state.inspiratoryHoldActive\n    state.inspiratoryHoldActive = false\n    if (activeOrHeldBreath) finishBreath(state, t, postCycleReleaseGuard)\n  }\n\n  const dv = flowLs * dt\n  state.volume = clamp(state.volume + dv, 0, 2.5)\n"""
engine = replace_once(engine, old_pre_dv, new_pre_dv, 'conventional pressure cutoff')

engine = replace_once(
    engine,
    "    simvSyncWindow: simvSyncWindowActive,\n  }\n",
    "    simvSyncWindow: simvSyncWindowActive,\n    pressureLimitHit,\n  }\n",
    'sample pressure limit marker',
)
engine_path.write_text(engine)


# --- Side-panel ventilator control ---
controls_path = Path('src/components/Controls.tsx')
controls = controls_path.read_text()
controls = replace_once(
    controls,
    "  onChange: (value: number) => void\n  disabled?: boolean\n}\n",
    "  onChange: (value: number) => void\n  disabled?: boolean\n  className?: string\n}\n",
    'Slider className prop',
)
controls = replace_once(
    controls,
    "function Slider({ label, value, unit, min, max, step = 1, displayValue, onChange, disabled = false }: SliderProps) {\n  return (\n    <label className={`control-row ${disabled ? 'disabled' : ''}`}>\n",
    "function Slider({ label, value, unit, min, max, step = 1, displayValue, onChange, disabled = false, className = '' }: SliderProps) {\n  return (\n    <label className={`control-row ${disabled ? 'disabled' : ''} ${className}`.trim()}>\n",
    'Slider className rendering',
)
controls = replace_once(
    controls,
    "export function VentilatorControls({ settings, onChange, onReset }: { settings: VentilatorSettings; onChange: (next: VentilatorSettings) => void; onReset: () => void }) {\n",
    "export function VentilatorControls({ settings, onChange, onReset, fio2Override, fio2BoostActive = false }: { settings: VentilatorSettings; onChange: (next: VentilatorSettings) => void; onReset: () => void; fio2Override?: number; fio2BoostActive?: boolean }) {\n",
    'VentilatorControls oxygen override props',
)
controls = replace_once(
    controls,
    "      <Slider label=\"FiO₂\" value={Math.round(settings.fio2 * 100)} unit=\"%\" min={21} max={100} onChange={(v) => patch({ fio2: v / 100 })} />\n",
    "      <Slider label=\"FiO₂\" value={Math.round((fio2Override ?? settings.fio2) * 100)} unit=\"%\" min={21} max={100} disabled={fio2BoostActive} className={fio2BoostActive ? 'oxygen-boosted-control' : ''} onChange={(v) => patch({ fio2: v / 100 })} />\n",
    'FiO2 boosted control',
)
controls_path.write_text(controls)


# --- Interactive ventilator strip ---
strip_path = Path('src/components/InteractiveVentilatorStrip.tsx')
strip = strip_path.read_text()
strip = replace_once(
    strip,
    "  onChange: (next: VentilatorSettings) => void\n  disabled?: boolean\n}\n",
    "  onChange: (next: VentilatorSettings) => void\n  disabled?: boolean\n  fio2Override?: number\n  fio2BoostActive?: boolean\n}\n",
    'interactive strip oxygen props',
)
strip = replace_once(
    strip,
    "export function InteractiveVentilatorStrip({ settings, onChange, disabled = false }: InteractiveVentilatorStripProps) {\n",
    "export function InteractiveVentilatorStrip({ settings, onChange, disabled = false, fio2Override, fio2BoostActive = false }: InteractiveVentilatorStripProps) {\n",
    'interactive strip function props',
)
strip = replace_once(
    strip,
    "    const specs: ControlSpec[] = [\n      { key: 'fio2', label: 'FiO₂', value: Math.round(settings.fio2 * 100), display: `${Math.round(settings.fio2 * 100)}%`, min: 21, max: 100, step: 1 },\n    ]\n",
    "    const displayedFio2 = Math.round((fio2Override ?? settings.fio2) * 100)\n    const specs: ControlSpec[] = [\n      { key: 'fio2', label: 'FiO₂', value: displayedFio2, display: `${displayedFio2}%`, min: 21, max: 100, step: 1 },\n    ]\n",
    'interactive FiO2 override display',
)
strip = replace_once(
    strip,
    "  }, [settings, currentIeRatio])\n",
    "  }, [settings, currentIeRatio, fio2Override])\n",
    'interactive controls memo dependency',
)
strip = replace_once(
    strip,
    "  useEffect(() => {\n    if (activeKey && !controls.some((control) => control.key === activeKey)) setActiveKey(null)\n  }, [activeKey, controls])\n\n  const selectControl = (key: SettingKey) => {\n    if (disabled) return\n",
    "  useEffect(() => {\n    if (activeKey && !controls.some((control) => control.key === activeKey)) setActiveKey(null)\n    if (fio2BoostActive && activeKey === 'fio2') setActiveKey(null)\n  }, [activeKey, controls, fio2BoostActive])\n\n  const selectControl = (key: SettingKey) => {\n    if (disabled || (fio2BoostActive && key === 'fio2')) return\n",
    'interactive boost selection lock',
)
strip = replace_once(
    strip,
    "  const applyValue = (key: SettingKey, rawValue: number) => {\n    const value = Number(rawValue)\n",
    "  const applyValue = (key: SettingKey, rawValue: number) => {\n    if (fio2BoostActive && key === 'fio2') return\n    const value = Number(rawValue)\n",
    'interactive boost apply lock',
)
strip = replace_once(
    strip,
    "            className={`interactive-setting-button ${activeKey === control.key ? 'active' : ''}`}\n            disabled={disabled}\n            onClick={() => selectControl(control.key)}\n            aria-pressed={activeKey === control.key}\n            title={disabled ? 'Ventilator settings controlled by instructor' : `Adjust ${control.label}`}\n",
    "            className={`interactive-setting-button ${activeKey === control.key ? 'active' : ''} ${fio2BoostActive && control.key === 'fio2' ? 'oxygen-boosted' : ''}`.trim()}\n            disabled={disabled || (fio2BoostActive && control.key === 'fio2')}\n            onClick={() => selectControl(control.key)}\n            aria-pressed={activeKey === control.key}\n            title={disabled ? 'Ventilator settings controlled by instructor' : fio2BoostActive && control.key === 'fio2' ? 'O₂ enrichment temporarily overrides FiO₂ to 100%' : `Adjust ${control.label}`}\n",
    'interactive FiO2 boosted style',
)
strip_path.write_text(strip)


# --- Main App ---
app_path = Path('src/App.tsx')
app = app_path.read_text()
app = replace_once(
    app,
    "const initialAlarmLimits: AlarmLimits = {\n  apneaTime: 30,\n  peakPressure: 40,\n",
    "const initialAlarmLimits: AlarmLimits = {\n  pressureLimit: 60,\n  apneaTime: 30,\n  peakPressure: 40,\n",
    'initial pressure limit',
)
app = replace_once(
    app,
    "    const co2Min = Math.max(0, Math.min(100, stored.co2Min))\n",
    "    const pressureLimit = Math.max(5, Math.min(60, stored.pressureLimit ?? initialAlarmLimits.pressureLimit))\n    const peakPressure = Math.max(0, Math.min(pressureLimit, stored.peakPressure))\n    const co2Min = Math.max(0, Math.min(100, stored.co2Min))\n",
    'stored pressure limit normalisation',
)
app = replace_once(
    app,
    "    return {\n      apneaTime: Math.max(15, Math.min(120, stored.apneaTime)),\n      peakPressure: Math.max(0, Math.min(60, stored.peakPressure)),\n",
    "    return {\n      pressureLimit,\n      apneaTime: Math.max(15, Math.min(120, stored.apneaTime)),\n      peakPressure,\n",
    'stored alarm return pressure limit',
)
app = replace_once(
    app,
    "    apnea: null,\n    pressure: null,\n",
    "    apnea: null,\n    pressureLimit: null,\n    pressure: null,\n",
    'pressure limit alarm onset',
)
app = replace_once(
    app,
    "    expiratoryHoldRequestTime,\n    expiratoryHoldReleaseTime,\n  }), [inspiratoryHoldRequestTime, inspiratoryHoldReleaseTime, expiratoryHoldRequestTime, expiratoryHoldReleaseTime])\n",
    "    expiratoryHoldRequestTime,\n    expiratoryHoldReleaseTime,\n    pressureLimit: alarmLimits.pressureLimit,\n  }), [inspiratoryHoldRequestTime, inspiratoryHoldReleaseTime, expiratoryHoldRequestTime, expiratoryHoldReleaseTime, alarmLimits.pressureLimit])\n",
    'simulation pressure limit option',
)
app = replace_once(
    app,
    "  const pressureAlarmActive = useMemo(\n    () => isHighPressureAlarmActive(timeline, alarmLimits.peakPressure),\n    [timeline, alarmLimits.peakPressure],\n  )\n",
    "  const pressureLimitAlarmActive = useMemo(\n    () => measurementSamples.some((sample) => sample.pressureLimitHit && currentSimulationTime - sample.time <= 5),\n    [measurementSamples, currentSimulationTime],\n  )\n  const pressureAlarmActive = useMemo(\n    () => isHighPressureAlarmActive(timeline, alarmLimits.peakPressure),\n    [timeline, alarmLimits.peakPressure],\n  )\n",
    'pressure limit alarm activity',
)
app = replace_once(
    app,
    "  const alarmConditions = {\n    apnea: apneaAlarmActive,\n    pressure: !suppressSecondaryAlarmsForApnea && pressureAlarmActive,\n",
    "  const alarmConditions = {\n    apnea: apneaAlarmActive,\n    pressureLimit: pressureLimitAlarmActive,\n    pressure: !suppressSecondaryAlarmsForApnea && pressureAlarmActive,\n",
    'pressure limit alarm condition',
)
app = replace_once(
    app,
    "    apneaAlarmActive,\n    pressureAlarmActive,\n",
    "    apneaAlarmActive,\n    pressureLimitAlarmActive,\n    pressureAlarmActive,\n",
    'pressure limit alarm dependency',
)
app = replace_once(
    app,
    "  const criticalAlarmKeys = ['pressure', 'apnea', 'oxygenFailure'] as const\n  const alarmVisibleDuringApnea = (key: string) => !apneaAlarmActive || key === 'apnea' || key === 'oxygenFailure'\n",
    "  const criticalAlarmKeys = ['pressureLimit', 'pressure', 'apnea', 'oxygenFailure'] as const\n  const alarmVisibleDuringApnea = (key: string) => !apneaAlarmActive || key === 'apnea' || key === 'pressureLimit' || key === 'oxygenFailure'\n",
    'critical pressure limit key',
)
app = replace_once(
    app,
    "  const criticalEscalated = criticalAlarmKeys.some((key) => {\n    const entry = alarmLifecycle[key]\n    return Boolean(alarmConditions[key] && entry?.activeSince != null && alarmClock - entry.activeSince >= 15000)\n  })\n",
    "  const criticalEscalated = pressureLimitAlarmActive || criticalAlarmKeys.some((key) => {\n    const entry = alarmLifecycle[key]\n    return Boolean(alarmConditions[key] && entry?.activeSince != null && alarmClock - entry.activeSince >= 15000)\n  })\n",
    'immediate critical pressure limit alarm',
)
app = replace_once(
    app,
    "  const alarmLabels = [\n    visibleAlarmKeys.has('pressure') ? 'HIGH PRESSURE' : null,\n",
    "  const alarmLabels = [\n    visibleAlarmKeys.has('pressureLimit') ? 'PRESSURE LIMIT' : null,\n    visibleAlarmKeys.has('pressure') ? 'HIGH PRESSURE' : null,\n",
    'pressure limit alarm label',
)
app = replace_once(
    app,
    "    const alarmEvaluations = [\n      { key: 'pressure', label: 'Peak pressure', priority: 'critical', value: eventMeasures.peakPressure, unit: 'cmH2O', limits: { high: alarmLimits.peakPressure }, active: pressureAlarmActive, history: historyFor('pressure') },\n",
    "    const alarmEvaluations = [\n      { key: 'pressureLimit', label: 'Pressure limitation', priority: 'critical', value: eventMeasures.peakPressure, unit: 'cmH2O', limits: { high: alarmLimits.pressureLimit }, active: pressureLimitAlarmActive, history: historyFor('pressureLimit') },\n      { key: 'pressure', label: 'Peak pressure', priority: 'critical', value: eventMeasures.peakPressure, unit: 'cmH2O', limits: { high: alarmLimits.peakPressure }, active: pressureAlarmActive, history: historyFor('pressure') },\n",
    'pressure limit diagnostic evaluation',
)
app = replace_once(app, "      appVersion: '0.77.1',", "      appVersion: '0.77.2',", 'diagnostic version')
app = replace_once(
    app,
    "        apneaActive: apneaAlarmActive,\n        highPressureActive: pressureAlarmActive,\n",
    "        apneaActive: apneaAlarmActive,\n        pressureLimitActive: pressureLimitAlarmActive,\n        highPressureActive: pressureAlarmActive,\n",
    'diagnostic pressure limit active',
)
app = replace_once(app, '<span className="version">v0.77.1</span>', '<span className="version">v0.77.2</span>', 'header version')

old_alarm_cards = """                  <div className=\"alarm-slider-grid five-alarm-grid\">\n                    <label className=\"alarm-slider-card critical-alarm-card\">\n                      <span>Peak pressure</span>\n                      <small className=\"alarm-priority\">Critical</small>\n                      <strong>{alarmLimits.peakPressure} <small>cmH₂O</small></strong>\n                      <div className=\"vertical-slider-wrap\">\n                        <em>60</em>\n                        <input className=\"vertical-alarm-slider\" type=\"range\" min=\"0\" max=\"60\" step=\"1\" value={alarmLimits.peakPressure} onChange={(event) => setAlarmLimits((current) => ({ ...current, peakPressure: Number(event.target.value) }))} />\n                        <em>0</em>\n                      </div>\n                    </label>\n"""
new_alarm_cards = """                  <div className=\"alarm-slider-grid six-alarm-grid\">\n                    <label className=\"alarm-slider-card critical-alarm-card pressure-limit-card\">\n                      <span>Pressure limitation</span>\n                      <small className=\"alarm-priority\">Critical safety limit</small>\n                      <strong>{alarmLimits.pressureLimit} <small>cmH₂O</small></strong>\n                      <div className=\"vertical-slider-wrap\">\n                        <em>60</em>\n                        <input className=\"vertical-alarm-slider\" type=\"range\" min=\"5\" max=\"60\" step=\"1\" value={alarmLimits.pressureLimit} onChange={(event) => {\n                          const pressureLimit = Number(event.target.value)\n                          setAlarmLimits((current) => ({ ...current, pressureLimit, peakPressure: Math.min(current.peakPressure, pressureLimit) }))\n                        }} />\n                        <em>5</em>\n                      </div>\n                    </label>\n                    <label className=\"alarm-slider-card critical-alarm-card\">\n                      <span>Peak pressure</span>\n                      <small className=\"alarm-priority\">Critical</small>\n                      <strong>{alarmLimits.peakPressure} <small>cmH₂O</small></strong>\n                      <div className=\"vertical-slider-wrap\">\n                        <em>{alarmLimits.pressureLimit}</em>\n                        <input className=\"vertical-alarm-slider\" type=\"range\" min=\"0\" max={alarmLimits.pressureLimit} step=\"1\" value={alarmLimits.peakPressure} onChange={(event) => setAlarmLimits((current) => ({ ...current, peakPressure: Math.min(Number(event.target.value), current.pressureLimit) }))} />\n                        <em>0</em>\n                      </div>\n                    </label>\n"""
app = replace_once(app, old_alarm_cards, new_alarm_cards, 'pressure limitation alarm card')

app = replace_once(
    app,
    "          <InteractiveVentilatorStrip\n            settings={ventilator}\n            onChange={setVentilator}\n            disabled={teachingSession.candidateVentilatorLocked}\n          />\n",
    "          <InteractiveVentilatorStrip\n            settings={ventilator}\n            onChange={setVentilator}\n            disabled={teachingSession.candidateVentilatorLocked}\n            fio2Override={effectiveVentilator.fio2}\n            fio2BoostActive={oxygenBoost}\n          />\n",
    'interactive strip oxygen linkage',
)
app = replace_once(
    app,
    "            <VentilatorControls settings={ventilator} onChange={setVentilator} onReset={resetVentilator} />\n",
    "            <VentilatorControls settings={ventilator} onChange={setVentilator} onReset={resetVentilator} fio2Override={effectiveVentilator.fio2} fio2BoostActive={oxygenBoost} />\n",
    'side FiO2 oxygen linkage',
)
app_path.write_text(app)


# --- Styles ---
styles_path = Path('src/styles.css')
styles = styles_path.read_text()
styles = replace_once(
    styles,
    ".control-row.disabled input[type=\"range\"] { cursor: not-allowed; filter: grayscale(1); }\n",
    ".control-row.disabled input[type=\"range\"] { cursor: not-allowed; filter: grayscale(1); }\n.oxygen-boosted-control, .oxygen-boosted-control.disabled { margin: 8px -7px; padding: 8px 7px; border: 1px solid #e8b94e; border-radius: 8px; background: linear-gradient(#40351c,#2a2214); opacity: 1; }\n.oxygen-boosted-control .control-heading span, .oxygen-boosted-control .control-heading strong { color: #ffe291; }\n.oxygen-boosted-control input[type=\"range\"] { accent-color: #e8b94e; filter: none !important; }\n",
    'boosted FiO2 side control CSS',
)
styles_path.write_text(styles)

interactive_css_path = Path('src/interactive-vent-controls.css')
interactive_css = interactive_css_path.read_text()
interactive_css = replace_once(
    interactive_css,
    ".interactive-setting-button.active > span,\n.interactive-setting-button.active > strong {\n  color: #ffb15f;\n}\n",
    ".interactive-setting-button.active > span,\n.interactive-setting-button.active > strong {\n  color: #ffb15f;\n}\n\n.interactive-setting-button.oxygen-boosted,\n.interactive-setting-button.oxygen-boosted:disabled {\n  opacity: 1;\n  border-color: #e8b94e;\n  background: linear-gradient(#40351c,#2a2214);\n  box-shadow: inset 0 0 0 1px rgba(232,185,78,.16);\n}\n.interactive-setting-button.oxygen-boosted > span,\n.interactive-setting-button.oxygen-boosted > strong { color: #ffe291; }\n",
    'interactive FiO2 boost CSS',
)
interactive_css = replace_once(
    interactive_css,
    "  font-size: 8px;\n  font-weight: 800;\n",
    "  font-size: 10px;\n  font-weight: 800;\n",
    'larger oxygen countdown',
)
interactive_css = replace_once(
    interactive_css,
    ".oxygen-enrichment-control {\n  position: relative;\n  display: inline-flex;\n  align-items: flex-start;\n}\n",
    ".oxygen-enrichment-control {\n  position: relative;\n  display: inline-flex;\n  align-items: flex-start;\n}\n\n.oxygen-button.active.amber {\n  border-color: #e8b94e;\n  color: #ffe291;\n  background: linear-gradient(#40351c,#2a2214);\n}\n",
    'oxygen active amber styling',
)
interactive_css_path.write_text(interactive_css)

alarm_css_path = Path('src/alarm.css')
alarm_css = alarm_css_path.read_text()
alarm_css = replace_once(alarm_css, ".alarm-dialog { width: min(760px, 98%);", ".alarm-dialog { width: min(900px, 98%);", 'wider alarm dialog')
alarm_css = replace_once(alarm_css, ".alarm-slider-grid { display: grid; grid-template-columns: repeat(5,minmax(110px,1fr));", ".alarm-slider-grid { display: grid; grid-template-columns: repeat(6,minmax(110px,1fr));", 'six alarm columns')
alarm_css = replace_once(alarm_css, ".alarm-slider-grid { grid-template-columns: repeat(5,110px); }", ".alarm-slider-grid { grid-template-columns: repeat(6,110px); }", 'six mobile alarm columns')
alarm_css_path.write_text(alarm_css)


# --- Session panel version ---
session_path = Path('src/components/SessionPanel.tsx')
session = session_path.read_text()
session = replace_once(session, "version.textContent = 'v0.77.1'", "version.textContent = 'v0.77.2'", 'session panel version')
session_path.write_text(session)
