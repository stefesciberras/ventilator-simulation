import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  getInstructorAccount,
  listInstructorPresets,
  signInInstructor,
  signOutInstructor,
  subscribeToInstructorAccount,
  type InstructorPresetRow,
} from '../instructorAccount'
import { SimulationAboutDialog } from '../components/SimulationAboutDialog'
import { createDefaultVentilatorScenario } from './modules/ventilator/defaultScenario'
import { VentilatorScenarioEditor } from './modules/ventilator/VentilatorScenarioEditor'
import { EdumonScenarioEditor } from './modules/edumon/EdumonScenarioEditor'
import { ProfileEditor } from './ProfileEditor'
import { OrganisationManager } from './OrganisationManager'
import type { EdumonStoredScenario } from '../edumon/scenarioTypes'
import type { ProductScenarioRow } from '../teaching/scenario/productLibrary'
import { SCENARIO_PRODUCTS, type ScenarioProductId } from '../teaching/scenario/products'
import { DEFAULT_SCENARIO_MODULE_ID, SCENARIO_MODULES } from './modules/registry'
import { SCENARIO_BUILDER_VERSION } from './version'
import './scenarioBuilder.css'
import './clinicalSections.css'
import './scenarioStudioLight.css'

type StudioResource = 'scenarios' | 'profiles' | 'organisation'

function moduleIdFromProduct(product: string | null) {
  if (product === 'anaesth') return 'anaesth'
  if (product === 'icu') return 'icu'
  if (product === 'mv') return 'ventilator'
  return DEFAULT_SCENARIO_MODULE_ID
}

function productFromModuleId(moduleId: string): ScenarioProductId {
  if (moduleId === 'anaesth') return 'anaesth'
  if (moduleId === 'icu') return 'icu'
  return 'mv'
}

