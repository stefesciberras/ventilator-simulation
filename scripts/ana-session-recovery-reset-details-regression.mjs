import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const app = read('src/edumon/EdumonApp.tsx')
const state = read('src/edumon/teachingState.ts')
const shared = read('src/teaching/session/useProductTeachingSession.ts')
const transport = read('src/teaching/session/productSession.ts')
const bis = read('src/edumon/EdumonBisTrend.tsx')
const gas = read('src/edumon/EdumonAnaGasControl.tsx')
const sessionPanel = read('src/teaching/session/SharedSessionModePanel.tsx')

assert.ok(state.includes('resetRevision?: string'), 'EDUMON session model must carry reset revision')
assert.ok(app.includes('resetRevision, lastActionId:'), 'Canonical state must carry instructor reset revision')
assert.ok(app.includes('setResetRevision(revision)'), 'Instructor reset must produce a new revision')
assert.ok(app.includes('next.resetRevision !== observedResetRevisionRef.current'), 'Reset must apply once per new revision')
assert.ok(app.includes('window.dispatchEvent(new Event(LOPPJUSIM_SIMULATION_RESET_EVENT))'), 'Recipient must reset its derived local history')
assert.ok(bis.includes('setPoints([{ time: 0, value: 100 }])'), 'BIS history must clear on reset')
assert.ok(gas.includes('etSevoRef.current = 0') && gas.includes('setEtSevo(0)'), 'Candidate EtSevo must clear on reset')

assert.ok(shared.includes('repository.connectLocalForRole(row, nextRole)'), 'Session resume must use lifecycle actor role for local reconnection')
assert.ok(transport.includes('roleOverride ?? documentRole'), 'LAN transport must not rely on stale DOM role after refresh')
assert.ok(transport.includes('localTransportRole !== role'), 'Transport must rebuild on role change')
assert.ok(transport.includes('acceptLocalCandidatePatch(envelope.payload.command)'), 'Instructor LAN authority must accept candidate commands')

assert.ok(app.includes('window.addEventListener(LOPPJUSIM_OPEN_SESSIONS_EVENT, onOpenSessions)'), 'Anaesth Menu > Sessions must open the popup')
assert.ok(sessionPanel.includes("activeRuntimeMode === 'simulation' ? 'Simulation' : 'Teaching'"), 'Candidate details must show session mode')
assert.ok(sessionPanel.includes('Session key <strong>'), 'Candidate details must show key')
assert.ok(app.includes('selfDirected.run?.accessCode'), 'Self-directed details must show assignment key')
console.log('Anaesth instructor recovery, reset propagation and candidate session details regression checks passed')
