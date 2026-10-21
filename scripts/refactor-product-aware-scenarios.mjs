import fs from 'node:fs'

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing target: ${label}`)
  return text.replace(from, to)
}

// EDUVENT preset APIs remain backwards-compatible, but are explicitly scoped
// to the EDUVENT product so EDUMON scenario rows never leak into them.
{
  const path = 'src/instructorAccount.ts'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text, "import { createBranchId, createStageId } from './scenario-builder/ids'\n", "import { createBranchId, createStageId } from './scenario-builder/ids'\nimport type { ScenarioProductId } from './teaching/scenario/products'\n", 'scenario product import')
  text = replaceOnce(text, "export interface InstructorPresetRow {\n  id: string\n  instructor_id: string\n  name: string\n", "export interface InstructorPresetRow {\n  id: string\n  instructor_id: string\n  product: ScenarioProductId\n  name: string\n", 'preset product field')
  text = replaceOnce(text, "function normalisePreset(row: InstructorPresetRow): InstructorPresetRow {\n  return { ...row, scenario: normaliseScenario(row.scenario) }\n}", "function normalisePreset(row: InstructorPresetRow): InstructorPresetRow {\n  return { ...row, product: row.product ?? 'eduvent', scenario: normaliseScenario(row.scenario) }\n}", 'preset normalisation')
  text = replaceOnce(text, "export async function listInstructorPresets(): Promise<InstructorPresetRow[]> {", "export async function listInstructorPresets(product: ScenarioProductId = 'eduvent'): Promise<InstructorPresetRow[]> {")
  text = replaceOnce(text, ".eq('instructor_id', user.id)\n    .order('updated_at', { ascending: false })", ".eq('instructor_id', user.id)\n    .eq('product', product)\n    .order('updated_at', { ascending: false })", 'preset list product filter')
  text = replaceOnce(text, "export async function createInstructorPreset(name: string, scenario: InstructorScenarioSnapshot) {", "export async function createInstructorPreset(name: string, scenario: InstructorScenarioSnapshot, product: ScenarioProductId = 'eduvent') {")
  text = replaceOnce(text, "      instructor_id: user.id,\n      name: cleanName,", "      instructor_id: user.id,\n      product,\n      name: cleanName,", 'preset insert product')
  text = replaceOnce(text, "  updates: { name?: string; scenario?: InstructorScenarioSnapshot },\n) {", "  updates: { name?: string; scenario?: InstructorScenarioSnapshot },\n  product: ScenarioProductId = 'eduvent',\n) {", 'preset update signature')
  const updateAnchor = ".eq('id', id)\n    .eq('instructor_id', user.id)\n    .select('*')"
  text = replaceOnce(text, updateAnchor, ".eq('id', id)\n    .eq('instructor_id', user.id)\n    .eq('product', product)\n    .select('*')", 'preset update product filter')
  text = replaceOnce(text, "export async function deleteInstructorPreset(id: string) {", "export async function deleteInstructorPreset(id: string, product: ScenarioProductId = 'eduvent') {")
  text = replaceOnce(text, ".eq('id', id)\n    .eq('instructor_id', user.id)\n  if (error) throw error\n}", ".eq('id', id)\n    .eq('instructor_id', user.id)\n    .eq('product', product)\n  if (error) throw error\n}", 'preset delete product filter')
  fs.writeFileSync(path, text)
}

// Scenario Builder becomes a product selector rather than an EDUVENT-only shell.
{
  const path = 'src/scenario-builder/ScenarioBuilderApp.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text, "import { APP_VERSION } from '../appVersion'\n", '', 'remove eduvent-only version')
  text = replaceOnce(text, "import { VentilatorScenarioEditor } from './modules/ventilator/VentilatorScenarioEditor'\n", "import { VentilatorScenarioEditor } from './modules/ventilator/VentilatorScenarioEditor'\nimport { EdumonScenarioEditor } from './modules/edumon/EdumonScenarioEditor'\nimport type { EdumonStoredScenario } from '../edumon/scenarioTypes'\nimport type { ProductScenarioRow } from '../teaching/scenario/productLibrary'\nimport { SCENARIO_PRODUCTS, type ScenarioProductId } from '../teaching/scenario/products'\n", 'builder product imports')
  text = replaceOnce(text, "  const startScenario = (preset: InstructorPresetRow) => {\n    launchingScenarioRef.current = true\n    const url = new URL('/', window.location.origin)\n    url.searchParams.set('scenario', preset.id)\n    window.location.assign(url.toString())\n  }", "  const startProductScenario = (product: ScenarioProductId, id: string) => {\n    launchingScenarioRef.current = true\n    const url = new URL(SCENARIO_PRODUCTS[product].route, window.location.origin)\n    url.searchParams.set('scenario', id)\n    window.location.assign(url.toString())\n  }\n\n  const startScenario = (preset: InstructorPresetRow) => startProductScenario(preset.product ?? 'eduvent', preset.id)\n  const startEdumonScenario = (row: ProductScenarioRow<EdumonStoredScenario>) => startProductScenario(row.product, row.id)", 'product scenario launcher')
  text = text.replace('Builder v{SCENARIO_BUILDER_VERSION} · EDUVENT simulator v{APP_VERSION}', 'Builder v{SCENARIO_BUILDER_VERSION} · EDUSIM shared scenario framework')
  text = text.replace('Return to simulator', 'Return to EDUSIM')
  const oldRender = `      ) : moduleId === 'ventilator' ? (\n        <section className="scenario-builder-workspace">\n          <VentilatorScenarioEditor\n            seedScenario={defaultScenario}\n            dynamicPresets={dynamicPresets}\n            staticPresets={staticPresets}\n            onRefresh={refreshPresets}\n            onStartScenario={startScenario}\n            onClose={closeBuilder}\n          />\n        </section>\n      ) : (\n        <section className="scenario-builder-state">This simulation module is not yet available.</section>\n      )}`
  const newRender = `      ) : moduleId === 'ventilator' ? (\n        <section className="scenario-builder-workspace">\n          <VentilatorScenarioEditor\n            seedScenario={defaultScenario}\n            dynamicPresets={dynamicPresets}\n            staticPresets={staticPresets}\n            onRefresh={refreshPresets}\n            onStartScenario={startScenario}\n            onClose={closeBuilder}\n          />\n        </section>\n      ) : moduleId === 'edumon-ana' || moduleId === 'edumon-icu' ? (\n        <section className="scenario-builder-workspace">\n          <EdumonScenarioEditor product={moduleId} onStartScenario={startEdumonScenario} />\n        </section>\n      ) : (\n        <section className="scenario-builder-state">This simulation module is not yet available.</section>\n      )}`
  text = replaceOnce(text, oldRender, newRender, 'product editor render')
  fs.writeFileSync(path, text)
}

// EDUMON consumes the product-aware library in the same shared session wizard.
{
  const path = 'src/edumon/EdumonApp.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text, "import { createEdumonScenarioRuntimeAdapter } from './scenarioAdapter'\n", "import { createEdumonScenarioRuntimeAdapter } from './scenarioAdapter'\nimport type { EdumonStoredScenario } from './scenarioTypes'\nimport { listProductScenarios, type ProductScenarioRow } from '../teaching/scenario/productLibrary'\nimport { scenarioProductForEdumonModule } from '../teaching/scenario/products'\n", 'edumon scenario library imports')
  text = text.replace('<div className="edumon-version">EDUMON v0.1.0.0</div>', '<div className="edumon-version">EDUMON v{EDUMON_APP_VERSION}</div>')
  const stateAnchor = "  const [alarmSilenceRemaining, setAlarmSilenceRemaining] = useState(0)\n"
  text = replaceOnce(text, stateAnchor, stateAnchor + "  const [savedScenarios, setSavedScenarios] = useState<Array<ProductScenarioRow<EdumonStoredScenario>>>([])\n  const [selectedSavedScenarioId, setSelectedSavedScenarioId] = useState('')\n  const [savedScenariosBusy, setSavedScenariosBusy] = useState(false)\n  const [savedScenarioMessage, setSavedScenarioMessage] = useState<string | null>(null)\n  const launchedScenarioRef = useRef<string | null>(null)\n", 'edumon saved scenario state')
  const authAnchor = "  const instructorAuthenticated = Boolean(accountAuth.account)\n"
  text = replaceOnce(text, authAnchor, authAnchor + "  const scenarioProduct = scenarioProductForEdumonModule(module.id)\n", 'edumon scenario product')
  const runtimeAnchor = "  const scenarioRuntime = useTeachingScenarioRuntime(edumonScenarioAdapter)\n  const selectedAuxiliary"
  const runtimeInsert = `  const scenarioRuntime = useTeachingScenarioRuntime(edumonScenarioAdapter)\n\n  const refreshSavedScenarios = async () => {\n    if (!instructorAuthenticated) { setSavedScenarios([]); setSelectedSavedScenarioId(''); return }\n    setSavedScenariosBusy(true)\n    setSavedScenarioMessage(null)\n    try {\n      const next = await listProductScenarios<EdumonStoredScenario>(scenarioProduct)\n      setSavedScenarios(next)\n      setSelectedSavedScenarioId((current) => next.some((row) => row.id === current) ? current : (next[0]?.id ?? ''))\n      if (!next.length) setSavedScenarioMessage('No saved scenarios for this simulator yet. Create one in Scenario Builder.')\n    } catch (cause) {\n      setSavedScenarioMessage(cause instanceof Error ? cause.message : 'Unable to load saved scenarios.')\n    } finally { setSavedScenariosBusy(false) }\n  }\n\n  useEffect(() => { void refreshSavedScenarios() }, [instructorAuthenticated, scenarioProduct])\n\n  const loadSavedScenario = async (id: string) => {\n    const row = savedScenarios.find((item) => item.id === id)\n    if (!row) return false\n    await scenarioRuntime.start(row.scenario.definition, elapsed)\n    return true\n  }\n\n  useEffect(() => {\n    const requested = new URLSearchParams(window.location.search).get('scenario')\n    if (!requested || !instructorAuthenticated || teachingSession.role !== 'standalone' || launchedScenarioRef.current === requested) return\n    if (!savedScenarios.some((row) => row.id === requested)) return\n    launchedScenarioRef.current = requested\n    void loadSavedScenario(requested)\n  }, [instructorAuthenticated, teachingSession.role, savedScenarios])\n\n  const selectedAuxiliary`
  text = replaceOnce(text, runtimeAnchor, runtimeInsert, 'edumon scenario runtime library')
  const startConfigOld = `      instructorStart={{ currentTitle: \`${'${RHYTHM_LABELS[patientState.rhythm]}'} · HR ${'${patientState.heartRate}'} · ${'${patientState.systolicPressure}'}/${'${patientState.diastolicPressure}'} · SpO₂ ${'${patientState.spo2}'}%\`, currentSummary: 'Configure the patient monitor in standalone mode before opening the room.', currentChips: [RHYTHM_LABELS[patientState.rhythm], \`HR ${'${patientState.heartRate}'}\`, \`MAP ${'${measurements.meanPressure ?? "—"}'}\`, \`SpO₂ ${'${patientState.spo2}'}%\`], savedMessage: 'Saved EDUMON scenarios will appear here once product-aware scenario persistence is enabled.', onStartCurrent: teachingSession.startInstructor }}`
  const startConfigNew = `      instructorStart={{\n        currentTitle: \`${'${RHYTHM_LABELS[patientState.rhythm]}'} · HR ${'${patientState.heartRate}'} · ${'${patientState.systolicPressure}'}/${'${patientState.diastolicPressure}'} · SpO₂ ${'${patientState.spo2}'}%\`,\n        currentSummary: 'Configure the patient monitor in standalone mode before opening the room.',\n        currentChips: [RHYTHM_LABELS[patientState.rhythm], \`HR ${'${patientState.heartRate}'}\`, \`MAP ${'${measurements.meanPressure ?? "—"}'}\`, \`SpO₂ ${'${patientState.spo2}'}%\`],\n        savedOptions: savedScenarios.map((row) => { const snapshot = row.scenario.definition.stages[0]?.snapshot; return { id: row.id, title: row.name, summary: row.scenario.description || 'Saved monitor scenario', chips: snapshot ? [RHYTHM_LABELS[snapshot.patient.rhythm], \`HR ${'${snapshot.patient.heartRate}'}\`, \`SpO₂ ${'${snapshot.patient.spo2}'}%\`] : [] } }),\n        selectedSavedId: selectedSavedScenarioId,\n        onSelectedSavedIdChange: setSelectedSavedScenarioId,\n        savedBusy: savedScenariosBusy,\n        savedMessage: savedScenarioMessage,\n        onStartCurrent: teachingSession.startInstructor,\n        onLoadSaved: loadSavedScenario,\n        onStartSaved: async (id) => { if (await loadSavedScenario(id)) { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); await teachingSession.startInstructor() } },\n      }}`
  text = replaceOnce(text, startConfigOld, startConfigNew, 'edumon shared saved scenario config')
  fs.writeFileSync(path, text)
}

// Product versions advance by 0.0.1 for this change.
fs.writeFileSync('src/appVersion.ts', "export const APP_VERSION = '0.83.0.2'\n")
fs.writeFileSync('src/edumon/appVersion.ts', "export const EDUMON_APP_VERSION = '0.1.0.2'\n")

// Basic shared-builder styling for the new EDUMON product editor.
{
  const path = 'src/scenario-builder/scenarioBuilder.css'
  let text = fs.readFileSync(path, 'utf8')
  text += `\n\n.scenario-builder-edumon-editor{display:grid;grid-template-columns:minmax(220px,.75fr) minmax(0,2fr);gap:16px}.scenario-builder-edumon-library,.scenario-builder-edumon-form{border:1px solid rgba(116,171,190,.28);border-radius:16px;background:rgba(12,24,30,.72);padding:18px}.scenario-builder-edumon-library{display:flex;flex-direction:column;gap:10px}.scenario-builder-edumon-library>button{display:flex;flex-direction:column;gap:4px;text-align:left;padding:12px;border:1px solid rgba(116,171,190,.25);border-radius:10px;background:rgba(18,32,39,.8);color:inherit}.scenario-builder-edumon-library>button.selected{border-color:#5ccde8;box-shadow:0 0 0 1px rgba(92,205,232,.35)}.scenario-builder-edumon-library small{opacity:.7}.scenario-builder-edumon-form{display:flex;flex-direction:column;gap:14px}.scenario-builder-edumon-form>label,.scenario-builder-field-grid label{display:flex;flex-direction:column;gap:6px}.scenario-builder-edumon-form input,.scenario-builder-edumon-form textarea,.scenario-builder-edumon-form select{width:100%;box-sizing:border-box}.scenario-builder-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.scenario-builder-editor-actions{display:flex;flex-wrap:wrap;gap:10px}@media(max-width:760px){.scenario-builder-edumon-editor,.scenario-builder-field-grid{grid-template-columns:1fr}}\n`
  fs.writeFileSync(path, text)
}

console.log('Product-aware scenario refactor applied.')
