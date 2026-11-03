import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Simulation authority regressions Nov 3: ${message}`)
    process.exitCode = 1
  }
}

const workspace = read('src/edumon/EdumonWorkspacePanel.tsx')
const ventilator = read('src/edumon/EdumonVentilatorControl.tsx')
const ventilatorCss = read('src/edumon/edumon-ventilator.css')
const productSession = read('src/teaching/session/productSession.ts')

assert(workspace.includes('edumon-instructor-ventilator-host'), 'Instructor View must expose an explicit ventilator host')
assert(ventilator.includes(".shared-instructor-console-controls .edumon-instructor-ventilator-host"), 'ventilator strip must target the visible Instructor View host')
assert(ventilatorCss.includes('.shared-instructor-console-controls .edumon-instructor-ventilator-host'), 'Instructor View ventilator host must be visible and styled')

assert(ventilator.includes('anaestheticGases: { fiSevoPercent: 0 }'), 'Reset Simulation must write FiSevo zero into authoritative patient state')
assert(!ventilator.includes('anaestheticGases: undefined'), 'Reset must not omit anaesthetic gases from the shared Simulation patch')

assert(productSession.includes('applyAuthoritativeCandidateActionPatch'), 'Simulation authority must explicitly apply candidate ActionRuntime state')
assert(productSession.includes("command.actorRole !== 'candidate' || command.type !== 'product.state.patch'"), 'candidate authority application must remain behind validated candidate Simulation commands')
assert(productSession.includes('applyReplicatedEdumonActionSnapshot(snapshot as ActionRuntimeSnapshot)'), 'validated candidate drug snapshot must be applied to instructor ActionRuntime')
assert(productSession.includes('const patch = filterCandidateSimulationPatch(rawPatch)'), 'candidate action patch must remain filtered by the canonical candidate allow-list')
assert(productSession.indexOf('applyAuthoritativeCandidateActionPatch(patch)') > productSession.indexOf('const patch = filterCandidateSimulationPatch(rawPatch)'), 'authority must apply only the filtered candidate patch')

if (!process.exitCode) console.log('Simulation authority regressions (Nov 3) passed')
