import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Candidate presentation regression: ${message}`)
    process.exitCode = 1
  }
}

const recoveryUiState = read('src/teaching/session/sessionRecoveryUiState.ts')
const sharedSessionPanel = read('src/teaching/session/SharedSessionModePanel.tsx')
const candidateInvitationRuntime = read('src/teaching/session/candidateInvitationRuntime.ts')
const controlFramework = read('src/components/SimulationControlFramework.tsx')
const edumonActions = read('src/edumon/EdumonActionsPanel.tsx')
const main = read('src/main.tsx')
const edumon = read('src/edumon/EdumonApp.tsx')
const eduvent = read('src/App.tsx')

assert(recoveryUiState.includes("searchParams.get('session')"), 'candidate invitation URLs must suppress instructor recovery in the invitation tab')
assert(recoveryUiState.includes('candidateInvitationActive'), 'session recovery must explicitly recognise candidate invitation intent')
assert(sharedSessionPanel.includes('onJoinCandidate(key, displayName.trim())'), 'manual candidate launcher must continue to execute the shared join path')
assert(candidateInvitationRuntime.includes("form.requestSubmit()"), 'keyed teaching invitations must automatically submit the candidate join form')
assert(candidateInvitationRuntime.includes("data-candidate-name-prompt"), 'a keyed invitation must request the candidate name after joining')
assert(candidateInvitationRuntime.includes("join_edusim_session"), 'candidate name capture must update the existing candidate membership')
assert(main.includes('installCandidateInvitationRuntime()'), 'candidate invitation bootstrap must run for simulator routes')

// candidate control restriction: capability-based filtering must remain shared and product-neutral.
assert(controlFramework.includes('readParticipantAccessContextFromDocument'), 'shared control framework must use the Core participant access context')
assert(controlFramework.includes('participantCanAccess(accessPolicy, capability)'), 'candidate tabs must be filtered by shared capability policy')
assert(controlFramework.includes('defaultControlTabAccessCapability(String(tab.id))'), 'legacy shared tabs must resolve through the canonical capability map')
assert(controlFramework.includes('const visibleProfiles = accessPolicy.patientProfiles ? profiles : []'), 'patient profiles must be hidden according to the shared access policy')
assert(controlFramework.includes('footer && accessPolicy.sessionControls'), 'candidate control surface must not expose instructor/session footer controls')
assert(edumonActions.includes("definition.candidate_access === 'allowed' || candidatePermissions.has(definition.id)"), 'candidate Actions must use the existing action permission model')
assert(edumonActions.includes("definitions.filter(candidateCanUse)"), 'candidate Actions must hide actions that are not permitted')

assert(edumon.includes('<TeachingCandidateOverlay'), 'Anaesth/ITU candidate question overlay must remain mounted at simulator root')
assert(edumon.includes('<TeachingMediaCandidateOverlay'), 'Anaesth/ITU candidate media overlay must remain mounted at simulator root')
assert(eduvent.includes('<TeachingCandidateOverlay'), 'MV candidate question overlay must remain mounted at simulator root')
assert(eduvent.includes('<TeachingMediaCandidateOverlay'), 'MV candidate media overlay must remain mounted at simulator root')

if (!process.exitCode) console.log('Candidate join, control access and presentation regression checks passed')