export function ScenarioBuilderApp() {
  const [account, setAccount] = useState<User | null>(null)
  const [presets, setPresets] = useState<InstructorPresetRow[]>([])
  const [moduleId, setModuleId] = useState(() => moduleIdFromProduct(new URLSearchParams(window.location.search).get('product')))
  const [resource, setResource] = useState<StudioResource>('scenarios')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const launchingScenarioRef = useRef(false)
  const defaultScenario = useMemo(() => createDefaultVentilatorScenario(), [])
  const requestedScenarioId = useMemo(() => new URLSearchParams(window.location.search).get('scenario'), [])

  const refreshPresets = async () => {
    const next = await listInstructorPresets()
    setPresets(next)
  }

  useEffect(() => {
    let active = true
    void getInstructorAccount()
      .then(async (user) => {
        if (!active) return
        setAccount(user)
        if (user) await refreshPresets()
      })
      .catch((cause) => active && setMessage(cause instanceof Error ? cause.message : 'Unable to connect to the instructor account.'))
      .finally(() => active && setLoading(false))

    const unsubscribe = subscribeToInstructorAccount((user) => {
      if (!active) return
      setAccount(user)
      if (user) void refreshPresets()
      else setPresets([])
    })
    return () => { active = false; unsubscribe() }
  }, [])

  const dynamicPresets = useMemo(() => {
    const items = presets.filter((preset) => preset.scenario.kind === 'dynamic')
    if (!requestedScenarioId) return items
    return [...items].sort((a, b) => Number(b.id === requestedScenarioId) - Number(a.id === requestedScenarioId))
  }, [presets, requestedScenarioId])
  const staticPresets = useMemo(() => presets.filter((preset) => (preset.scenario.kind ?? 'static') === 'static'), [presets])
  const selectedModule = SCENARIO_MODULES.find((module) => module.id === moduleId) ?? SCENARIO_MODULES[0]

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const user = await signInInstructor(email, password)
      setAccount(user)
      setPassword('')
      await refreshPresets()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unable to sign in.')
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    setBusy(true)
    try {
      await signOutInstructor()
      setAccount(null)
      setPresets([])
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unable to sign out.')
    } finally {
      setBusy(false)
    }
  }

  const startProductScenario = (product: ScenarioProductId, id: string) => {
    launchingScenarioRef.current = true
    const url = new URL(SCENARIO_PRODUCTS[product].route, window.location.origin)
    url.searchParams.set('scenario', id)
    window.location.assign(url.toString())
  }

  const startScenario = (preset: InstructorPresetRow) => startProductScenario(preset.product ?? 'mv', preset.id)
  const startEdumonScenario = (row: ProductScenarioRow<EdumonStoredScenario>) => startProductScenario(row.product, row.id)

  const selectModule = (nextModuleId: string) => {
    setModuleId(nextModuleId)
    const url = new URL(window.location.href)
    url.searchParams.set('product', productFromModuleId(nextModuleId))
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }

  const closeBuilder = () => {
    if (launchingScenarioRef.current) return
    window.location.assign('/')
  }

  return (
    <main className="scenario-builder-app">
      <SimulationAboutDialog
        open={aboutOpen}
        productLabel="LoppjuSIM-Studio"
        title="Simulation Studio"
        description="The shared LoppjuSIM authoring workspace for scenarios, organisation patient libraries and simulation actions."
        version={SCENARIO_BUILDER_VERSION}
        onClose={() => setAboutOpen(false)}
        legalContext="authoring"
      />
      <header className="scenario-builder-appbar">
        <div>
          <span className="scenario-builder-eyebrow">Simulation authoring workspace</span>
          <h1>LoppjuSIM-Studio</h1>
          <small>Studio v{SCENARIO_BUILDER_VERSION} · LoppjuSIM shared authoring framework</small>
        </div>
        <div className="scenario-builder-appbar-actions">
          {account && <span className="scenario-builder-account">{account.email}</span>}
          {account && <button type="button" onClick={() => void signOut()} disabled={busy}>Sign out</button>}
          <button type="button" onClick={() => setAboutOpen(true)}>About</button>
          <button type="button" className="scenario-builder-primary" onClick={closeBuilder}>Return to LoppjuSIM</button>
        </div>
      </header>

      {resource !== 'organisation' && <section className="scenario-builder-modulebar">
        <label>
          <span>Simulation module</span>
          <select value={moduleId} onChange={(event) => selectModule(event.target.value)}>
            {SCENARIO_MODULES.map((module) => <option key={module.id} value={module.id} disabled={!module.available}>{module.label}</option>)}
          </select>
        </label>
        <div>
          <strong>{selectedModule.label}</strong>
          <p>{selectedModule.description}</p>
        </div>
      </section>}

      <nav className="scenario-builder-resourcebar" aria-label="Studio resources">
        <button type="button" className={resource === 'scenarios' ? 'selected' : ''} onClick={() => setResource('scenarios')}>Scenarios</button>
        <button type="button" className={resource === 'profiles' ? 'selected' : ''} onClick={() => setResource('profiles')}>Patient</button>
        <button type="button" className={resource === 'organisation' ? 'selected' : ''} onClick={() => setResource('organisation')}>Organisation</button>
        <button type="button" onClick={() => window.location.assign('/actions')}>Actions</button>
      </nav>

      {loading ? (
        <section className="scenario-builder-state">Loading Studio workspace…</section>
      ) : !account ? (
        <section className="scenario-builder-signin">
          <div>
            <span>Instructor cloud</span>
            <h2>Sign in to LoppjuSIM-Studio</h2>
            <p>Organisation membership and shared libraries use your permanent instructor account.</p>
          </div>
          <form onSubmit={signIn}>
            <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
            <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
            <button type="submit" className="scenario-builder-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          {message && <div className="scenario-builder-message">{message}</div>}
        </section>
      ) : resource === 'organisation' ? (
        <section className="scenario-builder-workspace"><OrganisationManager /></section>
      ) : resource === 'profiles' ? (
        <section className="scenario-builder-workspace">
          <ProfileEditor product={moduleId === 'ventilator' ? 'mv' : moduleId === 'anaesth' ? 'anaesth' : 'icu'} />
        </section>
      ) : moduleId === 'ventilator' ? (
        <section className="scenario-builder-workspace">
          <VentilatorScenarioEditor
            seedScenario={defaultScenario}
            dynamicPresets={dynamicPresets}
            staticPresets={staticPresets}
            onRefresh={refreshPresets}
            onStartScenario={startScenario}
            onClose={closeBuilder}
          />
        </section>
      ) : moduleId === 'anaesth' || moduleId === 'icu' ? (
        <section className="scenario-builder-workspace">
          <EdumonScenarioEditor product={moduleId} onStartScenario={startEdumonScenario} />
        </section>
      ) : (
        <section className="scenario-builder-state">
          <span>{selectedModule.shortLabel}</span>
          <h2>{selectedModule.label}</h2>
          <p>{selectedModule.description}</p>
        </section>
      )}
    </main>
  )
}
