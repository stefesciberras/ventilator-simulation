import fs from 'node:fs'

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing target: ${label}`)
  return text.replace(from, to)
}

fs.writeFileSync('src/appVersion.ts', "export const APP_VERSION = '0.83.0.1'\n")
fs.writeFileSync('src/edumon/appVersion.ts', "export const EDUMON_APP_VERSION = '0.1.0.1'\n")

{
  const path = 'src/edumon/EdumonTopBar.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text, "import { SimulationTopBar, type SharedSimulationSpeed } from '../components/SimulationTopBar'\n", "import { SimulationTopBar, type SharedSimulationSpeed } from '../components/SimulationTopBar'\nimport { EDUMON_APP_VERSION } from './appVersion'\n", 'EDUMON version import')
  text = text.replace('version="0.1.0.0"', 'version={EDUMON_APP_VERSION}')
  fs.writeFileSync(path, text)
}

{
  const path = 'src/edumon/EdumonApp.tsx'
  let text = fs.readFileSync(path, 'utf8')
  const firstImport = "import { useEffect, useMemo, useRef, useState } from 'react'\n"
  if (text.includes(firstImport) && !text.includes("./appVersion'")) text = text.replace(firstImport, firstImport + "import { EDUMON_APP_VERSION } from './appVersion'\n")
  text = replaceOnce(text, "import { generateMonitorSamples, measurementsFor } from './monitorEngine'\n", "import { generateMonitorSamples, measurementsFor, RHYTHM_LABELS } from './monitorEngine'\n", 'EDUMON rhythm labels import')
  text = text.replace(/version="0\.1\.0\.0"/g, 'version={EDUMON_APP_VERSION}')
  fs.writeFileSync(path, text)
}

{
  const path = 'src/teaching/session/SharedSessionModePanel.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text, "import { useEffect, useRef, useState } from 'react'\n", "import { useEffect, useRef, useState } from 'react'\nimport type { ReactNode } from 'react'\n", 'ReactNode import')
  const marker = 'interface SharedBasicSessionPanelProps extends SharedSessionLauncherProps {'
  const wizard = `export interface SharedInstructorStartOption {\n  id: string\n  title: string\n  summary?: string\n  chips?: readonly string[]\n}\n\nexport interface SharedInstructorStartConfig {\n  currentTitle: string\n  currentSummary: string\n  currentChips?: readonly string[]\n  savedOptions?: readonly SharedInstructorStartOption[]\n  selectedSavedId?: string\n  onSelectedSavedIdChange?: (id: string) => void\n  savedBusy?: boolean\n  savedMessage?: string | null\n  onStartCurrent: () => void | Promise<unknown>\n  onStartSaved?: (id: string) => void | Promise<unknown>\n  onLoadSaved?: (id: string) => void | Promise<unknown>\n}\n\nexport function SharedInstructorStartWizard({ config, onClose }: { config: SharedInstructorStartConfig; onClose: () => void }) {\n  const [source, setSource] = useState<'current' | 'scenario'>('current')\n  const savedOptions = config.savedOptions ?? []\n  const selectedSavedId = config.selectedSavedId ?? savedOptions[0]?.id ?? ''\n  const selected = savedOptions.find((option) => option.id === selectedSavedId) ?? null\n  return (\n    <div className=\"session-start-wizard\">\n      <div className=\"session-start-wizard-heading\"><div><span>Instructor session</span><strong>Choose starting state</strong></div><button type=\"button\" className=\"session-start-close\" onClick={onClose} aria-label=\"Close session setup\">×</button></div>\n      <div className=\"session-start-source-tabs\" role=\"tablist\" aria-label=\"Instructor session starting state\">\n        <button type=\"button\" className={source === 'current' ? 'selected' : ''} onClick={() => setSource('current')}>Current setup</button>\n        <button type=\"button\" className={source === 'scenario' ? 'selected' : ''} disabled={config.savedBusy || !savedOptions.length} onClick={() => setSource('scenario')}>Saved scenario</button>\n      </div>\n      {source === 'current' ? <div className=\"session-start-current-card\"><span>Current standalone setup</span><strong>{config.currentTitle}</strong>{config.currentChips?.length ? <div className=\"session-start-summary-chips\">{config.currentChips.map((item) => <em key={item}>{item}</em>)}</div> : null}<small>{config.currentSummary}</small></div> : <div className=\"session-start-scenarios\"><div className=\"session-start-scenario-list\">{savedOptions.map((option) => <button type=\"button\" key={option.id} className={\`session-start-scenario-option \${selectedSavedId === option.id ? 'selected' : ''}\`} onClick={() => config.onSelectedSavedIdChange?.(option.id)}><strong>{option.title}</strong>{option.summary && <small>{option.summary}</small>}{option.chips?.length ? <div className=\"session-start-summary-chips\">{option.chips.map((item) => <em key={item}>{item}</em>)}</div> : null}</button>)}</div>{selected && config.onLoadSaved && <button type=\"button\" className=\"session-secondary-button\" onClick={() => void config.onLoadSaved?.(selected.id)}>Load into standalone first</button>}</div>}\n      {config.savedMessage && <p className=\"session-start-note\">{config.savedMessage}</p>}\n      <button type=\"button\" className=\"session-primary-button session-start-primary\" disabled={source === 'scenario' && !selected} onClick={() => void (source === 'current' ? config.onStartCurrent() : selected && config.onStartSaved?.(selected.id))}>{source === 'current' ? 'Start with current setup' : 'Start with saved scenario'}</button>\n      <button type=\"button\" className=\"session-secondary-button session-start-cancel\" onClick={onClose}>Cancel</button>\n    </div>\n  )\n}\n\n`
  text = replaceOnce(text, marker, wizard + marker, 'wizard insertion')
  text = text.replace('  title?: string\n}', '  title?: string\n  instructorStart?: SharedInstructorStartConfig\n  footer?: ReactNode\n}')
  text = text.replace("  title = 'Session mode',\n  ...launcherProps\n}: SharedBasicSessionPanelProps) {\n  const candidateCount", "  title = 'Session mode',\n  instructorStart,\n  footer,\n  ...launcherProps\n}: SharedBasicSessionPanelProps) {\n  const [startWizardOpen, setStartWizardOpen] = useState(false)\n  const candidateCount")
  text = replaceOnce(text, "      {role === 'standalone' ? (\n        <SharedSessionLauncher connection={connection} {...launcherProps} />\n      ) : (", "      {role === 'standalone' ? (\n        startWizardOpen && instructorStart ? <SharedInstructorStartWizard config={instructorStart} onClose={() => setStartWizardOpen(false)} /> : <SharedSessionLauncher connection={connection} {...launcherProps} onStartInstructor={instructorStart ? () => setStartWizardOpen(true) : launcherProps.onStartInstructor} />\n      ) : (", 'basic panel wizard')
  text = text.replace('      )}\n    </section>\n  )\n}', '      )}\n      {footer}\n    </section>\n  )\n}')
  fs.writeFileSync(path, text)
}

{
  const path = 'src/components/SessionPanel.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text, "import { SharedSessionLauncher } from '../teaching/session'", "import { SharedInstructorStartWizard, SharedSessionLauncher } from '../teaching/session'", 'EDUVENT wizard import')
  text = text.replace("  const [startSource, setStartSource] = useState<'current' | 'scenario'>('current')\n", '')
  text = text.replace(/    setStartSource\('current'\)\n/g, '')
  const fnStart = text.indexOf('  const startInstructorFromWizard = async () => {')
  const nextFn = text.indexOf('  const loadSelectedScenarioIntoStandalone = () => {', fnStart)
  if (fnStart >= 0 && nextFn >= 0) text = text.slice(0, fnStart) + text.slice(nextFn)
  const wizardStart = text.indexOf('        {startWizardOpen ? (\n          <div className="session-start-wizard">')
  const wizardEndMarker = '        ) : (\n          <SharedSessionLauncher'
  const wizardEnd = text.indexOf(wizardEndMarker, wizardStart)
  if (wizardStart < 0 || wizardEnd < 0) throw new Error('EDUVENT wizard JSX not found')
  const replacement = `        {startWizardOpen ? (\n          <SharedInstructorStartWizard config={{ currentTitle: \`${'${currentScenario.ventilator.mode}'} · FiO₂ ${'${Math.round(currentScenario.ventilator.fio2 * 100)}'}% · PEEP ${'${currentScenario.ventilator.peep}'}\`, currentSummary: 'Configure the patient and ventilator in standalone mode before opening the room.', currentChips: summaryFor(currentScenario), savedOptions: startPresets.map((preset) => ({ id: preset.id, title: preset.name, summary: summaryFor(preset.scenario).slice(0, 3).join(' · '), chips: summaryFor(preset.scenario) })), selectedSavedId: selectedStartPresetId, onSelectedSavedIdChange: setSelectedStartPresetId, savedBusy: startPresetsBusy, savedMessage: startPresetMessage, onStartCurrent: () => onStartInstructor(), onStartSaved: async (id) => { const preset = startPresets.find((item) => item.id === id); if (preset) await onStartInstructor(preset.scenario) }, onLoadSaved: (id) => { const preset = startPresets.find((item) => item.id === id); if (preset) { onLoadScenario(preset.scenario); setStartWizardOpen(false) } } }} onClose={() => setStartWizardOpen(false)} />\n`
  text = text.slice(0, wizardStart) + replacement + text.slice(wizardEnd)
  fs.writeFileSync(path, text)
}

{
  const path = 'src/edumon/EdumonApp.tsx'
  let text = fs.readFileSync(path, 'utf8')
  const old = `      onEndInstructorSession={teachingSession.endInstructorSession}\n    />`
  const next = `      onEndInstructorSession={teachingSession.endInstructorSession}\n      instructorStart={{ currentTitle: \`${'${RHYTHM_LABELS[patientState.rhythm]}'} · HR ${'${patientState.heartRate}'} · ${'${patientState.systolicPressure}'}/${'${patientState.diastolicPressure}'} · SpO₂ ${'${patientState.spo2}'}%\`, currentSummary: 'Configure the patient monitor in standalone mode before opening the room.', currentChips: [RHYTHM_LABELS[patientState.rhythm], \`HR ${'${patientState.heartRate}'}\`, \`MAP ${'${measurements.meanPressure ?? "—"}'}\`, \`SpO₂ ${'${patientState.spo2}'}%\`], savedMessage: 'Saved EDUMON scenarios will appear here once product-aware scenario persistence is enabled.', onStartCurrent: teachingSession.startInstructor }}\n    />`
  text = replaceOnce(text, old, next, 'EDUMON start config')
  fs.writeFileSync(path, text)
}

console.log('Shared session mode and version bumps applied.')
