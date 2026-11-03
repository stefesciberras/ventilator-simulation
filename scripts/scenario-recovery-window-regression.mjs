import fs from 'node:fs'

const runtime = fs.readFileSync(new URL('../src/teaching/scenario/runtimeCore.ts', import.meta.url), 'utf8')
const domain = fs.readFileSync(new URL('../src/teaching/scenario/domain.ts', import.meta.url), 'utf8')

function expectContains(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message)
}

expectContains(runtime, 'SCENARIO_RECOVERY_AUTO_RESUME_MS = 5 * 60 * 1000', 'Scenario recovery must auto-resume only within 5 minutes.')
expectContains(runtime, 'SCENARIO_RECOVERY_EXPIRY_MS = 60 * 60 * 1000', 'Scenario recovery must expire after 1 hour.')
expectContains(runtime, 'lastActivityAt: number', 'Scenario recovery must persist meaningful activity time.')
expectContains(runtime, 'persisted.version !== 2', 'Legacy recovery records without bounded recovery metadata must be discarded.')
expectContains(runtime, 'ageMs > SCENARIO_RECOVERY_EXPIRY_MS', 'Recovery older than one hour must be discarded.')
expectContains(runtime, 'ageMs > SCENARIO_RECOVERY_AUTO_RESUME_MS', 'Recovery older than five minutes must not auto-resume.')
expectContains(runtime, 'window.confirm(', 'Recovery between five minutes and one hour must ask before resuming.')
expectContains(runtime, 'Resume with the saved patient/device parameters and this stage?', 'Recovery prompt must explain that saved live parameters and stage will be restored.')
expectContains(runtime, 'adapter.captureRecoveryState?.() ?? latestContextRef.current ?? undefined', 'Recovery must checkpoint the actual product runtime state.')
expectContains(runtime, 'adapter.restoreRecoveryState', 'Product-specific live recovery hooks must be supported.')
expectContains(runtime, 'Checkpoint live parameters without extending lastActivityAt.', 'Periodic checkpoints must not extend the recovery age.')
expectContains(runtime, 'lastActivityAtRef.current = persisted.lastActivityAt', 'Restoring a scenario must preserve the original last-activity clock.')
expectContains(runtime, "'state' in persisted.recoveryState", 'EDUMON live-state fallback must be recoverable.')
expectContains(runtime, "'current' in persisted.recoveryState", 'Vent live-state fallback must be recoverable.')
expectContains(domain, 'captureRecoveryState?: () => unknown', 'Scenario adapters must support capturing product live state.')
expectContains(domain, 'restoreRecoveryState?:', 'Scenario adapters must support restoring product live state.')

console.log('Scenario recovery window regression passed.')
