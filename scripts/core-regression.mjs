import fs from 'node:fs'

// Keep the shared simulation architecture boundaries executable in the normal build.
const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Core regression: ${message}`)
    process.exitCode = 1
  }
}

const eduvent = read('src/App.tsx')
const eduventEngine = read('src/simulation/engine.ts')
const eduventLegacyEngine = read('src/simulation/engineLegacy.ts')
const respiratoryCore = read('src/core/physiology/respiratory/RespiratoryPhysiology.ts')
const eduventRespiratoryAdapter = read('src/eduvent/respiratoryPhysiologyAdapter.ts')
const edumonRespiratoryAdapter = read('src/edumon/respiratoryPhysiology.ts')
const edumonPanel = read('src/edumon/EdumonWorkspacePanel.tsx')
const edumon = read('src/edumon/EdumonApp.tsx')
const edumonMonitorEngine = read('src/edumon/monitorEngine.ts')
const rollingSignalHistory = read('src/core/RollingSignalHistory.ts')
const physiology = read('src/components/PhysiologyMeasurementsDialog.tsx')
const scenarioProducts = read('src/teaching/scenario/products.ts')
const scenarioRuntime = read('src/teaching/scenario/runtimeCore.ts')
const eduventScenarioRuntime = read('src/eduvent/useEduventInstructorScenarioRuntime.tsx')
const edumonScenarioAdapter = read('src/edumon/scenarioAdapter.ts')
const registry = read('src/core/products.ts')
const adapter = read('src/core/SimulationProductAdapter.ts')
const eduventContract = read('src/eduvent/productContract.ts')
const edumonContract = read('src/edumon/productContract.ts')
const productDashboard = read('src/teaching/session/productDashboard.tsx')
const persistence = read('src/core/SimulationPersistence.ts')
const diagnostics = read('src/core/SimulationDiagnostics.ts')
const eduventDiagnostics = read('src/diagnostics.ts')
const transition = read('src/components/SimulationTransitionTimeControl.tsx')
const displayControls = read('src/components/useSimulationDisplayControls.ts')
const mobileWorkspace = read('src/components/mobileWorkspaceRuntime.ts')
const workspaceShell = read('src/components/SimulationWorkspaceShell.tsx')
const laserInteractionCss = read('src/teaching/laser-interaction.css')

// Existing shared shell / UI ownership regression checks.
assert(eduvent.includes('<SimulationControlFramework'), 'MV simulator must use SimulationControlFramework')
assert(edumonPanel.includes('<SimulationControlFramework'), 'monitor simulator must use SimulationControlFramework')
assert(!eduvent.includes('<aside className="control-panel tabbed-control-panel">'), 'MV simulator must not restore product-owned control-panel chrome')
assert(edumonPanel.includes('showValue={false}'), 'monitor transition control must not duplicate the selected duration beside its label')
assert(transition.includes('showValue = true'), 'shared transition control must retain an explicit value-display option')
assert(physiology.includes('<SecondaryMonitorSurface'), 'MV physiology display must use SecondaryMonitorSurface')
assert(edumon.includes('<SecondaryMonitorSurface'), 'monitor auxiliary displays must use SecondaryMonitorSurface')
assert(!edumon.includes('AuxiliaryMonitorModal'), 'monitor must not depend on the legacy AuxiliaryMonitorModal wrapper')

// Cross-product registration and functional contract.
assert(adapter.includes('SimulationProductSessionContract'), 'product adapter must expose a functional session contract')
assert(adapter.includes('SimulationProductScenarioContract'), 'product adapter must expose a functional scenario contract')
assert(adapter.includes("export type SimulationProductId = 'mv' | 'anaesth' | 'icu'"), 'canonical product IDs must remain brand-neutral')
assert(adapter.includes("eduvent: 'mv'"), 'legacy EDUVENT product ID must normalise to mv')
assert(adapter.includes("'edumon-ana': 'anaesth'"), 'legacy anaesthesia product ID must normalise to anaesth')
assert(adapter.includes("'edumon-icu': 'icu'"), 'legacy ICU product ID must normalise to icu')
assert(scenarioProducts.includes('SIMULATION_PRODUCTS'), 'scenario routing must derive product metadata from the neutral registry')
for (const product of ['mv', 'anaesth', 'icu']) {
  assert(registry.includes(`id: '${product}'`), `product registry must include ${product}`)
}
assert((registry.match(/session:/g) ?? []).length >= 3, 'all registered simulators must expose session descriptors')
assert((registry.match(/scenario:/g) ?? []).length >= 3, 'all registered simulators must expose scenario capabilities')

// Declarative session-domain ownership rendered by shared UI.
for (const domain of ["id: 'patient'", "id: 'device'", "id: 'alarms'"]) {
  assert(eduventContract.includes(domain), `MV session contract must define ${domain}`)
}
for (const domain of ["id: 'patient'", "id: 'alarms'", "id: 'display'"]) {
  assert(edumonContract.includes(domain), `monitor session contract must define ${domain}`)
}
assert(productDashboard.includes('product.session.domains.map'), 'shared dashboard must render product session-domain descriptors')
assert(productDashboard.includes('product.session?.telemetry'), 'shared dashboard must render product telemetry descriptors')

// Generic sequencer owns branching/timing; product adapters own trigger semantics.
assert(scenarioRuntime.includes("branch.triggerMode === 'all'"), 'shared scenario runtime must preserve ALL branch semantics')
assert(scenarioRuntime.includes('triggers.some(triggerMatches)'), 'shared scenario runtime must preserve ANY branch semantics')
assert(scenarioRuntime.includes('stageStartedSimulationTime'), 'shared scenario runtime must retain its simulation-time stage clock')
for (const productRuntime of [eduventScenarioRuntime, edumonScenarioAdapter]) {
  assert(productRuntime.includes("trigger.type === 'time'"), 'product scenario adapters must preserve elapsed-time triggers')
  assert(productRuntime.includes("trigger.type === 'condition'"), 'product scenario adapters must preserve condition triggers')
}

// Shared display interactions: standalone laser stays live; teaching laser may freeze/share.
assert(displayControls.includes("const sharedTeachingLaser = role === 'instructor' && Boolean(sessionId)"), 'laser freeze must be scoped to an active instructor session')
assert(displayControls.includes('if (next && sharedTeachingLaser && !frozen)'), 'standalone laser must not force a local waveform freeze')
assert(displayControls.includes('data-edusim-simulator-laser-active'), 'laser toggle must expose a synchronous global interaction lock')
assert(displayControls.includes('setSimulatorLaserInteractionLock(next)'), 'laser toggle must claim the global interaction lock before React rerenders')

// Workspace navigation is deliberately two-finger so one-finger sliders, scrolling and laser input
// do not need special swipe-blocking hooks.
assert(mobileWorkspace.includes('event.touches.length !== 2'), 'legacy mobile workspace navigation must require exactly two active touches')
assert(mobileWorkspace.includes('centroidFromTouches(event.touches)'), 'legacy mobile workspace must track the two-finger gesture centroid')
assert(mobileWorkspace.includes('event.touches.length !== 2) resetSwipe()'), 'legacy mobile workspace must cancel navigation when the active touch count changes')
assert(!mobileWorkspace.includes('isSwipeBlockedTouch'), 'mobile workspace must not restore laser-specific swipe blocking')
assert(!mobileWorkspace.includes('isGlobalLaserInteractionActive'), 'mobile workspace must not couple page navigation to the laser lock')
assert(!mobileWorkspace.includes('event.preventDefault()'), 'mobile workspace must not suppress laser or slider touch movement')
assert(workspaceShell.includes('event.touches.length !== 2'), 'React workspace navigation must require exactly two active touches')
assert(workspaceShell.includes('centroidFromTouches(event.touches)'), 'React workspace must track the two-finger gesture centroid')
assert(workspaceShell.includes('event.touches.length !== 2) resetSwipe()'), 'React workspace must cancel navigation if the active touch count changes')
assert(workspaceShell.includes('twoTouchCentroidAtEnd(event)'), 'React workspace must reconstruct the two-finger centroid when one contact lifts')
assert(workspaceShell.includes('onTouchCancel={resetSwipe}'), 'React workspace must reset tracked swipe state when a touch is cancelled')
assert(laserInteractionCss.includes('.teaching-laser-exit'), 'legacy laser exit affordance must remain hidden')

// Shared persistence and diagnostics infrastructure with product-owned payloads.
assert(persistence.includes('edusim.${productId}.'), 'shared persistence must namespace values by neutral product ID')
assert(persistence.includes('normaliseSimulationProductId(productAlias)'), 'shared persistence must normalise legacy product aliases immediately at its boundary')
assert(persistence.includes('legacyProductKey(name)'), 'shared persistence must migrate existing product-prefixed local values')
assert(edumon.includes('createSimulationPersistence(productId)'), 'monitor must use shared persistence')
assert(diagnostics.includes('edusim-diagnostic-v1'), 'shared diagnostics must retain the existing diagnostic envelope for compatibility')
assert(eduventDiagnostics.includes('copySimulationDiagnostic'), 'MV diagnostics must use shared diagnostic infrastructure')
assert(edumon.includes('copySimulationDiagnostic'), 'monitor diagnostics must use shared diagnostic infrastructure')

// Continuous signal history belongs to shared core; waveform semantics remain product-owned.
assert(rollingSignalHistory.includes('class RollingSignalHistory'), 'shared core must expose a reusable rolling signal history')
assert(rollingSignalHistory.includes('append(sample: TSample)'), 'rolling signal history must append future samples rather than regenerate history')
assert(rollingSignalHistory.includes('trim(endTime: number)'), 'rolling signal history must trim samples by simulation time')
assert(edumonMonitorEngine.includes("import { RollingSignalHistory } from '../core/RollingSignalHistory'"), 'monitor engine must use the shared rolling signal history')
assert(edumonMonitorEngine.includes('runtime.history.append(generateNextSample'), 'monitor must generate and append only future monitor samples')
assert(edumonMonitorEngine.includes('const nextPhase = runtime.phase +'), 'monitor must advance cardiac phase incrementally rather than recompute historical phase')
assert(edumonMonitorEngine.includes('runtime.phase = fract(nextPhase)'), 'monitor must preserve cardiac phase continuity when a beat completes')
assert(edumonMonitorEngine.includes('beatHistory'), 'monitor derived measurements must be based on generated beat history')
assert(edumonMonitorEngine.includes('beats.slice(-5)'), 'displayed heart rate must average the last five detected beats')
assert(edumonMonitorEngine.includes('beat.time >= now - 30'), 'displayed SpO2 must use a rolling 30-second beat window')
assert(!edumonMonitorEngine.includes('cardiacPhase(time, rate'), 'monitor must not derive the whole visible waveform phase from the current heart rate')

// Respiratory/metabolic gas exchange belongs to shared core. Products supply
// mechanics/ventilation inputs and retain product-specific waveform morphology.
assert(respiratoryCore.includes('interface RespiratoryPhysiologyInput'), 'shared core must define product-neutral respiratory inputs')
assert(respiratoryCore.includes('oxygenConsumptionMlMin'), 'shared respiratory core must model VO2')
assert(respiratoryCore.includes('co2ProductionMlMin'), 'shared respiratory core must model VCO2')
assert(respiratoryCore.includes('alveolarVentilationLMin'), 'shared respiratory core must expose alveolar ventilation')
assert(respiratoryCore.includes('stepRespiratoryPhysiology'), 'shared respiratory core must evolve gas exchange over simulation time')
assert(respiratoryCore.includes('0.863 * netCo2MlMin'), 'shared respiratory core must preserve the MV CO2 mass-balance model')
assert(respiratoryCore.includes('metabolicDepletionPerSecond'), 'shared respiratory core must preserve oxygen-consumption depletion of the FRC reservoir')
assert(eduventRespiratoryAdapter.includes("from '../core/physiology/respiratory'"), 'MV simulator must adapt mechanics into the shared respiratory core')
assert(edumonRespiratoryAdapter.includes("from '../core/physiology/respiratory'"), 'monitor must consume the same shared respiratory core')
assert(eduventEngine.includes('stepEduventRespiratoryPhysiology'), 'MV runtime must advance the shared respiratory physiology state')
assert(eduventEngine.includes('state.alveolarCo2 = shared.output.alveolarCo2MmHg'), 'MV alveolar CO2 state must be synchronized from shared physiology')
assert(eduventEngine.includes('sample.spo2 = shared.output.spo2Percent'), 'MV displayed oxygenation must be sourced from shared physiology')
assert(eduventLegacyEngine.includes('capnogramSourceValue'), 'MV simulator must retain product-owned capnogram morphology during physiology extraction')
assert(!respiratoryCore.includes('capnogramSourceValue'), 'shared respiratory physiology must not own capnogram waveform morphology')

// Completed compatibility cleanup must not regress.
assert(!fs.existsSync('src/teaching/scenario/useEduventScenarioLibrary.ts'), 'obsolete product-only scenario library hook must not be reintroduced')

if (!process.exitCode) console.log('Core and cross-product contract regression checks passed')
