/**
 * Session-scoped, trusted Anaesth ActionDefinition catalogue for the opt-in
 * Cloudflare Session v2 authority. Never take definitions from WebSocket clients.
 *
 * A catalogue is loaded ONCE on room creation, validated, then pinned to DO
 * storage. Its versioned definitions are reused on recovery even if Supabase
 * definitions change in the meantime. Existing v1.3.0.11 pilot rooms continue
 * with their original curated definitions rather than silently changing doses.
 */
import { createAnaesthDeclarativeActionEvaluator } from './actionEffects.mjs'
import { getAnaesthV2PilotDefinitions } from './anaesthPilot.mjs'

const TARGETS = new Set([
  'haemodynamics.heartRate', 'haemodynamics.meanArterialPressure',
  'respiration.drive', 'respiration.airwayObstruction', 'neuromuscular.block',
  'neuromuscular.tofMinimumCount', 'anaesthesia.hypnoticEffect',
  'anaesthesia.nociceptiveResponse', 'stimulus.sympathetic',
])
const OPS = new Set(['offset', 'set', 'multiplier', 'target', 'increment', 'constraint', 'trigger'])
const CONSTRAINTS = new Set(['block-increase', 'block-decrease', 'minimum', 'maximum'])
const ID = /^[a-zA-Z0-9._-]{1,100}$/
const MAX_ACTIONS = 100
const finite = n => typeof n === 'number' && Number.isFinite(n)
const copy = value => structuredClone(value)
const fail = reason => { throw Error(reason) }

export function validateAnaesthV2Library(rows, source = 'supabase') {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ACTIONS) fail('invalid-action-catalogue')
  const definitions = []
  const ids = new Set()
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !ID.test(row.id) || ids.has(row.id) ||
      typeof row.name !== 'string' || !row.name.trim() || row.name.length > 120 ||
      !['ana','all'].includes(row.setting) ||
      !['drug','event'].includes(row.kind) ||
      !['momentary','toggle'].includes(row.short_press_action) ||
      !['allowed','instructor-only','scenario',undefined].includes(row.candidate_access) ||
      !Array.isArray(row.effects) || row.effects.length > 24) fail('invalid-action-definition')
    const effectIds = new Set()
    const effects = row.effects.map(effect => {
      if (!effect || !ID.test(effect.id) || effectIds.has(effect.id) ||
        !TARGETS.has(effect.target) || !OPS.has(effect.operation) ||
        !finite(effect.value) ||
        ![effect.onsetSeconds,effect.durationSeconds,effect.recoverySeconds].every(n => finite(n) && n >= 0 && n <= 86400) ||
        (effect.priority != null && (!finite(effect.priority) || effect.priority < -1000 || effect.priority > 1000)) ||
        (effect.operation === 'constraint' && !CONSTRAINTS.has(effect.constraint)) ||
        (effect.releaseBehaviour != null && !['recover','persist'].includes(effect.releaseBehaviour))) {
        fail('invalid-action-effect')
      }
      effectIds.add(effect.id)
      return { id: effect.id, target: effect.target, operation: effect.operation,
        value: effect.value, onsetSeconds: effect.onsetSeconds,
        durationSeconds: effect.durationSeconds, recoverySeconds: effect.recoverySeconds,
        ...(effect.priority == null ? {} : { priority: effect.priority }),
        ...(effect.constraint == null ? {} : { constraint: effect.constraint }),
        ...(effect.releaseBehaviour == null ? {} : { releaseBehaviour: effect.releaseBehaviour }),
      }
    })
    ids.add(row.id)
    definitions.push({
      id: row.id, name: row.name.trim(), setting: row.setting, kind: row.kind,
      short_press_action: row.short_press_action,
      candidate_access: row.candidate_access ?? 'instructor-only',
      priority: finite(row.priority) ? row.priority : 30,
      effects,
    })
  }
  if (!['supabase','legacy-pilot-v1','pilot-fallback-v1'].includes(source)) fail('invalid-catalogue-source')
  return { schema: 'loppjusim.session-v2.ana-action-library', version: 1,
    source, definitions }
}
export function validatePinnedAnaesthV2Library(value) {
  if (!value || value.schema !== 'loppjusim.session-v2.ana-action-library' ||
    value.version !== 1) fail('unsupported-action-catalogue')
  return validateAnaesthV2Library(value.definitions, value.source)
}
export function legacyAnaesthV2Library() {
  return validateAnaesthV2Library(getAnaesthV2PilotDefinitions(), 'legacy-pilot-v1')
}
export function anaesthV2EvaluatorFromLibrary(library) {
  const catalogue = validatePinnedAnaesthV2Library(library)
  const definitions = new Map(catalogue.definitions.map(d => [d.id, d]))
  return createAnaesthDeclarativeActionEvaluator({ getDefinition: id => definitions.get(id) ?? null })
}
export function publicAnaesthV2Library(library) {
  const verified = validatePinnedAnaesthV2Library(library)
  return { version: verified.version, source: verified.source,
    actions: verified.definitions.map(d => ({ id: d.id, name: d.name, kind: d.kind,
      candidateAccess: d.candidate_access, mode: d.short_press_action })) }
}

/**
 * Only the Durable Object, never a browser, invokes this. Uses an explicit
 * server-side Supabase read credential (RLS-scoped read key is preferable to
 * a service-role key). On an invalid response or network error FAIL CLOSED.
 */
export async function loadAnaesthV2Library(env, fetcher = fetch) {
  const url = env?.SESSION_V2_ACTIONS_SUPABASE_URL
  const key = env?.SESSION_V2_ACTIONS_SUPABASE_KEY
  if (!url && !key) {
    return validateAnaesthV2Library(getAnaesthV2PilotDefinitions(), 'pilot-fallback-v1')
  }
  if (typeof url !== 'string' || typeof key !== 'string' || !url || !key ||
      !/^https:\/\//.test(url) || key.length < 16) fail('action-library-config-invalid')
  const origin = new URL(url)
  if (origin.username || origin.password || origin.search || origin.hash) fail('action-library-config-invalid')
  const endpoint = new URL('/rest/v1/edusim_action_definitions', origin)
  endpoint.searchParams.set('select', 'id,name,setting,kind,short_press_action,candidate_access,priority,effects')
  endpoint.searchParams.set('setting', 'in.(ana,all)')
  endpoint.searchParams.set('limit', String(MAX_ACTIONS+1))
  const response = await fetcher(endpoint.toString(), {
    method: 'GET',
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  })
  if (!response.ok) fail('action-library-fetch-failed')
  const rows = await response.json()
  return copy(validateAnaesthV2Library(rows, 'supabase'))
}
