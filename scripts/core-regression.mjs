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
const physiology = read('src/components/PhysiologyMeasurementsDialog.tsx')
const scenarioProducts = read('src/teaching/scenario/products.ts')
const scenarioDomain = read('src/teaching/scenario/domain.ts')
const scenarioRuntime = read('src/teaching/scenario/runtimeCore.ts')
const eduventScenarioRuntime = read('src/eduvent/useEduventInstructorScenarioRuntime.tsx')
const edumonScenarioAdapter = read('src/edumon/scenarioAdapter.ts')
const registry = read('src/core/products.ts')
const adapter = read('src/core/SimulationProductAdapter.ts')
const eduventContract = read('src/eduvent/productContract.ts')
const edumonContract = read('src/edumon/productContract.ts')
const productDashboard = read('src/teaching/session/productDashboard.tsx')
const productSession = read('src/teaching/session/productSession.ts')
const persistence = read('src/core/SimulationPersistence.ts')
const diagnostics = read('src/core/SimulationDiagnostics.ts')
const eduventDiagnostics = read('src/diagnostics.ts')
const transition = read('src/components/SimulationTransitionTimeControl.tsx')

// Shared shell / UI ownership.
assert(eduvent.includes('<SimulationControlFramework'), 'EDUVENT must use SimulationControlFramework')
assert(edumonPanel.includes('<SimulationControlFramework'), 'EDUMON must use SimulationControlFramework')
assert(!eduvent.includes('<aside className="control-panel tabbed-control-panel">'), 'EDUVENT must not restore product-owned control-panel chrome')
assert(edumonPanel.includes('showValue={false}'), 'EDUMON transition control must not duplicate the selected duration beside its label')
assert(transition.includes('showValue = true'), 'shared transition control must retain an explicit value-display option')
assert(physiology.includes('<SecondaryMonitorSurface'), 'EDUVENT physiology display must use SecondaryMonitorSurface')
assert(edumon.includes('<SecondaryMonitorSurface'), 'EDUMON auxiliary displays must use SecondaryMonitorSurface')
assert(!edumon.includes('AuxiliaryMonitorModal'), 'EDUMON must not depend on the legacy AuxiliaryMonitorModal wrapper')

// Functional product contract.
for (const required of ['route:', 'teachingEnvironment:', 'capabilities:', 'controlTabs:', 'secondaryDisplays:', 'alarmDefinitions:', 'session?:', 'scenario?:']) {
  assert(adapter.includes(required), `SimulationProductAdapter must expose ${required.replace(':', '')}`)
}
assert(scenarioProducts.includes('EDUSIM_PRODUCTS'), 'scenario routing must derive product metadata from the EDUSIM registry')
for (const product of ['eduvent', 'edumon-ana', 'edumon-icu']) {
  assert(registry.includes(`'${product}'`) || registry.includes(`${product}:`), `product registry must include ${product}`)
}
assert((registry.match(/session:/g) ?? []).length >= 3, 'every registered simulator must expose a session contract')
assert((registry.match(/scenario:/g) ?? []).length >= 3, 'every registered simulator must expose a scenario contract')

// Declarative session-domain ownership.
for (const domain of ["id: 'patient'", "id: 'device'", "id: 'alarms'"]) {
  assert(eduventContract.includes(domain), `EDUVENT session contract must define ${domain}`)
}
for (const domain of ["id: 'patient'", "id: 'alarms'", "id: 'display'"]) {
  assert(edumonContract.includes(domain), `EDUMON session contract must define ${domain}`)
}
assert(productDashboard.includes('product.session.domains.map'), 'shared session dashboard must render product session-domain descriptors')
assert(productDashboard.includes('product.session?.candidateStatus'), 'shared session dashboard must render product candidate status descriptors')
assert(productDashboard.includes('product.session?.telemetry'), 'shared session dashboard must render product telemetry descriptors')
assert(productSession.includes('product_id') && productSession.includes('normalizedProductId'), 'product teaching sessions must remain product-scoped')

// Product-neutral scenario contract/runtime capabilities.
for (const capability of ['supportsBranches', 'supportsTransitions', 'supportsMediaStages', 'supportsQuestionStages']) {
  assert(adapter.includes(capability), `scenario contract must declare ${capability}`)
}
for (const feature of ['branches', 'transition', 'media', 'question']) {
  assert(scenarioDomain.toLowerCase().includes(feature), `shared scenario domain must retain ${feature} semantics`)
}
assert(scenarioRuntime.includes("branch.triggerMode === 'all'"), 'shared scenario runtime must preserve ALL branch-trigger semantics')
assert(scenarioRuntime.includes('triggers.some(triggerMatches)'), 'shared scenario runtime must preserve ANY branch-trigger semantics')
assert(scenarioRuntime.includes('stageStartedSimulationTime'), 'shared scenario runtime must retain an independent simulation-time stage clock')
for (const productRuntime of [eduventScenarioRuntime, edumonScenarioAdapter]) {
  assert(productRuntime.includes("trigger.type === 'time'"), 'each product scenario adapter must preserve elapsed-time triggers')
  assert(productRuntime.includes("trigger.type === 'condition'"), 'each product scenario adapter must preserve condition triggers')
}
assert(eduventScenarioRuntime.includes("trigger.type === 'device-action'"), 'EDUVENT scenario adapter must preserve explicit device-action triggers')
assert(edumonScenarioAdapter.includes('stageBaselinePatient'), 'EDUMON scenario adapter must preserve candidate patient-change detection')

// Shared persistence and diagnostics envelope with product-owned serialization.
assert(persistence.includes('edusim.${productId}.'), 'shared persistence must namespace values by product')
assert(eduvent.includes("createSimulationPersistence('eduvent')"), 'EDUVENT must use shared persistence')
assert(edumon.includes('createSimulationPersistence(productId)'), 'EDUMON must use shared persistence')
assert(diagnostics.includes("'edusim-diagnostic-v1'"), 'shared diagnostics must provide the EDUSIM diagnostic envelope')
assert(diagnostics.includes('productId') && diagnostics.includes('appVersion'), 'shared diagnostics must include product/version metadata')
assert(eduventDiagnostics.includes('copySimulationDiagnostic'), 'EDUVENT diagnostics must use the shared diagnostic serializer')
assert(edumon.includes('copySimulationDiagnostic'), 'EDUMON diagnostics must use the shared diagnostic serializer')

// Candidate teaching presentation listeners must remain persistently mounted where each product owns them.
for (const listener of ['useTeachingPrompts', 'TeachingCandidateOverlay']) {
  assert(eduvent.includes(listener), `EDUVENT must retain persistent ${listener}`)
  assert(edumon.includes(listener), `EDUMON must retain persistent ${listener}`)
}
for (const listener of ['useTeachingMediaPresentation', 'TeachingMediaCandidateOverlay']) {
  assert(edumon.includes(listener), `EDUMON must retain persistent ${listener}`)
}

// Completed compatibility cleanup must not regress.
for (const obsoletePath of [
  'src/components/CandidateInvitation.tsx',
  'src/components/SessionPanel.tsx',
  'src/components/DynamicScenarioRuntimeLibrary.tsx',
  'src/components/DynamicScenarioBuilder.tsx',
  'src/teaching/scenario/useEduventScenarioLibrary.ts',
]) {
  assert(!fs.existsSync(obsoletePath), `${obsoletePath} must not be reintroduced after shared-core migration`)
}

if (!process.exitCode) console.log('EDUSIM core and cross-product contract regression checks passed')
