import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Simulation local authority regression: ${message}`)
    process.exitCode = 1
  }
}

const policy = read('src/core/simulationCandidatePatchPolicy.ts')
const modes = read('src/core/runtimeModes.ts')
const productSession = read('src/teaching/session/productSession.ts')
const cloudMigration = read('supabase/migrations/20261027_simulation_central_state.sql')

const requiredKeys = [
  'lastActionId', 'actionSequence', 'actionSimulationTime', 'actionCommand', 'actionRuntimeSnapshot',
  'ventilatorMode', 'ventilatorSetRate', 'ventilatorSetTidalVolumeMl', 'ventilatorInspiratoryTimeSeconds',
  'ventilatorInspiratoryFlowLMin', 'ventilatorPlateauPercent', 'ventilatorPressureControlCmH2O',
  'ventilatorVolumeGuaranteePressureLimitCmH2O', 'ventilatorPressureSupportCmH2O',
  'ventilatorTerminationSensitivityPercent', 'ventilatorSimvSyncWindowPercent', 'peepCmH2O', 'fio2', 'fiSevoPercent',
]
for (const key of requiredKeys) {
  assert(policy.includes(`'${key}'`) && cloudMigration.includes(`'${key}'`), `LAN and cloud candidate allow-lists must both contain ${key}`)
}
assert(modes.includes("| 'product.state.patch'"), 'Core command vocabulary must expose product.state.patch explicitly')
assert(productSession.includes('filterCandidateSimulationPatch(rawPatch)'), 'instructor local authority must re-filter candidate LAN patches')
assert(productSession.includes("command.actorRole !== 'candidate' || command.type !== 'product.state.patch'"), 'only candidate product patch commands may enter local candidate authority path')
assert(productSession.includes("productRuntimeMode(localSessionRow.product_state) !== 'simulation'"), 'local candidate mutations must be Simulation-only')
assert(productSession.includes("localConnectionBySession.get(sessionId) !== 'connected'"), 'candidate LAN-first path must require an active local connection')
assert(productSession.includes('publishLocalSimulationCommand(sessionId, command)'), 'candidate mutation must travel through the LAN command transport')
assert(productSession.includes('localInstructorPatchHandlers.get(sessionId)'), 'connected instructor mutations must also use local authority before cloud')
assert(productSession.includes('acceptLocalInstructorPatch'), 'repository must expose an instructor-side local mutation handler')
assert(productSession.includes('applyProductSimulationPatchCloud'), 'local authority reconciliation must bypass the local path when persisting to cloud')
assert(productSession.includes('pendingLocalSimulationPatch = mergePatchObjects'), 'instructor must retain cloud reconciliation work after local acceptance')
assert(productSession.includes('void flushPendingLocalSimulationPatch()'), 'pending local state must be retried toward cloud persistence')
assert(productSession.includes('publishLocalRow(next)'), 'accepted candidate patch must be broadcast back as shared canonical local state')
assert(productSession.includes('publishLocalRow(next)') && productSession.includes("actorRole: 'instructor'"), 'accepted instructor patch must also broadcast the shared local state')
assert(productSession.includes('const rebased: ProductTeachingSessionRow<TState>'), 'cloud revision conflicts must rebase pending local state instead of discarding it')

if (!process.exitCode) console.log('Simulation local authority regression checks passed')
