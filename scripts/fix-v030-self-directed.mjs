import fs from 'node:fs'

function replaceOnce(path, needle, replacement) {
  const before = fs.readFileSync(path, 'utf8')
  const index = before.indexOf(needle)
  if (index < 0) throw new Error(`Missing anchor in ${path}: ${needle.slice(0, 100)}`)
  const after = before.slice(0, index) + replacement + before.slice(index + needle.length)
  fs.writeFileSync(path, after)
}

replaceOnce(
  'src/components/DynamicScenarioBuilder.tsx',
  "      const result = await createSelfDirectedAssignment(selectedPreset.name, selectedPreset.scenario, assignmentExpiryValue * multiplier)\n",
  "      const result = await createSelfDirectedAssignment(selectedPreset.name, selectedPreset.scenario, Math.min(365, assignmentExpiryValue * multiplier))\n",
)

replaceOnce(
  'src/components/InstructorAccountControls.tsx',
  `<button type="button" className="dynamic-runtime-primary" disabled={index>=stages.length-1} title={selfDirectedRun ? 'Continue to the next stage; automatic triggers remain armed' : manualTrigger ? 'Advance manually; automatic triggers remain armed' : 'Advance to the next stage now'} onClick={()=>loadDynamicStage(activeRuntimePreset,index+1)}>{selfDirectedRun ? (index>=stages.length-1 ? 'Completed' : 'Continue') : manualTrigger ? 'Manual trigger' : 'Advance now'}</button>`,
  `<button type="button" className="dynamic-runtime-primary" disabled={index>=stages.length-1 || Boolean(selfDirectedRun && !manualTrigger)} title={selfDirectedRun ? (manualTrigger ? 'Continue to the next stage; automatic triggers remain armed' : 'This stage advances automatically when its trigger is met') : manualTrigger ? 'Advance manually; automatic triggers remain armed' : 'Advance to the next stage now'} onClick={()=>loadDynamicStage(activeRuntimePreset,index+1)}>{selfDirectedRun ? (index>=stages.length-1 ? 'Completed' : manualTrigger ? 'Continue' : 'Waiting…') : manualTrigger ? 'Manual trigger' : 'Advance now'}</button>`,
)

const migrationPath = 'supabase/migrations/20261017_self_directed_assignments.sql'
let sql = fs.readFileSync(migrationPath, 'utf8')
const policyAnchor = `alter table public.self_directed_assignments enable row level security;\nalter table public.self_directed_runs enable row level security;\n\n`
if (!sql.includes(policyAnchor)) throw new Error('Missing policy anchor')
sql = sql.replace(policyAnchor, `${policyAnchor}drop policy if exists "Instructors can read own self-directed assignments" on public.self_directed_assignments;\ndrop policy if exists "Instructors can update own self-directed assignments" on public.self_directed_assignments;\ndrop policy if exists "Instructors can delete own self-directed assignments" on public.self_directed_assignments;\ndrop policy if exists "Candidates can read own self-directed runs" on public.self_directed_runs;\n\n`)
fs.writeFileSync(migrationPath, sql)

console.log('v0.3 refinements applied')
