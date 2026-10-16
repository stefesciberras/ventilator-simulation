from pathlib import Path
import re
p=Path('src/components/DynamicScenarioBuilder.tsx')
s=p.read_text()

def r(old,new):
 global s
 if old not in s: raise SystemExit('missing: '+old[:100])
 s=s.replace(old,new,1)

pattern=r'''                <div className="dynamic-transition-builder">.*?                </div>\n              </div>\n            \)'''
replacement='''                <div className="dynamic-transition-builder">
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
                    const timeTrigger = triggers.find((trigger): trigger is Extract<DynamicScenarioTrigger, { type: 'time' }> => trigger.type === 'time')
                    const conditionTrigger = triggers.find((trigger): trigger is Extract<DynamicScenarioTrigger, { type: 'condition' }> => trigger.type === 'condition')
                    const actionTrigger = triggers.find((trigger): trigger is Extract<DynamicScenarioTrigger, { type: 'action' }> => trigger.type === 'action')
                    return <div className="dynamic-trigger-menu">
                      <div className="dynamic-trigger-types">
                        {(['manual', 'time', 'condition', 'action'] as const).map((type) => (
                          <button type="button" key={type} className={triggers.some((trigger) => trigger.type === type) ? 'selected' : ''} onClick={() => toggleTriggerType(index, type)}>
                            {type === 'manual' ? 'Manual' : type === 'time' ? 'Time passed' : type === 'condition' ? 'Condition' : 'Action'}
                          </button>
                        ))}
                      </div>
                      <p>Any selected trigger can advance to the next stage (OR). Manual keeps the instructor trigger available while automatic triggers remain armed.</p>
                      {manualTrigger && <p>Manual: instructor advances from the Teaching tab. Back remains available during the scenario.</p>}
                      {timeTrigger && <label className="dynamic-trigger-field"><span>Time in stage</span><div><input type="number" min={1} max={3600} step={1} value={timeTrigger.seconds} onChange={(event) => updateAdvanceTrigger(index, { ...timeTrigger, seconds: Math.max(1, Number(event.target.value) || 1) })} /><em>seconds</em></div></label>}
                      {conditionTrigger && <div className="dynamic-trigger-condition">
                        <label><span>Measured value</span><select value={conditionTrigger.metric} onChange={(event) => updateAdvanceTrigger(index, { ...conditionTrigger, metric: event.target.value as DynamicScenarioMetric })}>{CONDITION_METRICS.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}</select></label>
                        <label><span>Comparison</span><select value={conditionTrigger.operator} onChange={(event) => updateAdvanceTrigger(index, { ...conditionTrigger, operator: event.target.value as 'lt' | 'eq' | 'gt' })}><option value="lt">Less than (&lt;)</option><option value="eq">Equal to (=)</option><option value="gt">Greater than (&gt;)</option></select></label>
                        <label><span>Value</span><input type="number" step="0.1" value={conditionTrigger.value} onChange={(event) => updateAdvanceTrigger(index, { ...conditionTrigger, value: Number(event.target.value) || 0 })} /></label>
                      </div>}
                      {actionTrigger && <div className="dynamic-trigger-condition">
                        <label><span>Ventilator parameter</span><select value={String(actionTrigger.parameter)} onChange={(event) => updateAdvanceTrigger(index, { ...actionTrigger, parameter: event.target.value as keyof VentilatorSettings })}>{VENT_FIELDS.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label>
                        <label><span>Changed by</span><select value={actionTrigger.actor} onChange={(event) => updateAdvanceTrigger(index, { ...actionTrigger, actor: event.target.value as 'candidate' | 'instructor' | 'either' })}><option value="either">Candidate or instructor</option><option value="candidate">Candidate</option><option value="instructor">Instructor</option></select></label>
                      </div>}
                      <div className="dynamic-trigger-actions"><button type="button" onClick={() => setTriggerMenuIndex(null)}>Close</button>{index === draft.stages.length - 1 && <button type="button" className="account-primary-button" onClick={() => insertStage(index)}>Add next stage</button>}</div>
                    </div>
                  })()}
                </div>
              </div>
            )'''
s,n=re.subn(pattern,replacement,s,count=1,flags=re.S)
if n!=1: raise SystemExit(f'transition block replacements: {n}')

r('''        {selectedPreset && (
          <div className="dynamic-builder-top-actions">
            <button
              type="button"
              className="account-primary-button"
              disabled={busy || dirty}
              onClick={() => { onStartScenario(selectedPreset); onClose() }}
            >
              Start scenario
            </button>
          </div>
        )}
''','''        <div className="dynamic-builder-top-actions">
          <input
            ref={scenarioImportInputRef}
            type="file"
            accept=".json,.eduvent-scenario.json,application/json"
            style={{ display: 'none' }}
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void importScenario(file) }}
          />
          <button type="button" disabled={busy} onClick={() => scenarioImportInputRef.current?.click()}>Import scenario</button>
          {selectedPreset && <button type="button" disabled={busy} onClick={() => downloadScenario(selectedPreset)}>Download scenario</button>}
          {selectedPreset && (
            <button
              type="button"
              className="account-primary-button"
              disabled={busy || dirty}
              onClick={() => { onStartScenario(selectedPreset); onClose() }}
            >
              Start scenario
            </button>
          )}
        </div>
''')
p.write_text(s)
