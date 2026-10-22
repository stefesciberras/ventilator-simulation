import fs from 'node:fs'

// Keep the shared EDUSIM architecture boundaries executable in the normal build.
const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`EDUSIM core regression: ${message}`)
    process.exitCode = 1
  }
}

const eduvent = read('src/App.tsx')
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
assert(eduvent.includes('<SimulationControlFramework'), 'EDUVENT must use SimulationControlFramework')
assert(edumonPanel.includes('<SimulationControlFramework'), 'EDUMON must use SimulationControlFramework')
assert(!eduvent.includes('<aside className="control-panel tabbed-control-panel">'), 'EDUVENT must not restore product-owned control-panel chrome')
assert(edumonPanel.includes('showValue={false}'), 'EDUMON transition control must not duplicate the selected duration beside its label')
assert(transition.includes('showValue = true'), 'shared transition control must retain an explicit value-display option')
assert(physiology.includes('<SecondaryMonitorSurface'), 'EDUVENT physiology display must use SecondaryMonitorSurface')
assert(edumon.includes('<SecondaryMonitorSurface'), 'EDUMON auxiliary displays must use SecondaryMonitorSurface')
assert(!edumon.includes('AuxiliaryMonitorModal'), 'EDUMON must not depend on the legacy AuxiliaryMonitorModal wrapper')

// Cross-product registration and functional contract.
assert(adapter.includes('SimulationProductSessionContract'), 'product adapter must expose a functional session contract')
assert(adapter.includes('SimulationProductScenarioContract'), 'product adapter must expose a functional scenario contract')
assert(scenarioProducts.includes('EDUSIM_PRODUCTS'), 'scenario routing must derive product metadata from the EDUSIM registry')
for (const product of ['eduvent', 'edumon-ana', 'edumon-icu']) {
  assert(registry.includes(`id: '${product}'`), `product registry must include ${product}`)
}
assert((registry.match(/session:/g) ?? []).length >= 3, 'all registered simulators must expose session descriptors')
assert((registry.match(/scenario:/g) ?? []).length >= 3, 'all registered simulators must expose scenario capabilities')

// Declarative session-domain ownership rendered by shared UI.
for (const domain of ["id: 'patient'", "id: 'device'", "id: 'alarms'"]) {
  assert(eduventContract.includes(domain), `EDUVENT session contract must define ${domain}`)
}
for (const domain of ["id: 'patient'", "id: 'alarms'", "id: 'display'"]) {
  assert(edumonContract.includes(domain), `EDUMON session contract must define ${domain}`)
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
assert(persistence.includes('edusim.${productId}.'), 'shared persistence must namespace values by product')
assert(eduvent.includes("createSimulationPersistence('eduvent')"), 'EDUVENT must use shared persistence')
assert(edumon.includes('createSimulationPersistence(productId)'), 'EDUMON must use shared persistence')
assert(diagnostics.includes('edusim-diagnostic-v1'), 'shared diagnostics must retain the EDUSIM diagnostic envelope')
assert(eduventDiagnostics.includes('copySimulationDiagnostic'), 'EDUVENT diagnostics must use shared diagnostic infrastructure')
assert(edumon.includes('copySimulationDiagnostic'), 'EDUMON diagnostics must use shared diagnostic infrastructure')

// Continuous signal history belongs to EDUSIM core; waveform semantics remain product-owned.
assert(rollingSignalHistory.includes('class RollingSignalHistory'), 'EDUSIM core must expose a reusable rolling signal history')
assert(rollingSignalHistory.includes('append(sample: TSample)'), 'rolling signal history must append future samples rather than regenerate history')
assert(rollingSignalHistory.includes('trim(endTime: number)'), 'rolling signal history must trim samples by simulation time')
assert(edumonMonitorEngine.includes("import { RollingSignalHistory } from '../core/RollingSignalHistory'"), 'EDUMON monitor engine must use the shared rolling signal history')
assert(edumonMonitorEngine.includes('runtime.history.append(generateNextSample'), 'EDUMON must generate and append only future monitor samples')
assert(edumonMonitorEngine.includes('const nextPhase = runtime.phase +'), 'EDUMON must advance cardiac phase incrementally rather than recompute historical phase')
assert(edumonMonitorEngine.includes('runtime.phase = fract(nextPhase)'), 'EDUMON must preserve cardiac phase continuity when a beat completes')
assert(edumonMonitorEngine.includes('beatHistory'), 'EDUMON derived monitor measurements must be based on generated beat history')
assert(edumonMonitorEngine.includes('beat.time >= now - 60'), 'EDUMON displayed heart rate must use a rolling 60-second beat window')
assert(edumonMonitorEngine.includes('beat.time >= now - 30'), 'EDUMON displayed SpO2 must use a rolling 30-second beat window')
assert(!edumonMonitorEngine.includes('cardiacPhase(time, rate'), 'EDUMON must not derive the whole visible waveform phase from the current heart rate')

// Completed compatibility cleanup must not regress.
assert(!fs.existsSync('src/teaching/scenario/useEduventScenarioLibrary.ts'), 'obsolete EDUVENT-only scenario library hook must not be reintroduced')

if (!process.exitCode) console.log('EDUSIM core and cross-product contract regression checks passed')
