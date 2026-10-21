import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_MONITOR_STATE, type MonitorPatientState } from '../../../edumon/types'
import { RHYTHM_LABELS, RHYTHMS } from '../../../edumon/monitorEngine'
import { createStaticEdumonScenario, type EdumonStoredScenario } from '../../../edumon/scenarioTypes'
import { createProductScenario, deleteProductScenario, listProductScenarios, updateProductScenario, type ProductScenarioRow } from '../../../teaching/scenario/productLibrary'
import type { ScenarioProductId } from '../../../teaching/scenario/products'

interface EdumonScenarioEditorProps {
  product: Extract<ScenarioProductId, 'edumon-ana' | 'edumon-icu'>
  onStartScenario: (row: ProductScenarioRow<EdumonStoredScenario>) => void
}

export function EdumonScenarioEditor({ product, onStartScenario }: EdumonScenarioEditorProps) {
  const [rows, setRows] = useState<Array<ProductScenarioRow<EdumonStoredScenario>>>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [patient, setPatient] = useState<MonitorPatientState>(DEFAULT_MONITOR_STATE)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = async () => {
    const next = await listProductScenarios<EdumonStoredScenario>(product)
    setRows(next)
  }

  useEffect(() => { void refresh().catch((cause) => setMessage(cause instanceof Error ? cause.message : 'Unable to load scenarios.')) }, [product])

  const selected = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId])

  const load = (row: ProductScenarioRow<EdumonStoredScenario>) => {
    const snapshot = row.scenario.definition.stages[0]?.snapshot
    if (!snapshot) return
    setSelectedId(row.id)
    setName(row.name)
    setDescription(row.scenario.description ?? '')
    setPatient(snapshot.patient)
    setMessage(null)
  }

  const clear = () => {
    setSelectedId(null)
    setName('')
    setDescription('')
    setPatient(DEFAULT_MONITOR_STATE)
    setMessage(null)
  }

  const save = async () => {
    const cleanName = name.trim()
    if (!cleanName) { setMessage('Enter a scenario name.'); return }
    setBusy(true); setMessage(null)
    try {
      const scenario = createStaticEdumonScenario(selectedId ?? crypto.randomUUID(), cleanName, { patient, simulationPaused: false, simulationSpeed: 1 }, description)
      if (selectedId) await updateProductScenario(product, selectedId, { name: cleanName, scenario })
      else {
        const created = await createProductScenario(product, cleanName, scenario)
        setSelectedId(created.id)
      }
      await refresh()
      setMessage('Scenario saved.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unable to save scenario.')
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!selectedId) return
    setBusy(true); setMessage(null)
    try {
      await deleteProductScenario(product, selectedId)
      clear()
      await refresh()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unable to delete scenario.')
    } finally { setBusy(false) }
  }

  const updatePatient = <K extends keyof MonitorPatientState,>(key: K, value: MonitorPatientState[K]) => setPatient((current) => ({ ...current, [key]: value }))

  return (
    <div className="scenario-builder-edumon-editor">
      <aside className="scenario-builder-edumon-library">
        <div className="scenario-builder-section-heading"><div><span>Scenario library</span><h2>{product === 'edumon-ana' ? 'EDUMON-Ana' : 'EDUMON-ICU'}</h2></div><button type="button" onClick={clear}>New</button></div>
        {rows.length ? rows.map((row) => <button type="button" key={row.id} className={row.id === selectedId ? 'selected' : ''} onClick={() => load(row)}><strong>{row.name}</strong><small>{row.scenario.description || 'Static monitor scenario'}</small></button>) : <p>No scenarios saved for this simulator yet.</p>}
      </aside>
      <section className="scenario-builder-edumon-form">
        <label><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Scenario name" /></label>
        <label><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label>
        <div className="scenario-builder-field-grid">
          <label><span>Rhythm</span><select value={patient.rhythm} onChange={(event) => updatePatient('rhythm', event.target.value as MonitorPatientState['rhythm'])}>{RHYTHMS.map((rhythm) => <option key={rhythm} value={rhythm}>{RHYTHM_LABELS[rhythm]}</option>)}</select></label>
          <label><span>Heart rate</span><input type="number" min={20} max={240} value={patient.heartRate} onChange={(event) => updatePatient('heartRate', Number(event.target.value))} /></label>
          <label><span>Systolic pressure</span><input type="number" min={40} max={260} value={patient.systolicPressure} onChange={(event) => updatePatient('systolicPressure', Number(event.target.value))} /></label>
          <label><span>Diastolic pressure</span><input type="number" min={20} max={160} value={patient.diastolicPressure} onChange={(event) => updatePatient('diastolicPressure', Number(event.target.value))} /></label>
          <label><span>SpO₂</span><input type="number" min={50} max={100} value={patient.spo2} onChange={(event) => updatePatient('spo2', Number(event.target.value))} /></label>
          <label><span>Peripheral perfusion</span><input type="number" min={0} max={1} step={0.05} value={patient.peripheralPerfusion} onChange={(event) => updatePatient('peripheralPerfusion', Number(event.target.value))} /></label>
        </div>
        <div className="scenario-builder-editor-actions">
          <button type="button" className="scenario-builder-primary" onClick={() => void save()} disabled={busy}>{selectedId ? 'Save changes' : 'Save scenario'}</button>
          {selected && <button type="button" onClick={() => onStartScenario(selected)}>Open in simulator</button>}
          {selectedId && <button type="button" onClick={() => void remove()} disabled={busy}>Delete</button>}
        </div>
        {message && <div className="scenario-builder-message">{message}</div>}
        <p className="scenario-builder-state">This first product-aware EDUMON editor saves static monitor states. Dynamic stages use the same shared runtime and will be added to this editor next.</p>
      </section>
    </div>
  )
}
