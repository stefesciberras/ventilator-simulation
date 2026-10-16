import { APP_VERSION } from './appVersion'

export type ScenarioLogActor = 'system' | 'simulator' | 'instructor' | 'candidate'
export type ScenarioLogCategory = 'scenario' | 'stage' | 'trigger' | 'transition' | 'action' | 'measurement' | 'settings' | 'session' | 'diagnostic'

export interface ScenarioRuntimeContext {
  runId: string
  moduleId?: string
  scenarioId?: string
  scenarioName?: string
  stageId?: string
  stageIndex?: number
  stageName?: string
  branchId?: string
  triggerId?: string
}

export interface ScenarioLogEntry {
  id: string
  at: string
  appVersion: string
  loggerVersion: 2
  runId: string
  moduleId?: string
  scenarioId?: string
  scenarioName?: string
  stageId?: string
  stageIndex?: number
  stageName?: string
  branchId?: string
  triggerId?: string
  event: string
  category: ScenarioLogCategory
  actor: ScenarioLogActor
  simulationTimeSeconds?: number
  details: Record<string, unknown>
}

export interface ScenarioLogOptions {
  category?: ScenarioLogCategory
  actor?: ScenarioLogActor
  simulationTimeSeconds?: number
  context?: Partial<ScenarioRuntimeContext>
  details?: Record<string, unknown>
}

const SCENARIO_LOG_STORAGE_KEY = 'eduvent.scenario-diagnostic-log'
const SCENARIO_LOG_LIMIT = 1000
const RUN_ID_STORAGE_KEY = 'eduvent.scenario-run-id'

function randomId(prefix: string) {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${id}`
}

function initialRunId() {
  if (typeof window === 'undefined') return randomId('run')
  try {
    const existing = window.sessionStorage.getItem(RUN_ID_STORAGE_KEY)
    if (existing) return existing
    const created = randomId('run')
    window.sessionStorage.setItem(RUN_ID_STORAGE_KEY, created)
    return created
  } catch {
    return randomId('run')
  }
}

let runtimeContext: ScenarioRuntimeContext = { runId: initialRunId() }

export function getScenarioRuntimeContext(): ScenarioRuntimeContext {
  return { ...runtimeContext }
}

export function beginScenarioRun(context: Omit<Partial<ScenarioRuntimeContext>, 'runId'> = {}) {
  const runId = randomId('run')
  runtimeContext = { runId, ...context }
  if (typeof window !== 'undefined') {
    try { window.sessionStorage.setItem(RUN_ID_STORAGE_KEY, runId) } catch { /* non-critical */ }
  }
  return getScenarioRuntimeContext()
}

export function setScenarioRuntimeContext(context: Partial<ScenarioRuntimeContext>) {
  runtimeContext = { ...runtimeContext, ...context, runId: context.runId ?? runtimeContext.runId }
  return getScenarioRuntimeContext()
}

export function clearScenarioRuntimeContext(options: { preserveRunId?: boolean } = {}) {
  runtimeContext = { runId: options.preserveRunId === false ? randomId('run') : runtimeContext.runId }
  return getScenarioRuntimeContext()
}

export function readScenarioLogs(): ScenarioLogEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SCENARIO_LOG_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.slice(-SCENARIO_LOG_LIMIT).map((entry: Record<string, unknown>) => {
      if (entry.loggerVersion === 2) return entry as unknown as ScenarioLogEntry
      return {
        id: String(entry.id ?? randomId('log')),
        at: String(entry.at ?? new Date().toISOString()),
        appVersion: String(entry.appVersion ?? APP_VERSION),
        loggerVersion: 2 as const,
        runId: String(entry.runId ?? runtimeContext.runId),
        event: String(entry.event ?? 'legacy.event'),
        category: 'diagnostic' as const,
        actor: 'system' as const,
        details: entry.details && typeof entry.details === 'object' ? entry.details as Record<string, unknown> : {},
      }
    })
  } catch {
    return []
  }
}

export function appendStructuredScenarioLog(event: string, options: ScenarioLogOptions = {}) {
  if (typeof window === 'undefined') return
  try {
    const context = { ...runtimeContext, ...(options.context ?? {}) }
    const entry: ScenarioLogEntry = {
      id: randomId('log'),
      at: new Date().toISOString(),
      appVersion: APP_VERSION,
      loggerVersion: 2,
      runId: context.runId,
      moduleId: context.moduleId,
      scenarioId: context.scenarioId,
      scenarioName: context.scenarioName,
      stageId: context.stageId,
      stageIndex: context.stageIndex,
      stageName: context.stageName,
      branchId: context.branchId,
      triggerId: context.triggerId,
      event,
      category: options.category ?? 'diagnostic',
      actor: options.actor ?? 'system',
      simulationTimeSeconds: options.simulationTimeSeconds,
      details: options.details ?? {},
    }
    const next = [...readScenarioLogs(), entry].slice(-SCENARIO_LOG_LIMIT)
    window.localStorage.setItem(SCENARIO_LOG_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Scenario logging must never affect simulation execution.
  }
}

export function clearScenarioLogs() {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(SCENARIO_LOG_STORAGE_KEY) } catch { /* non-critical */ }
}
