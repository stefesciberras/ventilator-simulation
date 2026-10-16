import type { InstructorPresetRow } from '../instructorAccount'

interface DynamicScenarioRuntimeLibraryProps {
  presets: InstructorPresetRow[]
  busy: boolean
  onStart: (preset: InstructorPresetRow) => void
}

export function DynamicScenarioRuntimeLibrary({ presets, busy, onStart }: DynamicScenarioRuntimeLibraryProps) {
  return (
    <div className="dynamic-runtime-library">
      <section className="scenario-builder-handoff">
        <div>
          <span>Authoring moved</span>
          <h3>Scenario Builder</h3>
          <p>Build and edit dynamic scenarios in the dedicated authoring workspace. The simulator now concentrates on running them.</p>
        </div>
        <button type="button" className="account-primary-button" onClick={() => window.location.assign('/scenarios')}>Open Scenario Builder</button>
      </section>

      <div className="scenario-library-heading">
        <div><span>Runtime library</span><strong>{presets.length} dynamic {presets.length === 1 ? 'scenario' : 'scenarios'}</strong></div>
        <small>Select a scenario to start Stage 1</small>
      </div>

      <div className="scenario-card-list">
        {presets.length ? presets.map((preset) => {
          const stages = preset.scenario.stages ?? []
          return (
            <article className="scenario-card dynamic-scenario-card" key={preset.id}>
              <div className="scenario-card-heading">
                <div>
                  <span className="scenario-kind-badge">Dynamic</span>
                  <strong>{preset.name}</strong>
                  <small>{stages.length} {stages.length === 1 ? 'stage' : 'stages'}</small>
                </div>
              </div>
              <div className="scenario-card-main">
                {preset.scenario.description
                  ? <p className="scenario-description">{preset.scenario.description}</p>
                  : <p className="scenario-description empty">No instructor notes.</p>}
              </div>
              <div className="scenario-card-actions dynamic-actions">
                <button type="button" className="scenario-load-button" disabled={busy || !stages.length} onClick={() => onStart(preset)}>Start scenario</button>
                <button type="button" disabled={busy} onClick={() => window.location.assign(`/scenarios?scenario=${encodeURIComponent(preset.id)}`)}>Edit in Builder</button>
              </div>
            </article>
          )
        }) : <div className="scenario-empty">No dynamic scenarios saved yet. Open Scenario Builder to create the first one.</div>}
      </div>
    </div>
  )
}
