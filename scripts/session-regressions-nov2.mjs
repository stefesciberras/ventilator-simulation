import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Session regressions Nov 2: ${message}`)
    process.exitCode = 1
  }
}

const sharedSession = read('src/teaching/session/useSharedTeachingSession.ts')
const ventSession = read('src/session/useTeachingSession.ts')
const inviteRuntime = read('src/teaching/session/candidateInvitationRuntime.ts')
const accessPolicy = read('src/core/sessionAccessPolicy.ts')
const workspace = read('src/components/SimulationWorkspaceShell.tsx')
const platformMenu = read('src/components/LoppjuSimPlatformMenu.tsx')
const sessionControls = read('src/teaching/session/sessionControls.ts')
const productDashboard = read('src/teaching/session/productDashboard.tsx')
const edumonTopBar = read('src/edumon/EdumonTopBar.tsx')
const anaGas = read('src/edumon/EdumonAnaGasControl.tsx')

assert(!sharedSession.includes("await repository.updateSession(recovery.sessionId, { status: 'ended' }"), 'recoverable instructor sessions must never be auto-ended')
assert(sharedSession.includes('if (recoverableInstructor) return resumeInstructor(recoverableInstructor.sessionId)'), 'starting while recovery exists must resume the active instructor session')
assert(sharedSession.includes('Always let the server decide whether the room'), 'candidate resume must not trust a stale cached expiry')
assert(sharedSession.includes('persistCandidateRecovery(row)'), 'candidate recovery expiry must refresh from live session rows')
assert(sharedSession.includes("status: 'ended'"), 'explicit instructor End session must remain available')

assert(inviteRuntime.includes('LOPPJUSIM_OPEN_SESSIONS_EVENT'), 'invite link must open Sessions automatically')
assert(inviteRuntime.includes('window.setTimeout(requestSessionJoinUi'), 'invite link must request join UI after application mount')
assert(inviteRuntime.includes('form.requestSubmit()'), 'invite key must continue into the join flow automatically')

assert(ventSession.includes('dataset.loppjusimSessionRole = base.role'), 'Vent must publish its active role to shared access policy')
assert(ventSession.includes('dataset.loppjusimRuntimeMode = runtimeMode'), 'Vent must publish its runtime mode to shared access policy')
assert(ventSession.includes("roleRef.current === 'candidate' && runtimeModeRef.current === 'teaching'"), 'Teaching Vent candidate state must use candidate-local ventilator semantics')
assert(ventSession.includes('teachingCandidateVentilatorSeededRef.current'), 'Teaching Vent must seed instructor ventilator state once rather than continuously overwrite candidate state')
assert(accessPolicy.includes("case 'vent': return 'device-controls'"), 'Vent tab must remain candidate-accessible')
assert(accessPolicy.includes('patientControls: false'), 'candidate patient controls must remain hidden')
assert(accessPolicy.includes('physiologyControls: false'), 'candidate physiology controls must remain hidden')
assert(accessPolicy.includes('patientProfiles: false'), 'candidate profiles must remain hidden')
assert(accessPolicy.includes('teachingControls: false'), 'candidate Teaching tab must remain hidden')

assert(platformMenu.includes('loppjusimInstructorAuthenticated'), 'authenticated instructor state must be published to the workspace')
assert(workspace.includes('effectiveInstructorVisible'), 'workspace must enforce authenticated instructor-only view switching')
assert(workspace.includes("accessContext.role !== 'candidate'"), 'candidate must never enter Instructor view')

assert(sessionControls.includes('setInstructorSessionPaused'), 'pause must be a durable writable session control')
assert(sessionControls.includes('pause_revision: current.pauseRevision + 1'), 'pause changes must increment their revision')
assert(productDashboard.includes('publishLocalSessionControlPatch(sessionId, { paused })'), 'dashboard Pause all must use LAN-first global pause')
assert(edumonTopBar.includes('publishLocalSessionControlPatch(effectiveSessionId, { paused })'), 'top-bar pause must use LAN-first global pause')
assert(edumonTopBar.includes('subscribeSessionControlSnapshot'), 'candidate monitor must hydrate durable pause')
assert(edumonTopBar.includes("payload.update.patch.paused"), 'candidate monitor must accept local pause fast-path')

assert(anaGas.includes('LOPPJUSIM_SIMULATION_RESET_EVENT'), 'anaesthetic gas runtime must listen to cold reset')
assert(anaGas.includes('etSevoRef.current = 0'), 'cold reset must clear EtSevo model history')
assert(anaGas.includes('setEtSevo(0)'), 'cold reset must clear displayed EtSevo')
assert(anaGas.includes('setTofReading(null)'), 'cold reset must clear TOF history')

if (!process.exitCode) console.log('Session regression fixes (Nov 2) passed')
