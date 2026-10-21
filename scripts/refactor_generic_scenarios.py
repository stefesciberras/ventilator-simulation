from pathlib import Path

# Shared self-directed launcher resolves the assignment product before routing.
p = Path('src/teaching/session/SharedSessionModePanel.tsx')
s = p.read_text()
if "routeToSelfDirectedAssignment" not in s:
    s = s.replace("import type { ReactNode } from 'react'\n", "import type { ReactNode } from 'react'\nimport { routeToSelfDirectedAssignment } from '../../selfDirectedAssignments'\n")
s = s.replace("  const launchSelfDirected = (code: string) => {\n", "  const launchSelfDirected = async (code: string) => {\n")
s = s.replace("    const url = new URL(window.location.href)\n    url.search = ''\n    url.hash = ''\n    url.searchParams.set('assignment', code)\n    window.location.assign(url.toString())\n", "    await routeToSelfDirectedAssignment(code)\n")
s = s.replace("        launchSelfDirected(code)\n", "        void launchSelfDirected(code)\n")
p.write_text(s)

# Move EDUVENT library CRUD adapter out of InstructorAccountControls.
p = Path('src/components/InstructorAccountControls.tsx')
s = p.read_text()
for name in ["  createInstructorPreset,\n", "  deleteInstructorPreset,\n", "  listInstructorPresets,\n", "  updateInstructorPreset,\n"]:
    s = s.replace(name, '')
s = s.replace("import { eduventTeachingHost, useScenarioLibraryManager, useTeachingPrompts } from '../teaching'", "import { eduventTeachingHost, useTeachingPrompts } from '../teaching'\nimport { useEduventScenarioLibrary } from '../teaching/scenario/useEduventScenarioLibrary'")
s = s.replace("  const scenarioLibraryRepository = useMemo(() => ({ list: () => listInstructorPresets(), create: (name: string, scenario: InstructorScenarioSnapshot) => createInstructorPreset(name, scenario), update: (id: string, updates: { name?: string; scenario?: InstructorScenarioSnapshot }) => updateInstructorPreset(id, updates), remove: (id: string) => deleteInstructorPreset(id) }), [])\n  const scenarioLibrary = useScenarioLibraryManager<InstructorPresetRow, InstructorScenarioSnapshot>({ enabled: Boolean(account), repository: scenarioLibraryRepository })\n", "  const scenarioLibrary = useEduventScenarioLibrary(Boolean(account))\n")
p.write_text(s)

# EDUMON: use shared product library, product-aware self-directed runs and generic runtime content panel.
p = Path('src/edumon/EdumonApp.tsx')
s = p.read_text()
s = s.replace("import { createProductScenario, deleteProductScenario, listProductScenarios, updateProductScenario, type ProductScenarioRow } from '../teaching/scenario/productLibrary'\nimport { TeachingLaserPointerSurface, useScenarioLibraryManager, useTeachingDisplaySync } from '../teaching'", "import { TeachingLaserPointerSurface, useTeachingDisplaySync } from '../teaching'\nimport { useProductScenarioLibrary } from '../teaching/scenario/useProductScenarioLibrary'\nimport { SharedScenarioRuntimePanel } from '../teaching/scenario/SharedScenarioRuntimePanel'\nimport { selfDirectedAssignmentUrl, startSelfDirectedRun, updateSelfDirectedRun } from '../selfDirectedAssignments'")
s = s.replace("  const launchedScenarioRef = useRef<string | null>(null)\n", "  const launchedScenarioRef = useRef<string | null>(null)\n  const launchedAssignmentRef = useRef<string | null>(null)\n  const [selfDirectedRunId, setSelfDirectedRunId] = useState<string | null>(null)\n  const [scenarioQuestionState, setScenarioQuestionState] = useState({ answered: false, correct: false })\n")
old = """  const scenarioLibraryRepository = useMemo(() => ({
    list: () => listProductScenarios<EdumonStoredScenario>(scenarioProduct),
    create: (name: string, scenario: EdumonStoredScenario) => createProductScenario(scenarioProduct, name, scenario),
    update: (id: string, updates: { name?: string; scenario?: EdumonStoredScenario }) => updateProductScenario(scenarioProduct, id, updates),
    remove: (id: string) => deleteProductScenario(scenarioProduct, id),
  }), [scenarioProduct])
  const scenarioLibrary = useScenarioLibraryManager<ProductScenarioRow<EdumonStoredScenario>, EdumonStoredScenario>({ enabled: instructorAuthenticated, repository: scenarioLibraryRepository })
"""
if old not in s:
    raise SystemExit('EDUMON library block not found')
