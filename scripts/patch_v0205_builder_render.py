from pathlib import Path
p=Path('src/components/DynamicScenarioBuilder.tsx')
s=p.read_text()

def r(old,new):
    global s
    if old not in s: raise SystemExit('missing: '+old[:120])
    s=s.replace(old,new,1)

r("                    {draft.stages.length > 1 && (\n                      <button\n                        type=\"button\"\n                        className=\"dynamic-stage-remove\"\n                        onClick={() => removeStage(index)}\n                        aria-label={`Delete Stage ${index + 1}`}\n                      >\n                        ×\n                      </button>\n                    )}\n                  </div>\n\n                  <label className=\"dynamic-stage-source-row\">\n",
  "                    <div className=\"dynamic-stage-title-actions\">\n                      <button\n                        type=\"button\"\n                        className=\"dynamic-stage-collapse\"\n                        onClick={() => toggleStageCollapsed(index)}\n                        aria-label={`${collapsed ? 'Expand' : 'Collapse'} Stage ${index + 1}`}\n                        aria-expanded={!collapsed}\n                        title={collapsed ? 'Expand stage' : 'Collapse stage'}\n                      >{collapsed ? '▸' : '▾'}</button>\n                      {draft.stages.length > 1 && (\n                        <button\n                          type=\"button\"\n                          className=\"dynamic-stage-remove\"\n                          onClick={() => removeStage(index)}\n                          aria-label={`Delete Stage ${index + 1}`}\n                        >\n                          ×\n                        </button>\n                      )}\n                    </div>\n                  </div>\n\n                  <label className=\"dynamic-stage-comment\">\n                    <span>Stage comment</span>\n                    {collapsed\n                      ? <div className={`dynamic-stage-comment-preview ${stage.comment?.trim() ? '' : 'empty'}`}>{stage.comment?.trim() || 'No stage comment'}</div>\n                      : <textarea rows={2} maxLength={800} value={stage.comment ?? ''} placeholder=\"Describe what should happen in this stage, the teaching objective, or what the instructor should look for…\" onChange={(event) => updateStage(index, (current) => ({ ...current, comment: event.target.value }))} />}\n                  </label>\n\n                  {!collapsed && <>\n                  <label className=\"dynamic-stage-source-row\">\n")
r("                  </div>\n                </article>\n\n                <div className=\"dynamic-transition-builder\">\n",
  "                  </div>\n                  </>}\n                </article>\n\n                <div className=\"dynamic-transition-builder\">\n")
r('''                <div className="dynamic-transition-builder">
                  <button
                    type="button"
                    className="dynamic-add-stage"
                    onClick={() => setTriggerMenuIndex((current) => current === index ? null : index)}
                    aria-label={`Configure transition after Stage ${index + 1}`}
                    title="Configure transition after this stage"
                  >
                    ＋
                  </button>
                  <span className="dynamic-trigger-summary">{triggerSummary(dynamicStageTriggers(stage))}</span>
                  {triggerMenuIndex === index && (() => {
                    const triggers = dynamicStageTriggers(stage)
                    const manualTrigger = triggers.find((trigger) => trigger.type === 'manual')
''',
'''                <div className="dynamic-transition-builder">
                  <div className="dynamic-trigger-row" aria-label={`Triggers after Stage ${index + 1}`}>
                    <div className="dynamic-trigger-list">
                      {triggers.map((trigger, triggerIndex) => (
                        <div className="dynamic-trigger-item" key={`${trigger.type}-${triggerIndex}`}>
                          {triggerIndex > 0 && <span className="dynamic-trigger-or">OR</span>}
                          <button type="button" className="dynamic-trigger-chip" onClick={() => setTriggerMenuIndex(index)} title="Edit triggers">{singleTriggerSummary(trigger)}</button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="dynamic-trigger-add"
                      onClick={() => setTriggerMenuIndex((current) => current === index ? null : index)}
                      aria-label={`Add or edit triggers after Stage ${index + 1}`}
                      title="Add or edit triggers"
                    >＋</button>
                  </div>
                  {triggerMenuIndex === index && (() => {
                    const manualTrigger = triggers.find((trigger) => trigger.type === 'manual')
''')
p.write_text(s)
