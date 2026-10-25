import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Session log regression: ${message}`)
    process.exitCode = 1
  }
}

const sharedTab = read('src/teaching/SharedTeachingTab.tsx')
const panel = read('src/teaching/TeachingSessionLogPanel.tsx')
const service = read('src/teaching/session/sessionLog.ts')
const actionRuntime = read('src/edusim/actions/ActionRuntime.ts')
const alarms = read('src/alarms/useSharedAlarmController.ts')
const display = read('src/components/useSimulationDisplayControls.ts')
const oxygen = read('src/teaching/useTeachingSharedOxygenFlush.ts')
const instructorControls = read('src/components/InstructorAccountControls.tsx')
const productSession = read('src/teaching/session/useProductTeachingSession.ts')
const storageMigration = read('supabase/migrations/20261025_session_log_entries.sql')
const changeMigration = read('supabase/migrations/20261025_session_log_change_triggers.sql')
const membershipMigration = read('supabase/migrations/20261025_session_log_membership_and_end_events.sql')
const guide = read('src/edumon/ACTIONS_AND_EFFECTS_GUIDE.md')
const prompt = read('src/edumon/ACTIONS_AND_EFFECTS_AI_PROMPT.md')

assert(sharedTab.includes('TeachingSessionLogPanel'), 'shared Teaching tab must render Session Log')
assert(!sharedTab.includes('TeachingScenarioLogPanel'), 'shared Teaching tab must not render old Scenario Log panel')
assert(sharedTab.includes('<TeachingSessionLogPanel productId={host.appId} sessionId={sessionId} />'), 'Session Log must sit outside instructor-account gating so standalone can see it')
assert(panel.includes('<h3>Session Log</h3>'), 'panel must be named Session Log')
assert(panel.includes('-session-log-${stamp}.csv'), 'CSV export must use session-log filename')
assert(panel.includes('fetchStandaloneSessionLogEntries'), 'panel must load standalone local entries')
assert(panel.includes('subscribeToStandaloneSessionLogEntries'), 'panel must update live in standalone mode')
assert(panel.includes('local only'), 'standalone UI must disclose that the log is local only')

assert(service.includes("from('edusim_session_log_entries')"), 'client must persist teaching-session logs to shared table')
assert(service.includes("event: 'INSERT'"), 'client must subscribe to inserted teaching-session log rows')
assert(service.includes('window.sessionStorage'), 'standalone Session Log must remain browser-local')
assert(service.includes('MAX_STANDALONE_LOG_ENTRIES = 2000'), 'standalone log must be bounded')
assert(service.includes("actor_role: 'standalone'"), 'standalone entries must identify their actor role')
assert(service.includes('appendStandalone'), 'standalone events must not require Supabase')
assert(productSession.includes('configureSessionLogRuntime'), 'generic EDUMON sessions must configure Session Log context')
assert(productSession.includes("eventType: 'standalone.settings.changed'"), 'EDUMON standalone setting changes must be logged')

assert(actionRuntime.includes('recordSessionLogEvent'), 'Drug/Event runtime must mirror interactions to Session Log')
assert(actionRuntime.includes("category = entry.actionKind === 'drug' ? 'drug' : 'event'"), 'Drugs and Events must retain separate Session Log categories')
assert(alarms.includes("eventType: 'alarm.activated'"), 'alarm activation must be logged')
assert(alarms.includes("eventType: 'alarm.resolved'"), 'alarm resolution must be logged')
assert(alarms.includes("eventType: 'alarm.silenced'"), 'alarm silence must be logged')
assert(alarms.includes('sessionId: sessionId ?? undefined'), 'alarm logging must fall back to standalone local logging')
assert(display.includes("'display.freeze'"), 'freeze action must be logged')
assert(display.includes('sessionId: sessionId ?? undefined'), 'display actions must log in standalone mode')
assert(instructorControls.includes("'oxygen-flush': 'Oxygen flush'"), 'oxygen flush must be logged')
assert(instructorControls.includes("nebulisation: 'Nebuliser activated'"), 'nebuliser must be logged')
assert(instructorControls.includes("'inspiratory-hold': 'Inspiratory hold'"), 'inspiratory hold must be logged')
assert(instructorControls.includes("'expiratory-hold': 'Expiratory hold'"), 'expiratory hold must be logged')
assert(instructorControls.includes("role !== 'instructor' && role !== 'standalone'"), 'EDUVENT device actions must log for instructor and standalone roles')
assert(instructorControls.includes("eventType: 'standalone.settings.changed'"), 'EDUVENT standalone patient/ventilator/alarm settings must be logged')
assert(oxygen.includes("eventType: 'oxygen_flush.stopped'"), 'shared oxygen flush stop must be logged without duplicating its start')

assert(storageMigration.includes('create table if not exists public.edusim_session_log_entries'), 'migration must create durable session log table')
assert(storageMigration.includes('enable row level security'), 'teaching Session Log must use RLS')
assert(storageMigration.includes('private.is_teaching_session_member(session_id)'), 'insert policy must require session membership')
assert(storageMigration.includes('private.is_teaching_session_instructor(session_id)'), 'instructor must be authorized to read complete log')
assert(changeMigration.includes('log_teaching_session_changes'), 'instructor settings changes must be database logged')
assert(changeMigration.includes("'instructor.ventilator.changed'"), 'instructor ventilator changes must be logged')
assert(changeMigration.includes('log_candidate_session_changes'), 'candidate state changes must be database logged')
assert(changeMigration.includes("'candidate.ventilator.changed'"), 'candidate ventilator changes must be logged')
assert(membershipMigration.includes('log_session_member_join'), 'session/candidate join events must be logged')
assert(membershipMigration.includes("new.last_scenario_action <> 'freeze-waveform'"), 'candidate freeze must not duplicate shared freeze logging')

for (const [name, text] of [['guide', guide], ['prompt', prompt]]) {
  for (const phrase of ['Session Log', 'edusim_session_log_entries', 'Drug/Event', 'standalone', 'sessionStorage', 'local only']) {
    assert(text.includes(phrase), `${name} must document ${phrase}`)
  }
}

if (!process.exitCode) console.log('Session log regression checks passed')
