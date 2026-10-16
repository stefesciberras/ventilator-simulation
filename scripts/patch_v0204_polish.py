from pathlib import Path
p=Path('src/components/DynamicScenarioBuilder.tsx')
s=p.read_text()
def r(old,new):
    global s
    if old not in s:
        raise SystemExit('missing: '+old[:100])
    s=s.replace(old,new,1)
r('''            ...stage,
            advanceTrigger: triggers[0],
            advanceTriggers: triggers,
            snapshot,
''','''            ...stage,
            sourcePresetId: undefined,
            advanceTrigger: triggers[0],
            advanceTriggers: triggers,
            snapshot,
''')
r('''  const importScenario = async (file: File) => {
    setBusy(true); setMessage(null)
''','''  const importScenario = async (file: File) => {
    if (!canDiscard()) { if (scenarioImportInputRef.current) scenarioImportInputRef.current.value = ''; return }
    setBusy(true); setMessage(null)
''')
r('''return { ...stage, advanceTrigger: triggers[0], advanceTriggers: triggers } }) }
''','''return { ...stage, sourcePresetId: undefined, advanceTrigger: triggers[0], advanceTriggers: triggers } }) }
''')
r('''{selectedPreset && <button type="button" disabled={busy} onClick={() => downloadScenario(selectedPreset)}>Download scenario</button>}
''','''{selectedPreset && <button type="button" disabled={busy || dirty} title={dirty ? 'Save changes before downloading the scenario file' : 'Download portable scenario file'} onClick={() => downloadScenario(selectedPreset)}>Download scenario</button>}
''')
p.write_text(s)