s = s.replace(old, "  const scenarioLibrary = useProductScenarioLibrary<EdumonStoredScenario>(scenarioProduct, instructorAuthenticated)\n")
marker = """  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('scenario')
    if (!requested || !instructorAuthenticated || teachingSession.role !== 'standalone' || launchedScenarioRef.current === requested) return
    if (!savedScenarios.some((row) => row.id === requested)) return
    launchedScenarioRef.current = requested
    void loadSavedScenario(requested)
  }, [instructorAuthenticated, teachingSession.role, savedScenarios])

"""
addition = marker + """  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('assignment')?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) ?? ''
    if (code.length !== 8 || launchedAssignmentRef.current === code) return
    launchedAssignmentRef.current = code
    void startSelfDirectedRun<EdumonStoredScenario>(code).then(async (run) => {
      if (run.product !== scenarioProduct) {
        window.location.assign(selfDirectedAssignmentUrl(code, run.product))
        return
      }
      setSelfDirectedRunId(run.runId)
      await scenarioRuntime.start(run.scenario.definition, elapsed)
    }).catch((cause) => {
      console.error('Unable to start self-directed EDUMON scenario', cause)
      launchedAssignmentRef.current = null
    })
  }, [scenarioProduct])

  useEffect(() => {
    setScenarioQuestionState({ answered: false, correct: false })
    if (selfDirectedRunId && scenarioRuntime.status === 'running') void updateSelfDirectedRun(selfDirectedRunId, scenarioRuntime.stageIndex)
    if (selfDirectedRunId && scenarioRuntime.status === 'complete') void updateSelfDirectedRun(selfDirectedRunId, scenarioRuntime.stageIndex, true)
  }, [scenarioRuntime.stageIndex, scenarioRuntime.status, selfDirectedRunId])

"""
if marker not in s:
    raise SystemExit('EDUMON saved scenario marker not found')
s = s.replace(marker, addition)
s = s.replace("    void scenarioRuntime.evaluate({ simulationTime: elapsed, state: sharedTeachingState, measurements }, elapsed)\n", "    void scenarioRuntime.evaluate({ simulationTime: elapsed, state: sharedTeachingState, measurements, questionAnswered: scenarioQuestionState.answered, questionCorrect: scenarioQuestionState.correct }, elapsed)\n")
s = s.replace("  }, [scenarioRuntime, elapsed, sharedTeachingState, measurements])\n", "  }, [scenarioRuntime, elapsed, sharedTeachingState, measurements, scenarioQuestionState])\n", 1)
insert_before = """      {selectedAuxiliary && auxiliaryMonitor && (
"""
runtime_panel = """      {scenarioRuntime.scenario && scenarioRuntime.stage && scenarioRuntime.status !== 'idle' && (
        <SharedScenarioRuntimePanel
          scenarioName={scenarioRuntime.scenario.name}
          stageName={scenarioRuntime.stage.name}
          stageNumber={scenarioRuntime.stageIndex + 1}
          stageCount={scenarioRuntime.scenario.stages.length}
          notes={scenarioRuntime.stage.notes}
          content={scenarioRuntime.stage.content}
          manualAdvanceAvailable={scenarioRuntime.stage.triggers.some((trigger) => trigger.type === 'manual')}
          onAdvance={() => scenarioRuntime.advance(elapsed)}
          onQuestionResult={(answered, correct) => setScenarioQuestionState({ answered, correct })}
          onClose={() => { scenarioRuntime.stop(); setSelfDirectedRunId(null) }}
        />
      )}

"""
if insert_before not in s:
    raise SystemExit('EDUMON render insertion marker not found')
s = s.replace(insert_before, runtime_panel + insert_before)
p.write_text(s)

