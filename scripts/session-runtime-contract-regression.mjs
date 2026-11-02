import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Session runtime regression: ${message}`)
    process.exitCode = 1
  }
}

const runtimeModes = read('src/core/runtimeModes.ts')
const runtimeDocs = read('docs/LOPPJUSIM_RUNTIME_MODES_V2.md')
const durabilityMigration = read('supabase/migrations/20261102_durable_session_recovery_window.sql')
const sharedSession = read('src/teaching/session/useSharedTeachingSession.ts')
const selfDirected = read('src/teaching/scenario/useSharedSelfDirectedScenario.ts')
const candidatePresentation = read('scripts/candidate-presentation-regression.mjs')

// Four canonical user-facing modes.
for (const mode of ['standalone', 'simulation', 'teaching', 'self-directed']) {
  assert(runtimeModes.includes(`'${mode}'`), `Core runtime contract must include ${mode}`)
}
assert(runtimeModes.includes("sessionKind: 'none'"), 'Standalone must remain sessionless')
assert(runtimeModes.includes("logicalRuntime: 'shared-authoritative'"), 'Simulation must retain one shared authoritative runtime')
assert(runtimeModes.includes("candidateToInstructorSync: true"), 'Simulation candidate changes must feed the shared authority')
assert(runtimeModes.includes("logicalRuntime: 'per-candidate'"), 'Teaching/self-directed must retain independent learner runtimes')
assert(runtimeModes.includes("dynamicScenarioPolicy: 'authenticated'"), 'Standalone dynamic scenarios must be authentication-gated')
assert(runtimeModes.includes("dynamicScenarioPolicy: 'required'"), 'Self-directed learning must be driven by a dynamic scenario')
assert(runtimeModes.includes('SessionControlState'), 'Core must distinguish persistent instructor-global session controls')
assert(runtimeModes.includes('InstructorPointerState'), 'Core must distinguish ephemeral instructor presentation state')

// Self-directed mode reuses the established assignment/run path rather than creating a second system.
assert(selfDirected.includes('startSelfDirectedRun'), 'Self-directed runtime must retain existing assignment launch infrastructure')
assert(selfDirected.includes('updateSelfDirectedRun'), 'Self-directed runtime must retain existing run persistence')

// Durable live-session semantics: expiry is sliding inactivity, not a fixed creation lifetime.
assert(durabilityMigration.includes("greatest(expires_at, now() + interval '2 hours')"), 'connected participant heartbeats must extend the recovery deadline')
assert(durabilityMigration.includes('touch_instructor_session'), 'instructor heartbeat must keep the session recoverable')
assert(durabilityMigration.includes('touch_edusim_session_member'), 'candidate heartbeat must keep product sessions recoverable')
assert(durabilityMigration.includes('touch_session_member'), 'legacy MV candidate heartbeat must retain durable recovery semantics')
assert(!durabilityMigration.includes("new.expires_at := new.created_at + interval '2 hours'"), 'new lifecycle migration must not restore fixed creation-time expiry')

// Explicit instructor termination remains the authoritative live-room stop path.
assert(sharedSession.includes("{ status: 'ended' }"), 'instructor End Session must continue to persist ended status')
assert(runtimeDocs.includes('Instructor -> End Session -> session status = ended'), 'canonical docs must state explicit instructor termination')
assert(runtimeDocs.includes('inactivity/recovery deadline'), 'canonical docs must distinguish expiry from explicit termination')
assert(runtimeDocs.includes('Refreshing or reconnecting'), 'canonical docs must protect refresh/reconnect semantics')

// Existing candidate restrictions and invitation flow are protected by their dedicated regression suite.
assert(candidatePresentation.includes('candidate invitation'), 'candidate invitation regression coverage must remain installed')
assert(candidatePresentation.includes('candidate control restriction'), 'candidate restricted-control regression coverage must remain installed')

if (!process.exitCode) console.log('Session runtime contract regression checks passed')
