from pathlib import Path

p = Path('src/components/InstructorAccountControls.tsx')
s = p.read_text()
old = "{runtimeHost && activeRuntimePreset && (role === 'instructor' || Boolean(selfDirectedRun)) && createPortal((() => {"
new = "{runtimeHost && activeRuntimePreset && role === 'instructor' && createPortal((() => {"
if old not in s:
    raise SystemExit('runtime host condition not found')
s = s.replace(old, new, 1)

marker = "      })(), runtimeHost)}\n      {runtimeHost && selfDirectedError && createPortal("
overlay = '''      })(), runtimeHost)}
      {selfDirectedRun && activeRuntimePreset && createPortal((() => {
        const stages = activeRuntimePreset.scenario.stages ?? []
        const index = Math.min(activeDynamicStage, Math.max(0, stages.length - 1))
        const stage = stages[index]
        const triggers: DynamicScenarioTrigger[] = stage ? dynamicStageTriggers(stage) : [{ type: 'manual' }]
        const completed = index >= stages.length - 1
        const manualTrigger = !completed && triggers.some((trigger) => trigger.type === 'manual')
        const exitSelfDirectedScenario = () => {
          setSelfDirectedRun(null)
          setActiveDynamicId(null)
          setActiveDynamicStage(0)
          const url = new URL(window.location.href)
          url.searchParams.delete('assignment')
          window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
          setPresetMessage('Self-directed scenario closed.')
        }
        return <div className="self-directed-scenario-overlay" role="presentation">
          <section className="self-directed-scenario-modal" role="dialog" aria-modal="false" aria-label="Active scenario">
            <div className="self-directed-scenario-header">
              <div><span>Active scenario</span><strong>{activeRuntimePreset.name}</strong></div>
              <button type="button" onClick={exitSelfDirectedScenario}>Exit</button>
            </div>
            <div className="self-directed-scenario-body">
              {completed ? (
                <div className="self-directed-scenario-status complete"><strong>Scenario complete</strong><span>You have reached the end of this scenario.</span></div>
              ) : manualTrigger ? (
                <button type="button" className="self-directed-scenario-continue" onClick={() => loadDynamicStage(activeRuntimePreset, index + 1)}>Continue</button>
              ) : (
                <div className="self-directed-scenario-status"><strong>Scenario active</strong><span>Continue working with the simulator.</span></div>
              )}
            </div>
          </section>
        </div>
      })(), document.body)}
      {runtimeHost && selfDirectedError && createPortal('''
if marker not in s:
    raise SystemExit('self-directed insertion marker not found')
s = s.replace(marker, overlay, 1)
p.write_text(s)

css = Path('src/account.css')
c = css.read_text()
block = '''

/* Scenario Builder v0.3.1 candidate active-scenario overlay */
.self-directed-scenario-overlay {
  position: fixed;
  inset: 0;
  z-index: 7800;
  pointer-events: none;
}
.self-directed-scenario-modal {
  position: absolute;
  top: 88px;
  right: 18px;
  width: min(390px, calc(100vw - 36px));
  pointer-events: auto;
  border: 1px solid #405762;
  background: #0d181e;
  box-shadow: 0 22px 65px rgba(0,0,0,.58);
  color: #dce8ec;
}
.self-directed-scenario-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 13px 14px;
  border-bottom: 1px solid #2d414a;
}
.self-directed-scenario-header > div { min-width: 0; }
.self-directed-scenario-header span {
  display: block;
  color: #79a0af;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .11em;
  text-transform: uppercase;
}
.self-directed-scenario-header strong {
  display: block;
  margin-top: 4px;
  color: #eff7f9;
  font-size: 15px;
  overflow-wrap: anywhere;
}
.self-directed-scenario-header button {
  flex: 0 0 auto;
  padding: 6px 9px;
  border-radius: 0;
  color: #b8c7cd;
}
.self-directed-scenario-body { padding: 13px 14px; }
.self-directed-scenario-continue {
  width: 100%;
  min-height: 48px;
  border-radius: 0;
  border-color: #4e9764;
  background: #173821;
  color: #e3f9e9;
  font-size: 15px;
  font-weight: 700;
}
.self-directed-scenario-status { display: grid; gap: 4px; }
.self-directed-scenario-status strong { color: #dce8ec; font-size: 12px; }
.self-directed-scenario-status span { color: #82969f; font-size: 10px; line-height: 1.45; }
.self-directed-scenario-status.complete strong { color: #9ee9b3; }
@media (max-width: 680px) {
  .self-directed-scenario-modal { top: auto; right: 12px; bottom: 12px; left: 12px; width: auto; }
}
'''
if 'Scenario Builder v0.3.1 candidate active-scenario overlay' not in c:
    css.write_text(c + block)

v = Path('src/scenario-builder/version.ts')
text = v.read_text()
text = text.replace("SCENARIO_BUILDER_VERSION = '0.3.0'", "SCENARIO_BUILDER_VERSION = '0.3.1'")
v.write_text(text)
