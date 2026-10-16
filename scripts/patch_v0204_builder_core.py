from pathlib import Path
p=Path('src/components/DynamicScenarioBuilder.tsx')
s=p.read_text()
def r(old,new):
 global s
 if old not in s: raise SystemExit('missing: '+old[:100])
 s=s.replace(old,new,1)

r("""  deleteInstructorPreset,
  updateInstructorPreset,
""","""  deleteInstructorPreset,
  dynamicStageTriggers,
  updateInstructorPreset,
""")
r("import './DynamicScenarioBuilder.css'\n","import { SCENARIO_BUILDER_VERSION } from '../scenario-builder/version'\nimport './DynamicScenarioBuilder.css'\n")
r("""const defaultAdvanceTrigger = (): DynamicScenarioTrigger => ({ type: 'manual' })

function triggerSummary(trigger: DynamicScenarioTrigger | undefined) {
  const value = trigger ?? defaultAdvanceTrigger()
  if (value.type === 'manual') return 'Manual · instructor proceeds'
  if (value.type === 'time') return `After ${value.seconds}s in stage`
  if (value.type === 'condition') {
    const metric = CONDITION_METRICS.find((item) => item.value === value.metric)
    const operator = value.operator === 'lt' ? '<' : value.operator === 'gt' ? '>' : '='
    return `${metric?.label ?? value.metric} ${operator} ${value.value}${metric?.unit ? ` ${metric.unit}` : ''}`
  }
  const field = VENT_FIELDS.find((item) => item.key === value.parameter)
  const actor = value.actor === 'either' ? 'candidate or instructor' : value.actor
  return `${field?.label ?? String(value.parameter)} changed by ${actor}`
}
""","""const defaultAdvanceTrigger = (): DynamicScenarioTrigger => ({ type: 'manual' })
const SCENARIO_FILE_SCHEMA = 'eduvent-scenario-file-v1'

interface PortableScenarioFile {
  fileSchema: typeof SCENARIO_FILE_SCHEMA
  exportedAt: string
  scenarioBuilderVersion: string
  name: string
  scenario: InstructorScenarioSnapshot
}

function defaultTriggerForType(type: DynamicScenarioTrigger['type']): DynamicScenarioTrigger {
  if (type === 'manual') return { type: 'manual' }
  if (type === 'time') return { type: 'time', seconds: 30 }
  if (type === 'condition') return { type: 'condition', metric: 'oxygenSaturation', operator: 'lt', value: 90 }
  return { type: 'action', parameter: 'fio2', actor: 'either' }
}

function singleTriggerSummary(value: DynamicScenarioTrigger) {
  if (value.type === 'manual') return 'Manual'
  if (value.type === 'time') return `After ${value.seconds}s in stage`
  if (value.type === 'condition') {
    const metric = CONDITION_METRICS.find((item) => item.value === value.metric)
    const operator = value.operator === 'lt' ? '<' : value.operator === 'gt' ? '>' : '='
    return `${metric?.label ?? value.metric} ${operator} ${value.value}${metric?.unit ? ` ${metric.unit}` : ''}`
  }
  const field = VENT_FIELDS.find((item) => item.key === value.parameter)
  const actor = value.actor === 'either' ? 'candidate or instructor' : value.actor
  return `${field?.label ?? String(value.parameter)} changed by ${actor}`
}

function triggerSummary(triggers: DynamicScenarioTrigger[]) { return triggers.map(singleTriggerSummary).join(' OR ') }
function safeScenarioFilename(name: string) {
  const safe = name.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'scenario'
  return `${safe}.eduvent-scenario.json`
}
function uniqueImportedName(name: string, presets: InstructorPresetRow[]) {
  const base = name.trim() || 'Imported scenario'
  const names = new Set(presets.map((preset) => preset.name.toLocaleLowerCase()))
  if (!names.has(base.toLocaleLowerCase())) return base
  let suffix = 1
  let candidate = `${base} (imported)`
  while (names.has(candidate.toLocaleLowerCase())) { suffix += 1; candidate = `${base} (imported ${suffix})` }
  return candidate
}
""")
r("""    advanceTrigger: stage.advanceTrigger ?? defaultAdvanceTrigger(),
    apply: {
""","""    advanceTrigger: dynamicStageTriggers(stage)[0],
    advanceTriggers: dynamicStageTriggers(stage),
    apply: {
""")
r("""    sourceName: 'Manual settings',
    advanceTrigger: defaultAdvanceTrigger(),
  }
""","""    sourceName: 'Manual settings',
    advanceTrigger: defaultAdvanceTrigger(),
    advanceTriggers: [defaultAdvanceTrigger()],
  }
""")
r("""  const [message, setMessage] = useState<string | null>(null)
  const [triggerMenuIndex, setTriggerMenuIndex] = useState<number | null>(null)
""","""  const [message, setMessage] = useState<string | null>(null)
  const [triggerMenuIndex, setTriggerMenuIndex] = useState<number | null>(null)
  const scenarioImportInputRef = useRef<HTMLInputElement | null>(null)
""")
r("""  const setAdvanceTrigger = (index: number, advanceTrigger: DynamicScenarioTrigger) => {
    updateStage(index, (stage) => ({ ...stage, advanceTrigger }))
  }

  const chooseTriggerType = (index: number, type: DynamicScenarioTrigger['type']) => {
    const current = draft.stages[index]?.advanceTrigger
    if (current?.type === type) return
    if (type === 'manual') setAdvanceTrigger(index, { type: 'manual' })
    if (type === 'time') setAdvanceTrigger(index, { type: 'time', seconds: 30 })
    if (type === 'condition') setAdvanceTrigger(index, { type: 'condition', metric: 'oxygenSaturation', operator: 'lt', value: 90 })
    if (type === 'action') setAdvanceTrigger(index, { type: 'action', parameter: 'fio2', actor: 'either' })
  }
""","""  const setAdvanceTriggers = (index: number, advanceTriggers: DynamicScenarioTrigger[]) => {
    const next = advanceTriggers.length ? advanceTriggers : [defaultAdvanceTrigger()]
    updateStage(index, (stage) => ({ ...stage, advanceTrigger: next[0], advanceTriggers: next }))
  }
  const updateAdvanceTrigger = (index: number, nextTrigger: DynamicScenarioTrigger) => {
    const stage = draft.stages[index]; if (!stage) return
    setAdvanceTriggers(index, dynamicStageTriggers(stage).map((trigger) => trigger.type === nextTrigger.type ? nextTrigger : trigger))
  }
  const toggleTriggerType = (index: number, type: DynamicScenarioTrigger['type']) => {
    const stage = draft.stages[index]; if (!stage) return
    const triggers = dynamicStageTriggers(stage)
    const selected = triggers.some((trigger) => trigger.type === type)
    if (selected) {
      if (triggers.length === 1) return
      setAdvanceTriggers(index, triggers.filter((trigger) => trigger.type !== type)); return
    }
    setAdvanceTriggers(index, [...triggers, defaultTriggerForType(type)])
  }
""")
r("        schemaVersion: 3,\n","        schemaVersion: 4,\n")
r("""          return {
            ...stage,
            snapshot,
            apply: {
""","""          const triggers = dynamicStageTriggers(stage)
          return {
            ...stage,
            advanceTrigger: triggers[0],
            advanceTriggers: triggers,
            snapshot,
            apply: {
""")
r("""  const remove = async () => {
""","""  const downloadScenario = (preset: InstructorPresetRow) => {
    const payload: PortableScenarioFile = { fileSchema: SCENARIO_FILE_SCHEMA, exportedAt: new Date().toISOString(), scenarioBuilderVersion: SCENARIO_BUILDER_VERSION, name: preset.name, scenario: cloneScenario(preset.scenario) }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = safeScenarioFilename(preset.name)
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
    setMessage(`Downloaded “${preset.name}”.`)
  }

  const importScenario = async (file: File) => {
    setBusy(true); setMessage(null)
    try {
      const parsed = JSON.parse(await file.text()) as Partial<PortableScenarioFile>
      if (parsed.fileSchema !== SCENARIO_FILE_SCHEMA) throw new Error('This is not an EDUVENT scenario file.')
      if (!parsed.scenario || parsed.scenario.kind !== 'dynamic') throw new Error('Only dynamic Scenario Builder files can be imported here.')
      if (!Array.isArray(parsed.scenario.stages) || parsed.scenario.stages.length === 0) throw new Error('The imported scenario has no stages.')
      const importedStages = parsed.scenario.stages.map((stage, index) => normaliseStage(stage, index))
      const scenario: InstructorScenarioSnapshot = { ...cloneScenario(parsed.scenario), schemaVersion: 4, kind: 'dynamic', stages: importedStages.map((stage) => { const triggers = dynamicStageTriggers(stage); return { ...stage, advanceTrigger: triggers[0], advanceTriggers: triggers } }) }
      const saved = await createInstructorPreset(uniqueImportedName(parsed.name ?? 'Imported scenario', [...dynamicPresets, ...staticPresets]), scenario)
      await onRefresh(); replaceDraft(fromPreset(saved)); setMessage(`Imported “${saved.name}”.`)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to import scenario file.') }
    finally { setBusy(false); if (scenarioImportInputRef.current) scenarioImportInputRef.current.value = '' }
  }

  const remove = async () => {
""")
p.write_text(s)
