import type { EdumonScenarioSnapshot } from '../../../edumon/scenarioTypes'
import { ANAESTH_SCENARIO_MONITORING_CONTROLS } from '../../../edumon/scenarioMonitoring'

interface EdumonScenarioMonitoringEditorProps {
  snapshot: EdumonScenarioSnapshot
  appliedVariableIds?: string[]
  onAppliedVariableIdsChange?: (ids: string[]) => void
  onChange: (snapshot: EdumonScenarioSnapshot) => void
}

export function EdumonScenarioMonitoringEditor({ snapshot, appliedVariableIds, onAppliedVariableIdsChange, onChange }: EdumonScenarioMonitoringEditorProps) {
  const selected = new Set(appliedVariableIds ?? [])

  const setApplied = (id: string, enabled: boolean) => {
    const next = new Set(selected)
    if (enabled) next.add(id)
    else next.delete(id)
    onAppliedVariableIdsChange?.([...next])
  }

  const setEnabled = (key: (typeof ANAESTH_SCENARIO_MONITORING_CONTROLS)[number]['key'], enabled: boolean) => {
    onChange({
      ...snapshot,
      monitoring: {
        ...(snapshot.monitoring ?? {}),
        [key]: enabled,
      },
    })
  }

  return (
    <section className="shared-scenario-control-group monitor" aria-label="Monitoring">
      <h3>Monitoring</h3>
      <div className="shared-scenario-slider-grid">
        {ANAESTH_SCENARIO_MONITORING_CONTROLS.map((control) => {
          const applied = selected.has(control.id)
          const enabled = snapshot.monitoring?.[control.key] ?? false
          return (
            <div key={control.id} className={`shared-scenario-variable-row ${applied ? 'applied' : 'not-applied'}`}>
              <div className="shared-scenario-variable-heading">
                <label className="shared-scenario-apply-toggle">
                  <input type="checkbox" checked={applied} onChange={(event) => setApplied(control.id, event.target.checked)} />
                  <span>Apply</span>
                </label>
                <span className="shared-scenario-variable-label">{control.label}</span>
                <strong>{enabled ? 'On' : 'Off'}</strong>
              </div>
              <label className="shared-scenario-boolean-control">
                <input type="checkbox" disabled={!applied} checked={enabled} onChange={(event) => setEnabled(control.key, event.target.checked)} />
                <span>{enabled ? 'Displayed' : 'Hidden'}</span>
              </label>
            </div>
          )
        })}
      </div>
    </section>
  )
}
