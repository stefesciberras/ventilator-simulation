import { useMemo, useState } from 'react'

export interface InstructorScenarioLibraryItem<TScenario> {
  id: string
  name: string
  scenario: TScenario
  updated_at: string
}

export interface InstructorScenarioLibraryControllerProps<TScenario> {
  authenticated: boolean
  accountLabel?: string | null
  items: InstructorScenarioLibraryItem<TScenario>[]
  busy: boolean
  message?: string | null
  scenarioKind: (scenario: TScenario) => 'static' | 'dynamic'
  descriptionFor: (scenario: TScenario) => string
  summaryFor: (scenario: TScenario) => string[]
  onRefresh: () => void | Promise<unknown>
  onLoad: (item: InstructorScenarioLibraryItem<TScenario>) => void | Promise<unknown>
  onStart: (item: InstructorScenarioLibraryItem<TScenario>) => void | Promise<unknown>
  onSaveCurrent: (name: string, description: string) => void | Promise<unknown>
  onDuplicate: (item: InstructorScenarioLibraryItem<TScenario>) => void | Promise<unknown>
  onDelete: (item: InstructorScenarioLibraryItem<TScenario>) => void | Promise<unknown>
  onSignIn: () => void
  builderHref?: string
  productLabel: string
}

function ScenarioIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v13H5z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M8 9h8M8 12h5M8 15h7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M8 3.5h8v4H8z" fill="#0e171c" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
}

export function InstructorScenarioLibraryController<TScenario>(props: InstructorScenarioLibraryControllerProps<TScenario>) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'static' | 'dynamic'>('static')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const filtered = useMemo(() => props.items.filter((item) => props.scenarioKind(item.scenario) === tab), [props.items, props.scenarioKind, tab])
  const openLibrary = () => { setOpen(true); void props.onRefresh() }
  return <>
    <button type="button" className="top-account-button scenario-top-button" title="Instructor scenarios" aria-label="Open instructor scenarios" onClick={openLibrary}><ScenarioIcon /></button>
    {open && <div className="account-dialog-backdrop" onMouseDown={() => setOpen(false)}>
      <section className="account-dialog scenario-manager-dialog" role="dialog" aria-modal="true" aria-label="Instructor scenarios" onMouseDown={(event) => event.stopPropagation()}>
        <div className="account-dialog-heading"><div><span>Instructor tools</span><h2>Scenarios</h2></div><button type="button" className="account-close-button" onClick={() => setOpen(false)}>×</button></div>
        <div className="scenario-type-tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === 'static'} className={tab === 'static' ? 'selected' : ''} onClick={() => setTab('static')}>Static presets</button><button type="button" role="tab" aria-selected={tab === 'dynamic'} className={tab === 'dynamic' ? 'selected' : ''} onClick={() => setTab('dynamic')}>Dynamic scenarios</button></div>
        {!props.authenticated ? <div className="scenario-signin-card"><strong>Cloud account required</strong><p>Scenarios are saved privately to your instructor account and are available on any device.</p><button type="button" className="account-primary-button" onClick={() => { setOpen(false); props.onSignIn() }}>Sign in to instructor account</button></div> : <>
          {tab === 'static' ? <section className="scenario-create-card"><div className="scenario-settings-heading"><div><span>New static preset</span><h3>Capture current simulator state</h3></div><small>{props.accountLabel}</small></div><div className="scenario-create-fields"><label><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="e.g. Initial state" /></label><label><span>Instructor notes</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} /></label></div><button type="button" className="account-primary-button scenario-save-current" disabled={props.busy || !name.trim()} onClick={() => { void Promise.resolve(props.onSaveCurrent(name.trim(), description.trim())).then(() => { setName(''); setDescription('') }) }}>Save current state as preset</button></section> : <section className="scenario-create-card"><div className="scenario-settings-heading"><div><span>Dynamic scenario authoring</span><h3>Use LoppjuSIM-Studio</h3></div></div><p className="scenario-description">Stages, branches, triggers, media, questions, import/export and publishing are maintained in the product-aware LoppjuSIM-Studio workspace.</p>{props.builderHref && <a className="account-primary-button scenario-save-current" href={props.builderHref}>Open LoppjuSIM-Studio</a>}</section>}
          <div className="scenario-library-heading"><div><span>Library</span><strong>{filtered.length} {tab === 'static' ? 'static preset' : 'dynamic scenario'}{filtered.length === 1 ? '' : 's'}</strong></div><small>Most recently updated first</small></div>
          <div className="scenario-card-list">{filtered.length ? filtered.map((item) => <article className="scenario-card" key={item.id}><div className="scenario-card-heading"><div><span className="scenario-kind-badge">{tab === 'static' ? 'Static' : 'Dynamic'}</span><strong>{item.name}</strong><small>Updated {new Date(item.updated_at).toLocaleString()}</small></div></div><div className="scenario-card-view"><div className="scenario-card-main">{props.descriptionFor(item.scenario) ? <p className="scenario-description">{props.descriptionFor(item.scenario)}</p> : <p className="scenario-description empty">No instructor notes.</p>}<div className="scenario-summary-chips">{props.summaryFor(item.scenario).map((value) => <span key={value}>{value}</span>)}</div></div><div className="scenario-card-actions">{tab === 'static' && <button type="button" className="scenario-load-button" disabled={props.busy} onClick={() => { void props.onLoad(item); setOpen(false) }}>Load</button>}<button type="button" className={tab === 'dynamic' ? 'scenario-load-button' : ''} disabled={props.busy} onClick={() => { void props.onStart(item); setOpen(false) }}>{tab === 'dynamic' ? 'Start' : 'Start session'}</button><button type="button" disabled={props.busy} onClick={() => void props.onDuplicate(item)}>Duplicate</button><button type="button" className="scenario-delete-button" disabled={props.busy} onClick={() => void props.onDelete(item)}>Delete</button></div></div></article>) : <div className="scenario-empty">No {tab === 'static' ? 'static presets' : 'dynamic scenarios'} saved yet.</div>}</div>
        </>}
        {props.message && <div className="account-message">{props.message}</div>}
      </section>
    </div>}
  </>
}