# Shared scenario editor/runtime styling.
p = Path('src/scenario-builder/scenarioBuilder.css')
s = p.read_text()
css = r'''

/* Shared EDUSIM scenario authoring framework */
.shared-scenario-editor{display:grid;grid-template-columns:280px minmax(0,1fr);gap:14px;min-height:calc(100vh - 190px)}
.shared-scenario-library,.shared-scenario-authoring{border:1px solid #2d414b;background:#091319;min-width:0}.shared-scenario-library{padding:12px;display:flex;flex-direction:column;gap:10px}.shared-scenario-library-heading,.shared-scenario-section-heading,.shared-scenario-authoring-header,.shared-scenario-stage-list-heading,.shared-scenario-stage-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px}.shared-scenario-library button,.shared-scenario-authoring button{min-height:34px;padding:6px 10px;border:1px solid #3c535d;background:#102029;color:#dce8ec}.shared-scenario-library-list{display:grid;gap:7px}.shared-scenario-library-list>button{text-align:left;display:grid;gap:3px}.shared-scenario-library-list>button.selected{border-color:#62cbe8;background:#12323e}.shared-scenario-library-list small{color:#7f949e}.shared-scenario-authoring{padding:14px}.shared-scenario-authoring-header{padding-bottom:12px;border-bottom:1px solid #273b44}.shared-scenario-authoring-header h2{margin:3px 0}.shared-scenario-authoring-header span,.shared-scenario-meta-grid span,.shared-scenario-stage-toolbar span,.shared-scenario-notes span,.shared-scenario-publish span{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#8398a1}.shared-scenario-meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}.shared-scenario-meta-grid .wide{grid-column:1/-1}.shared-scenario-meta-grid label,.shared-scenario-stage-toolbar label,.shared-scenario-notes{display:grid;gap:5px}.shared-scenario-authoring input,.shared-scenario-authoring select,.shared-scenario-authoring textarea{box-sizing:border-box;width:100%;padding:7px 8px;border:1px solid #3a505a;background:#071015;color:#e8f0f3}.shared-scenario-stage-layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:12px}.shared-scenario-stage-list{border:1px solid #293e48;padding:9px;display:flex;flex-direction:column;gap:6px}.shared-scenario-stage-list>button{text-align:left;display:grid;gap:3px}.shared-scenario-stage-list>button.selected{border-color:#62cbe8;background:#12323e}.shared-scenario-stage-list em{font-style:normal;font-size:9px;color:#78909a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.shared-scenario-stage-editor{display:grid;gap:12px;min-width:0}.shared-scenario-stage-toolbar{align-items:end}.shared-scenario-stage-toolbar label:first-child{flex:1}.shared-scenario-notes textarea{width:100%}.shared-scenario-snapshot-editor,.shared-scenario-content-card,.shared-scenario-triggers,.shared-scenario-branches{padding:12px;border:1px solid #2c414a;background:#0b161c}.shared-scenario-eduvent-snapshot section{margin-bottom:16px}.shared-scenario-eduvent-snapshot h3,.shared-scenario-content-card h3{margin:0 0 9px}.shared-scenario-trigger-editor{display:grid;grid-template-columns:minmax(130px,1fr) repeat(3,minmax(90px,.7fr)) auto;gap:7px;align-items:center;margin-top:7px}.shared-scenario-trigger-editor label{display:grid;grid-template-columns:auto 1fr;gap:5px;align-items:center}.shared-scenario-branch-row{margin-top:9px;padding:9px;border:1px solid #263b44;display:grid;grid-template-columns:1fr 1fr 70px auto;gap:7px}.shared-scenario-branch-row>.shared-scenario-trigger-editor{grid-column:1/-1}.shared-scenario-check{display:flex!important;align-items:center;gap:5px}.shared-scenario-check input{width:auto}.shared-scenario-question-options{display:grid;gap:6px;margin:10px 0}.shared-scenario-question-options>div{display:grid;grid-template-columns:auto 1fr auto auto;gap:7px;align-items:center}.shared-scenario-question-options input[type=radio]{width:auto}.scenario-builder-danger{border-color:#78434a!important;color:#ffc4c9!important}.shared-scenario-publish{display:flex;align-items:end;gap:12px;margin-top:14px;padding:12px;border:1px solid #3c5260;background:#0a1820}.shared-scenario-publish>div:first-child{display:grid;gap:3px;flex:1}.shared-scenario-publish label{display:grid;gap:4px}.shared-scenario-publish label input{width:80px}.shared-scenario-publication-result{display:grid;grid-template-columns:auto minmax(180px,1fr) auto;gap:6px;align-items:center;flex:2}.shared-scenario-publication-result small{grid-column:1/-1}.shared-scenario-runtime-panel{position:fixed;z-index:90;right:18px;bottom:18px;width:min(430px,calc(100vw - 36px));max-height:min(70vh,620px);overflow:auto;padding:14px;border:1px solid #4d6772;background:rgba(8,18,23,.97);color:#e7f1f4;box-shadow:0 14px 36px rgba(0,0,0,.55)}.shared-scenario-runtime-panel header{display:flex;justify-content:space-between;gap:10px}.shared-scenario-runtime-panel header>div{display:grid;gap:3px}.shared-scenario-runtime-panel header span{font-size:10px;color:#80a1af;text-transform:uppercase}.shared-scenario-runtime-panel header button{border:1px solid #40545d;background:#102029;color:#e7f1f4}.shared-scenario-runtime-media img,.shared-scenario-runtime-media video{display:block;max-width:100%;max-height:280px;margin-top:8px}.shared-scenario-runtime-question>div{display:grid;gap:6px;margin:8px 0}.shared-scenario-runtime-question label{display:flex;gap:8px}.shared-scenario-runtime-answer{padding:8px;border:1px solid #385460;background:#0d2028}@media(max-width:1180px){.shared-scenario-editor{grid-template-columns:220px minmax(0,1fr)}.shared-scenario-stage-layout{grid-template-columns:190px minmax(0,1fr)}.shared-scenario-trigger-editor{grid-template-columns:1fr 1fr}.shared-scenario-branch-row{grid-template-columns:1fr 1fr}}
'''
if 'Shared EDUSIM scenario authoring framework' not in s:
    s += css
p.write_text(s)

# Version progression for this feature build.
Path('src/appVersion.ts').write_text("export const APP_VERSION = '0.83.0.6'\n")
Path('src/edumon/appVersion.ts').write_text("export const EDUMON_APP_VERSION = '0.1.0.6'\n")
Path('src/scenario-builder/version.ts').write_text("export const SCENARIO_BUILDER_VERSION = '0.7.0'\n")

# trigger
