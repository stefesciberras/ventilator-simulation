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
const edumon = read('src/edumon/EdumonApp.tsx')
const eduvent = read('src/App.tsx')

assert(recoveryUiState.includes("searchParams.get('session')"), 'candidate invitation URLs must suppress instructor recovery in the invitation tab')
assert(recoveryUiState.includes('candidateInvitationActive'), 'session recovery must explicitly recognise candidate invitation intent')
assert(sharedSessionPanel.includes('onJoinCandidate(key, displayName.trim())'), 'candidate launcher must continue to execute the shared join path')
assert(edumon.includes('<TeachingCandidateOverlay'), 'Anaesth/ITU candidate question overlay must remain mounted at simulator root')
assert(edumon.includes('<TeachingMediaCandidateOverlay'), 'Anaesth/ITU candidate media overlay must remain mounted at simulator root')
assert(eduvent.includes('<TeachingCandidateOverlay'), 'MV candidate question overlay must remain mounted at simulator root')
assert(eduvent.includes('<TeachingMediaCandidateOverlay'), 'MV candidate media overlay must remain mounted at simulator root')

if (!process.exitCode) console.log('Candidate join and presentation regression checks passed')
