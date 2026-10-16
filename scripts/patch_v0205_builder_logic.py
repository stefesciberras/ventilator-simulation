from pathlib import Path

def r(old,new):
    p=Path('src/components/DynamicScenarioBuilder.tsx'); s=p.read_text()
    if old not in s: raise SystemExit('missing: '+old[:120])
    p.write_text(s.replace(old,new,1))

r("function triggerSummary(triggers: DynamicScenarioTrigger[]) { return triggers.map(singleTriggerSummary).join(' OR ') }\nfunction safeScenarioFilename(name: string) {\n",
  "function ImportScenarioIcon() {\n  return <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 12h10m0 0-3.5-3.5M14 12l-3.5 3.5M17 5h3v14h-3\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.8\" strokeLinecap=\"round\" strokeLinejoin=\"round\" /></svg>\n}\nfunction DownloadScenarioIcon() {\n  return <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 3v11m0 0 4-4m-4 4-4-4M5 20h14\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.8\" strokeLinecap=\"round\" strokeLinejoin=\"round\" /></svg>\n}\nfunction safeScenarioFilename(name: string) {\n")
r("  const [triggerMenuIndex, setTriggerMenuIndex] = useState<number | null>(null)\n  const scenarioImportInputRef = useRef<HTMLInputElement | null>(null)\n",
  "  const [triggerMenuIndex, setTriggerMenuIndex] = useState<number | null>(null)\n  const [collapsedStages, setCollapsedStages] = useState<Set<number>>(() => new Set())\n  const scenarioImportInputRef = useRef<HTMLInputElement | null>(null)\n")
r("  const replaceDraft = (next: ScenarioDraft) => {\n    setDraft(next)\n    baselineRef.current = serialise(next)\n    setMessage(null)\n  }\n",
  "  const replaceDraft = (next: ScenarioDraft) => {\n    setDraft(next)\n    setCollapsedStages(new Set())\n    baselineRef.current = serialise(next)\n    setMessage(null)\n  }\n")
r("  const insertStage = (index: number) => {\n    setDraft((current) => {\n",
  "  const insertStage = (index: number) => {\n    setCollapsedStages(new Set())\n    setDraft((current) => {\n")
r("  const removeStage = (index: number) => {\n    if (draft.stages.length <= 1) return\n    setDraft((current) => ({\n",
  "  const removeStage = (index: number) => {\n    if (draft.stages.length <= 1) return\n    setCollapsedStages(new Set())\n    setDraft((current) => ({\n")
r("  const selectStageSource = (index: number, presetId: string) => {\n",
  "  const toggleStageCollapsed = (index: number) => {\n    setCollapsedStages((current) => {\n      const next = new Set(current)\n      if (next.has(index)) next.delete(index)\n      else next.add(index)\n      return next\n    })\n    setTriggerMenuIndex((current) => current === index ? null : current)\n  }\n\n  const selectStageSource = (index: number, presetId: string) => {\n")
r("          <button type=\"button\" disabled={busy} onClick={() => scenarioImportInputRef.current?.click()}>Import scenario</button>\n          {selectedPreset && <button type=\"button\" disabled={busy || dirty} title={dirty ? 'Save changes before downloading the scenario file' : 'Download portable scenario file'} onClick={() => downloadScenario(selectedPreset)}>Download scenario</button>}\n",
  "          <button type=\"button\" className=\"dynamic-file-icon-button\" disabled={busy} title=\"Import scenario file\" aria-label=\"Import scenario file\" onClick={() => scenarioImportInputRef.current?.click()}><ImportScenarioIcon /></button>\n          {selectedPreset && <button type=\"button\" className=\"dynamic-file-icon-button\" disabled={busy || dirty} title={dirty ? 'Save changes before downloading the scenario file' : 'Download scenario file'} aria-label=\"Download scenario file\" onClick={() => downloadScenario(selectedPreset)}><DownloadScenarioIcon /></button>}\n")
r("            const ventFields = ventKeysFor(stage.snapshot.ventilator)\n              .map((key) => FIELD_BY_KEY.get(String(key)))\n              .filter((field): field is FieldSpec => Boolean(field))\n\n            return (\n",
  "            const ventFields = ventKeysFor(stage.snapshot.ventilator)\n              .map((key) => FIELD_BY_KEY.get(String(key)))\n              .filter((field): field is FieldSpec => Boolean(field))\n            const collapsed = collapsedStages.has(index)\n            const triggers = dynamicStageTriggers(stage)\n\n            return (\n")
