import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Session access policy regression: ${message}`)
    process.exitCode = 1
  }
}

const policy = read('src/core/sessionAccessPolicy.ts')
const framework = read('src/components/SimulationControlFramework.tsx')
const productSession = read('src/teaching/session/productSession.ts')
const actionPermissions = read('src/edumon/sessionActionPermissions.ts')

for (const stateClass of ['patient-model', 'session-control', 'presentation-broadcast', 'local-view']) {
  assert(policy.includes(`'${stateClass}'`), `Core must define ${stateClass} state class`)
}
assert(policy.includes("simulationSync: 'canonical-shared'"), 'patient/model state must be canonical-shared in Simulation')
assert(policy.includes("teachingSync: 'instructor-to-candidates'"), 'instructor-authoritative state must broadcast in Teaching')
assert(policy.includes("simulationSync: 'local-only'"), 'local view state must remain local in Simulation')
assert(policy.includes("actionAccess: 'permission-gated'"), 'restricted learners must not receive unrestricted Actions')
assert(policy.includes('patientControls: false'), 'restricted learners must not receive Patient controls')
assert(policy.includes('physiologyControls: false'), 'restricted learners must not receive Physiology controls')
assert(policy.includes('patientProfiles: false'), 'restricted learners must not receive Patient Profiles')
assert(policy.includes('teachingControls: false'), 'restricted learners must not receive Teaching controls')
assert(policy.includes('instructorView: false'), 'restricted learners must not receive Instructor view')
assert(policy.includes('sessionControls: false'), 'restricted learners must not receive instructor session controls')
assert(policy.includes('sessionTermination: false'), 'restricted learners must not end live sessions')
assert(policy.includes('deviceControls: true'), 'restricted learners may retain approved product device controls')
assert(policy.includes('anaestheticGasControls: true'), 'restricted learners may retain approved anaesthetic gas controls')
assert(policy.includes('waveformVisibilityControls: true'), 'restricted learners may retain permitted local display controls')
assert(policy.includes('localWaveformFreeze: true'), 'restricted learners may freeze their local waveform display')
assert(policy.includes('return globalFrozen || localFrozen'), 'instructor-global waveform freeze must dominate local candidate state')

assert(framework.includes('readParticipantAccessContextFromDocument'), 'shared control framework must consume the Core access policy')
assert(framework.includes('accessPolicy.patientProfiles'), 'profile visibility must derive from Core access policy')
assert(framework.includes('accessPolicy.sessionControls'), 'session footer visibility must derive from Core access policy')
assert(productSession.includes('readParticipantAccessContextFromDocument'), 'Simulation mutation actor role must derive from the same Core participant context')
assert(actionPermissions.includes('list_edusim_candidate_action_permissions'), 'per-Action permission backend must remain in place')

if (!process.exitCode) console.log('Session access policy regression checks passed')
