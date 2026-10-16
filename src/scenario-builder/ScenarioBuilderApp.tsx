import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { DynamicScenarioBuilder } from '../components/DynamicScenarioBuilder'
import {
  getInstructorAccount,
  listInstructorPresets,
  signInInstructor,
  signOutInstructor,
  subscribeToInstructorAccount,
  type InstructorPresetRow,
} from '../instructorAccount'
import { APP_VERSION } from '../appVersion'
import { createDefaultVentilatorScenario } from './modules/ventilator/defaultScenario'
import { DEFAULT_SCENARIO_MODULE_ID, SCENARIO_MODULES } from './modules/registry'
import { SCENARIO_BUILDER_VERSION } from './version'
import './scenarioBuilder.css'

export function ScenarioBuilderApp() {
  const [account, setAccount] = useState<User | null>(null)
  const [presets, setPresets] = useState<InstructorPresetRow[]>([])
  const [moduleId, setModuleId] = useState(DEFAULT_SCENARIO_MODULE_ID)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const defaultScenario = useMemo(() => createDefaultVentilatorScenario(), [])

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

  const dynamicPresets = useMemo(() => presets.filter((preset) => preset.scenario.kind === 'dynamic'), [presets])
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

  const startScenario = (preset: InstructorPresetRow) => {
    const url = new URL('/', window.location.origin)
    url.searchParams.set('scenario', preset.id)
    window.location.assign(url.toString())
  }

  return (
    <main className="scenario-builder-app">
      <header className="scenario-builder-appbar">
        <div>
          <span className="scenario-builder-eyebrow">EDUVENT authoring workspace</span>
          <h1>Scenario Builder</h1>
          <small>Builder v{SCENARIO_BUILDER_VERSION} · Simulator v{APP_VERSION}</small>
        </div>
        <div className="scenario-builder-appbar-actions">
          {account && <span className="scenario-builder-account">{account.email}</span>}
          {account && <button type="button" onClick={() => void signOut()} disabled={busy}>Sign out</button>}
          <button type="button" className="scenario-builder-primary" onClick={() => window.location.assign('/')}>Return to simulator</button>
        </div>
      </header>

      <section className="scenario-builder-modulebar">
        <label>
          <span>Simulation module</span>
          <select value={moduleId} onChange={(event) => setModuleId(event.target.value)}>
            {SCENARIO_MODULES.map((module) => <option key={module.id} value={module.id} disabled={!module.available}>{module.label}</option>)}
          </select>
        </label>
        <div>
          <strong>{selectedModule.label}</strong>
          <p>{selectedModule.description}</p>
        </div>
        <aside>
          <span>Architecture</span>
          <strong>Module-based</strong>
          <small>Future monitor and anaesthesia modules can plug into the same authoring shell.</small>
        </aside>
      </section>

      {loading ? (
        <section className="scenario-builder-state">Loading scenario workspace…</section>
      ) : !account ? (
        <section className="scenario-builder-signin">
          <div>
            <span>Instructor cloud</span>
            <h2>Sign in to author scenarios</h2>
            <p>The builder uses the same instructor account and scenario library as the simulator.</p>
          </div>
          <form onSubmit={signIn}>
            <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
            <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
            <button type="submit" className="scenario-builder-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          {message && <div className="scenario-builder-message">{message}</div>}
        </section>
      ) : moduleId === 'ventilator' ? (
        <section className="scenario-builder-workspace">
          <DynamicScenarioBuilder
            currentScenario={defaultScenario}
            dynamicPresets={dynamicPresets}
            staticPresets={staticPresets}
            simulationPaused
            onSimulationPausedChange={() => undefined}
            onRefresh={refreshPresets}
            onStartScenario={startScenario}
            onClose={() => window.location.assign('/')}
          />
        </section>
      ) : (
        <section className="scenario-builder-state">This simulation module is not yet available.</section>
      )}
    </main>
  )
}

export default ScenarioBuilderApp
