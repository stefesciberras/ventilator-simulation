import fs from 'node:fs'
import assert from 'node:assert/strict'

const lifecycle = fs.readFileSync('src/teaching/session/useSharedTeachingSession.ts', 'utf8')
const topbar = fs.readFileSync('src/components/SimulationTopBar.tsx', 'utf8')

const retirement = lifecycle.slice(lifecycle.indexOf('const retireRecoverableInstructor ='), lifecycle.indexOf('const startInstructor ='))
assert.ok(retirement.includes('await repository.ensureIdentity()'), 'Replacement must require an authenticated identity')
assert.ok(retirement.includes('await repository.fetchSession(recovery.sessionId)'), 'Replacement must verify the recovered room')
assert.ok(retirement.includes("await repository.updateSession(row.id, { status: 'ended' }"), 'Explicit replacement must end the old session on the server')
assert.ok(retirement.indexOf("await repository.updateSession") < retirement.indexOf('clearInstructorRecoveryStorage(storageNamespace)'), 'Do not clear recovery until after remote termination')
assert.ok(retirement.includes("ended.status !== 'ended'"), 'Do not report success without confirmed termination')
assert.ok(retirement.includes('catch (cause)'), 'Failed replacement must preserve recoverability')
assert.ok(lifecycle.includes('startNewSession: () => retireRecoverableInstructor(found)'), 'Recovery UI must invoke the real retirement action')
assert.ok(topbar.includes('await sessionRecovery.startNewSession()'), 'Top bar must wait for successful retirement before resetting')
assert.ok(topbar.includes('await resetSimulation(publicBrandKicker)'), 'A new session starts from clean simulator defaults')
assert.ok(lifecycle.includes("if (recoverableInstructor) return resumeInstructor(recoverableInstructor.sessionId)"), 'Ordinary start must not silently retire an active room')
console.log('Explicit recovered-session replacement regression checks passed')
